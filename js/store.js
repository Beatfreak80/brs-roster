// Campaign state: autosaved to localStorage, saved to / opened from a JSON file on disk.

const STORAGE_KEY = 'brs-roster:state';
const META_KEY = 'brs-roster:meta';
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

// Fills in anything missing so older or hand-edited files still load.
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
    const mission = state.missions[m.turn] = Object.assign({ winner: '', notes: '', lists: {}, results: {} }, state.missions[m.turn]);
    for (const side of SIDE_KEYS) {
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
  fileHandle: null,
  meta: { fileName: '', dirty: false },
  listeners: [],

  init() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      this.state = raw ? normalizeState(JSON.parse(raw)) : defaultState();
      this.meta = Object.assign(this.meta, JSON.parse(localStorage.getItem(META_KEY) || '{}'));
    } catch (e) {
      console.error('Could not load saved campaign', e);
      this.state = defaultState();
    }
  },

  onChange(fn) { this.listeners.push(fn); },
  notify() { for (const fn of this.listeners) fn(); },

  persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      localStorage.setItem(META_KEY, JSON.stringify(this.meta));
    } catch (e) {
      console.error('Autosave failed', e);
    }
  },

  // Call after every edit to state.
  commit() {
    normalizeState(this.state);
    this.meta.dirty = true;
    this.persist();
    this.notify();
  },

  replace(state, fileName) {
    this.state = normalizeState(state);
    this.meta = { fileName: fileName || '', dirty: false };
    this.fileHandle = null;
    this.persist();
    this.notify();
  },

  toJson() {
    return JSON.stringify(this.state, null, 2);
  },

  parse(text) {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || !data.sides || !data.missions) {
      throw new Error('This does not look like a campaign file.');
    }
    return data;
  },

  async open() {
    if (window.showOpenFilePicker) {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Campaign file', accept: { 'application/json': ['.json'] } }],
      });
      const file = await handle.getFile();
      this.replace(this.parse(await file.text()), file.name);
      this.fileHandle = handle;
      this.notify();
      return;
    }
    // Fallback for browsers without the File System Access API.
    const input = document.getElementById('file-input');
    input.value = '';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        this.replace(this.parse(await file.text()), file.name);
      } catch (e) {
        alert('Could not open file: ' + e.message);
      }
    };
    input.click();
  },

  async save() {
    if (this.fileHandle) {
      const writable = await this.fileHandle.createWritable();
      await writable.write(this.toJson());
      await writable.close();
      this.meta.dirty = false;
      this.persist();
      this.notify();
      return;
    }
    return this.saveAs();
  },

  async saveAs() {
    const suggestedName = this.meta.fileName || 'brs-campaign.json';
    if (window.showSaveFilePicker) {
      this.fileHandle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'Campaign file', accept: { 'application/json': ['.json'] } }],
      });
      this.meta.fileName = this.fileHandle.name;
      return this.save();
    }
    const blob = new Blob([this.toJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = suggestedName;
    a.click();
    URL.revokeObjectURL(a.href);
    this.meta.fileName = suggestedName;
    this.meta.dirty = false;
    this.persist();
    this.notify();
  },
};
