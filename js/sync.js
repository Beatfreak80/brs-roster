// Shared campaign data, kept as JSON files on GitHub so both players see the same campaign.
//
// The data is split into two files on the repo's "data" branch, each written by one player only:
//  - main: the Luftwaffe roster, the missions and everything else (written by the Luftwaffe player)
//  - gb:   the RAF roster and RAF mission lists (written by the RAF player)
// Both tokens can write the whole repo; the app decides which file each player saves.
// Separate files mean the two players never overwrite each other.
// Edits are saved on the phone straight away and sent to GitHub 5 seconds after the last change.
// Other changes are fetched when the app opens, when it comes back to the front, and every minute.

const SYNC_KEY = 'brs-roster:sync';
const SYNC_DELAY = 5000;
const SYNC_POLL = 60000;
const MAIN_SIDE = 'de';

const SYNC_FILES = {
  main: { owner: 'Beatfreak80', repo: 'brs-roster', branch: 'data', path: 'campaign.json', writer: 'de', label: 'Luftwaffe & missions' },
  gb: { owner: 'Beatfreak80', repo: 'brs-roster', branch: 'data', path: 'raf.json', writer: 'gb', label: 'RAF roster' },
};

// Which part of the state each file holds.
// The RAF file holds the RAF roster and the RAF list for each mission; the main file holds the rest.
function fileContent(key, state) {
  const turns = Object.keys(state.missions);
  if (key === 'gb') {
    return { version: state.version, side: state.sides.gb, lists: Object.fromEntries(turns.map(t => [t, state.missions[t].lists.gb])) };
  }
  const missions = Object.fromEntries(turns.map(t => {
    const m = state.missions[t];
    return [t, Object.assign({}, m, { lists: { de: m.lists.de } })];
  }));
  return { version: state.version, campaignName: state.campaignName, sides: { de: state.sides.de }, missions };
}

function applyFileContent(key, data, state) {
  if (key === 'gb') {
    state.sides.gb = data.side;
    // Older RAF files had no lists; then the ones already here (from the main file) are kept.
    for (const [t, list] of Object.entries(data.lists || {})) {
      if (state.missions[t] && list) state.missions[t].lists.gb = list;
    }
  } else {
    const rafLists = Object.fromEntries(Object.entries(state.missions).map(([t, m]) => [t, m.lists && m.lists.gb]));
    state.campaignName = data.campaignName;
    state.sides.de = data.sides.de;
    state.missions = data.missions;
    for (const [t, m] of Object.entries(state.missions)) {
      m.lists = m.lists || {};
      // RAF lists come from the RAF file; older main files still carried them, used until then.
      if (rafLists[t]) m.lists.gb = rafLists[t];
    }
  }
}

function serialize(key, state) {
  return JSON.stringify(fileContent(key, state), null, 2);
}

function hasData(key, state) {
  const c = fileContent(key, state);
  if (key === 'gb') return c.side.pilots.length > 0 || !!c.side.squadronName;
  return c.sides.de.pilots.length > 0 || !!c.sides.de.squadronName || Object.values(c.missions).some(m => m.winner || m.lists.de.elements.some(e => e.plane));
}

