// Campaign state, autosaved to localStorage. (A shared database will replace this later.)

const STORAGE_KEY = 'brs-roster:state';
const DATA_VERSION = 1;

function newId() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function emptyElement() {
  return { plane: '', size: 2, pilots: [null, null] };
}

function defaultState() {
  const state = {
    version: DATA_VERSION,
    campaignName: 'Campaign 1 — The Western Front & Defence of Britain',
    sides: {},
    missions: {},
  };
  for (const side of SIDE_KEYS) {
    state.sides[side] = { squadronName: '', player: '', pilots: [] };
  }
  return normalizeState(state);
}

// Fills in anything missing so older data still loads.
function normalizeState(state) {
  state.version = DATA_VERSION;
  state.sides = state.sides || {};
  state.missions = state.missions || {};
  for (const side of SIDE_KEYS) {
    const s = state.sides[side] = Object.assign({ squadronName: '', player: '', pilots: [] }, state.sides[side]);
    s.pilots = s.pilots.map(p => Object.assign({
      id: newId(), name: '', startSkill: 3, startXp: 0, joined: 0, status: 'Active',
      aceSkills: [], namedAceBonus: '', xpAdjust: 0, killsAdjust: 0, notes: '',
    }, p));
  }
  for (const m of MISSIONS) {
    const mission = state.missions[m.turn] = Object.assign({ winner: '', vp: {}, notes: '', lists: {}, results: {} }, state.missions[m.turn]);
    for (const side of SIDE_KEYS) {
      if (mission.vp[side] === undefined) mission.vp[side] = '';
      const list = mission.lists[side] = Object.assign({ elements: [emptyElement(), emptyElement()] }, mission.lists[side]);
      for (const el of list.elements) {
        el.size = Number(el.size) || 2;
        el.pilots = (el.pilots || []).slice(0, el.size);
        while (el.pilots.length < el.size) el.pilots.push(null);
      }
    }
  }
  return state;
}

const Store = {
  state: null,
  listeners: [],

  init() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      this.state = raw ? normalizeState(JSON.parse(raw)) : defaultState();
    } catch (e) {
      console.error('Could not load saved campaign', e);
      this.state = defaultState();
    }
  },

  onChange(fn) { this.listeners.push(fn); },

  // Call after every edit to state.
  commit() {
    normalizeState(this.state);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.error('Autosave failed', e);
    }
    for (const fn of this.listeners) fn();
  },

  replace(state) {
    this.state = normalizeState(state);
    this.commit();
  },

  exportBackup() {
    const blob = new Blob([JSON.stringify(this.state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `brs-campaign-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  },

  importBackup() {
    const input = document.getElementById('file-input');
    input.value = '';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!data || !data.sides || !data.missions) throw new Error('This does not look like a campaign backup.');
        if (confirm('Replace everything in the app with this backup?')) this.replace(data);
      } catch (e) {
        alert('Could not import: ' + e.message);
      }
    };
    input.click();
  },
};