// Who keeps each part of the data. Paths look like "sides.gb.pilots.#id.name", "missions.3.lists.gb.elements.0.plane" or "missions.3.vp.de".
function pathOwner(path) {
  const m = String(path).match(/^sides\.(\w+)\./) || String(path).match(/^missions\.\d+\.lists\.(\w+)\./);
  return m ? m[1] : MAIN_SIDE;
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToUtf8(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const Sync = {
  // Saved per device: { side: 'de' | 'gb' | 'view', token, files: { main: { sha, json }, gb: { sha, json } } }
  config: null,
  status: 'off', // off | idle | pending | saving | error
  message: '',
  lastSync: null,
  timer: null,
  busy: false,

  load() {
    try { this.config = JSON.parse(localStorage.getItem(SYNC_KEY) || 'null'); } catch (e) { this.config = null; }
    if (this.config) this.config.files = this.config.files || {};
  },
  save() {
    try { localStorage.setItem(SYNC_KEY, JSON.stringify(this.config)); } catch (e) { /* sync metadata is rebuilt on next pull */ }
  },

  enabled() { return !!(this.config && this.config.side); },
  side() { return this.enabled() ? this.config.side : null; },
  // With sharing off, everything is editable as before.
  canEdit(owner) { return !this.enabled() || this.config.side === owner; },
  ownFile() {
    const side = this.side();
    return Object.keys(SYNC_FILES).find(k => SYNC_FILES[k].writer === side) || null;
  },

  setStatus(status, message = '') {
    this.status = status;
    this.message = message;
    const el = document.getElementById('sync-status');
    if (el) el.outerHTML = this.badge();
  },

  badge() {
    if (!this.enabled()) return '<span id="sync-status" hidden></span>';
    const text = {
      idle: this.lastSync ? `Saved ✓ ${this.lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Connected',
      pending: 'Unsaved changes…',
      saving: 'Saving…',
      error: 'Not saved, will retry',
    }[this.status] || '';
    return `<a id="sync-status" class="sync-badge sync-${this.status}" href="#/sync" title="${esc(this.message)}">${text}</a>`;
  },

  dirty(key) {
    const meta = this.config.files[key];
    return !!(meta && meta.json !== undefined && meta.json !== serialize(key, Store.state));
  },

  async api(url, opts = {}) {
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (this.config.token) headers.Authorization = `Bearer ${this.config.token}`;
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch(url, Object.assign({ cache: 'no-store' }, opts, { headers }));
  },

  fileUrl(key, withRef) {
    const f = SYNC_FILES[key];
    return `https://api.github.com/repos/${f.owner}/${f.repo}/contents/${f.path}${withRef && f.branch ? `?ref=${f.branch}` : ''}`;
  },

  // Fetches one file. Returns { sha, json } or null if it doesn't exist yet.
  async fetchFile(key) {
    const res = await this.api(this.fileUrl(key, true));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${SYNC_FILES[key].label}: GitHub said ${res.status}`);
    const body = await res.json();
    return { sha: body.sha, json: base64ToUtf8(body.content) };
  },

  // Brings in the other player's file, and our own unless we have unsent changes.
  async pull() {
    if (!this.enabled() || this.busy) return;
    this.busy = true;
    let changed = false;
    try {
      for (const key of Object.keys(SYNC_FILES)) {
        const mine = key === this.ownFile();
        const meta = this.config.files[key] = this.config.files[key] || {};
        if (mine && this.dirty(key)) continue;
        const remote = await this.fetchFile(key);
        if (!this.config || this.config.files[key] !== meta) return; // disconnected or reconnected meanwhile
        // Edited while we were fetching: keep the edit, it will be sent.
        if (mine && this.dirty(key)) continue;
        if (!remote) {
          // First time: create our file from what's on this device, or from the first edit.
          if (mine && meta.json === undefined) {
            if (hasData(key, Store.state)) this.schedule(0);
            else meta.json = serialize(key, Store.state);
          }
          continue;
        }
        meta.sha = remote.sha;
        const data = JSON.parse(remote.json);
        applyFileContent(key, data, Store.state);
        normalizeState(Store.state);
        meta.json = serialize(key, Store.state);
        changed = true;
      }
      if (this.side() === 'gb' && this.applyFates()) changed = true;
      this.lastSync = new Date();
      this.save();
      if (this.status !== 'pending') this.setStatus('idle');
    } catch (e) {
      console.error(e);
      this.setStatus('error', e.message);
    } finally {
      this.busy = false;
    }
    if (changed) Store.commit();
  },

  // The Luftwaffe player records fates on the mission scoresheets; the RAF player's app copies
  // the resulting status onto RAF pilots, once per fate, since only it can write the RAF roster.
  applyFates() {
    const sq = Store.state.sides.gb;
    // Nothing to do (and nothing worth saving) until the roster has pilots.
    if (!sq.pilots.length) return false;
    const fates = [];
    for (const m of MISSIONS) {
      for (const [id, r] of Object.entries(Store.state.missions[m.turn].results || {})) {
        if (r.fate && sq.pilots.some(p => p.id === id)) fates.push({ key: `${m.turn}:${id}:${r.fate}`, id, fate: r.fate });
      }
    }
    if (!Array.isArray(sq.fatesApplied)) {
      // Existing fates are already reflected in the roster.
      sq.fatesApplied = fates.map(f => f.key);
      return true;
    }
    let changed = false;
    for (const f of fates) {
      if (sq.fatesApplied.includes(f.key)) continue;
      const def = FATES.find(x => x.key === f.fate);
      const pilot = sq.pilots.find(p => p.id === f.id);
      if (def && def.status && pilot) pilot.status = def.status;
      sq.fatesApplied.push(f.key);
      changed = true;
    }
    return changed;
  },

  // Called after every local edit.
  onLocalChange() {
    if (!this.enabled()) return;
    const key = this.ownFile();
    if (!key || !this.dirty(key)) return;
    this.schedule(SYNC_DELAY);
  },

  schedule(delay) {
    clearTimeout(this.timer);
    this.setStatus('pending');
    this.timer = setTimeout(() => this.push(), delay);
  },

  async push() {
    const key = this.ownFile();
    if (!key || !this.config.token) return;
    if (this.busy) { this.schedule(1000); return; }
    this.busy = true;
    this.setStatus('saving');
    try {
      const f = SYNC_FILES[key];
      const meta = this.config.files[key] = this.config.files[key] || {};
      // A roster that arrived without fate bookkeeping (e.g. imported) already reflects past fates.
      if (key === 'gb' && !Array.isArray(Store.state.sides.gb.fatesApplied)) this.applyFates();
      const json = serialize(key, Store.state);
      const send = () => this.api(this.fileUrl(key, false), {
        method: 'PUT',
        body: JSON.stringify(Object.assign(
          { message: `${SIDES[f.writer].short}: update ${f.label} (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`, content: utf8ToBase64(json) },
          meta.sha ? { sha: meta.sha } : {},
          f.branch ? { branch: f.branch } : {},
        )),
      });
      let res = await send();
      if (res.status === 404 && f.branch) {
        // The data branch doesn't exist yet: start it from the default branch.
        await this.createBranch(key);
        res = await send();
      }
      if (res.status === 409 || res.status === 422) {
        // Out of date (e.g. saved from another device on the same side): this device's copy wins.
        const remote = await this.fetchFile(key);
        if (remote) meta.sha = remote.sha; else delete meta.sha;
        res = await send();
      }
      if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'GitHub refused the token. Check it on the Shared data page.' : `GitHub said ${res.status}`);
      const body = await res.json();
      meta.sha = body.content.sha;
      meta.json = json;
      this.lastSync = new Date();
      this.save();
      this.busy = false;
      // More edits may have come in while saving.
      if (this.dirty(key)) this.schedule(SYNC_DELAY); else this.setStatus('idle');
    } catch (e) {
      console.error(e);
      this.busy = false;
      this.setStatus('error', e.message);
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.push(), 30000);
    }
  },

  async createBranch(key) {
    const f = SYNC_FILES[key];
    const base = `https://api.github.com/repos/${f.owner}/${f.repo}`;
    const repo = await (await this.api(base)).json();
    const ref = await (await this.api(`${base}/git/ref/heads/${repo.default_branch}`)).json();
    const res = await this.api(`${base}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${f.branch}`, sha: ref.object.sha }) });
    if (!res.ok && res.status !== 422) throw new Error(`Could not create the ${f.branch} branch (GitHub said ${res.status})`);
  },

  connect(side, token) {
    clearTimeout(this.timer);
    this.config = { side, token: token.trim(), files: {} };
    this.save();
    this.setStatus('idle');
    return this.pull();
  },

  disconnect() {
    clearTimeout(this.timer);
    this.config = null;
    localStorage.removeItem(SYNC_KEY);
    this.setStatus('off');
  },

  start() {
    this.load();
    // Without a token GitHub allows 60 requests an hour, so view-only devices check half as often.
    let tick = 0;
    setInterval(() => {
      tick++;
      if (document.visibilityState === 'visible' && this.enabled() && (this.config.token || tick % 2 === 0)) this.pull();
    }, SYNC_POLL);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.pull(); });
    if (!this.enabled()) return;
    this.setStatus('idle');
    // Changes made before the app was last closed that never reached GitHub.
    const key = this.ownFile();
    if (key && this.dirty(key)) this.schedule(0);
    this.pull();
  },
};
