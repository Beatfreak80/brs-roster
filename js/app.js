// Phone-first UI: hash routing, views and edit handling. Every input carries a data-path into
// the state; changes are written straight back, committed, and the view re-rendered.
// Navigation: bottom tab bar (Campaign / Mission / RAF / Luftwaffe). Missions are picked from the
// Campaign page; the Mission tab always shows the one last selected.

const root = document.getElementById('root');
const UI_KEY = 'brs-roster:ui';
const MISSION_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'rules', label: 'Rules' },
  { key: 'gb', label: SIDES.gb.short, side: 'gb' },
  { key: 'de', label: SIDES.de.short, side: 'de' },
];

// Per-device view preferences (not campaign data).
const ui = Object.assign({ lastMission: 0 }, readUi());

function readUi() {
  try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}'); } catch (e) { return {}; }
}
function saveUi() {
  try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) { /* view prefs are optional */ }
}

// ---------- helpers ----------

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fieldId(path) {
  return 'f-' + path.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function input(path, value, { type = 'text', dtype = 'str', cls = '', attrs = '' } = {}) {
  return `<input id="${fieldId(path)}" class="${cls}" type="${type}" data-path="${esc(path)}" data-type="${dtype}" value="${esc(value)}" ${attrs}>`;
}

function numInput(path, value, attrs = '') {
  return input(path, value, { type: 'number', dtype: 'int', cls: 'num', attrs: `inputmode="numeric" ${attrs}` });
}

function select(path, value, options, { dtype = 'str', cls = '' } = {}) {
  return `<select id="${fieldId(path)}" class="${cls}" data-path="${esc(path)}" data-type="${dtype}">${optionsHtml(options, value)}</select>`;
}

function optionsHtml(options, value) {
  const one = o => `<option value="${esc(o.value)}" ${String(o.value) === String(value ?? '') ? 'selected' : ''} ${o.disabled ? 'disabled' : ''}>${esc(o.label)}</option>`;
  return options.map(o => (o.group ? `<optgroup label="${esc(o.group)}">${o.options.map(one).join('')}</optgroup>` : one(o))).join('');
}

function textarea(path, value, rows = 3, placeholder = '') {
  return `<textarea id="${fieldId(path)}" data-path="${esc(path)}" data-type="str" rows="${rows}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`;
}

// Radio pills bound to a state path.
function pills(path, value, options, dtype = 'str') {
  return `<div class="pills">${options.map(o => `
    <label class="pill ${String(o.value) === String(value) ? 'on' : ''} ${o.cls || ''}">
      <input type="radio" name="${fieldId(path)}" data-path="${esc(path)}" data-type="${dtype}" value="${esc(o.value)}" ${String(o.value) === String(value) ? 'checked' : ''}>${o.label}
    </label>`).join('')}</div>`;
}

function skillBadge(skill) {
  return `<span class="skill skill-${skill}">${skill}<small>${SKILL_NAME[skill]}</small></span>`;
}

// Firepower / Agility / Speed as on the plane card, with mph under speed for tie-breaks.
function planeStats(plane) {
  return `<span class="plane-stats">
    <span><b>${plane.fp}</b><small>FP</small></span>
    <span><b>${plane.ag}</b><small>AG</small></span>
    <span><b>${plane.spd}</b><small>${plane.mph}mph</small></span>
  </span>`;
}

function sideTag(side) {
  return `<span class="side-tag side-${side}">${esc(SIDES[side].short)}</span>`;
}

function squadronName(side) {
  return Store.state.sides[side].squadronName || SIDES[side].name;
}

function resultLabel(turn) {
  const w = Store.state.missions[turn].winner;
  if (!w) return 'No result';
  if (w === 'draw') return 'Draw';
  return `${SIDES[w].short} won`;
}

function resultClass(turn) {
  const w = Store.state.missions[turn].winner;
  return w && w !== 'draw' ? 'side-' + w : '';
}

function resultChip(turn) {
  const w = Store.state.missions[turn].winner;
  return `<span class="chip ${w ? resultClass(turn) : 'muted-chip'}">${esc(resultLabel(turn))}</span>`;
}

// Renders the scenario mini markup (see scenarios.js).
function renderRules(lines) {
  let html = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('## ')) {
      html += `<h4>${esc(line.slice(3))}</h4>`;
      i++;
    } else if (line.startsWith('- ')) {
      html += '<ul>';
      while (i < lines.length && lines[i].startsWith('- ')) html += `<li>${esc(lines[i++].slice(2))}</li>`;
      html += '</ul>';
    } else if (line.startsWith('| ')) {
      html += '<table class="rules-table">';
      let first = true;
      while (i < lines.length && lines[i].startsWith('| ')) {
        const cells = lines[i++].slice(2).split(' | ');
        const tag = first ? 'th' : 'td';
        html += `<tr>${cells.map(c => `<${tag}>${esc(c)}</${tag}>`).join('')}</tr>`;
        first = false;
      }
      html += '</table>';
    } else {
      html += `<p>${esc(line)}</p>`;
      i++;
    }
  }
  return html;
}

// ---------- state path editing ----------

function resolve(path) {
  const parts = path.split('.');
  let obj = Store.state;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    let next = part.startsWith('#') ? obj.find(x => x.id === part.slice(1)) : obj[part];
    if (next == null) next = obj[part] = {};
    obj = next;
  }
  let key = parts[parts.length - 1];
  if (Array.isArray(obj) && /^\d+$/.test(key)) key = Number(key);
  return { obj, key };
}

function readValue(el) {
  const type = el.dataset.type;
  if (type === 'bool') return el.checked;
  if (type === 'boolstr') return el.value === 'true';
  if (type === 'int') return el.value === '' ? 0 : Number(el.value);
  if (type === 'optint') return el.value === '' ? '' : Number(el.value);
  if (type === 'nullstr') return el.value || null;
  return el.value;
}

function afterEdit(path, value) {
  // Recording a fate updates the pilot's current status.
  const fate = path.match(/^missions\.\d+\.results\.([^.]+)\.fate$/);
  if (fate) {
    const def = FATES.find(f => f.key === value);
    const found = findPilot(Store.state, fate[1]);
    if (def && def.status && found) found.pilot.status = def.status;
    if (def && ['kia', 'captured', 'mia'].includes(value)) resolve(path).obj.survived = value !== 'kia';
  }
}

document.addEventListener('change', e => {
  const el = e.target.closest('[data-path]');
  if (!el) return;
  const { obj, key } = resolve(el.dataset.path);
  const value = readValue(el);
  obj[key] = value;
  afterEdit(el.dataset.path, value);
  Store.commit();
});

// ---------- actions ----------

function newPilot(side, joined) {
  const pilot = {
    id: newId(), name: '', startSkill: joined ? 2 : 3, startXp: 0, joined, status: 'Active',
    aceSkills: [], namedAceBonus: '', xpAdjust: 0, killsAdjust: 0, sortiesAdjust: 0, notes: '',
  };
  Store.state.sides[side].pilots.push(pilot);
  Store.commit();
  location.hash = `#/pilot/${side}/${pilot.id}`;
  setTimeout(() => {
    const el = document.getElementById(fieldId(`sides.${side}.pilots.#${pilot.id}.name`));
    if (el) el.focus();
  }, 30);
}

// Which terrain type the Rules tab shows; kept across re-renders.
let terrainTab = TERRAIN_RULES.types[0].key;

const actions = {
  'terrain-tab'(btn) {
    terrainTab = btn.dataset.key;
    const box = btn.closest('.terrain-tabs');
    box.querySelectorAll('[data-act="terrain-tab"]').forEach(b => b.classList.toggle('on', b === btn));
    box.querySelectorAll('.terrain-pane').forEach(p => { p.hidden = p.dataset.key !== terrainTab; });
  },
  'add-pilot'(btn) { newPilot(btn.dataset.side, Number(btn.dataset.joined || 0)); },
  'delete-pilot'(btn) {
    const { side, id } = btn.dataset;
    const pilot = Store.state.sides[side].pilots.find(p => p.id === id);
    const flown = MISSIONS.filter(m => pilotFlew(Store.state, m.turn, side, id)).map(m => m.turn);
    let msg = `Delete ${pilot.name || 'this pilot'} from the roster?`;
    if (flown.length) msg += `\n\nThey are in the lists for mission(s) ${flown.join(', ')} and will be removed from those lists and their results.`;
    // With shared data the missions belong to the other player, so they can't be cleaned up from here.
    if (Sync.enabled() && side !== MAIN_SIDE && flown.length) {
      alert(`${pilot.name || 'This pilot'} is in the lists for mission(s) ${flown.join(', ')}. Their mission record is kept by the ${SIDES[MAIN_SIDE].short} player, so set their status to Retired instead.`);
      return;
    }
    if (!confirm(msg)) return;
    Store.state.sides[side].pilots = Store.state.sides[side].pilots.filter(p => p.id !== id);
    for (const m of MISSIONS) {
      const mission = Store.state.missions[m.turn];
      for (const el of mission.lists[side].elements) el.pilots = el.pilots.map(p => (p === id ? null : p));
      delete mission.results[id];
    }
    location.hash = `#/roster/${side}`;
    Store.commit();
  },
  'add-element'(btn) {
    Store.state.missions[btn.dataset.turn].lists[btn.dataset.side].elements.push(emptyElement());
    Store.commit();
  },
  'close-modal'() {
    counterModal = null;
    aceModal = null;
    render();
  },
  'open-ace-picker'(btn) {
    aceModal = { side: btn.dataset.side, id: btn.dataset.id, index: Number(btn.dataset.index) };
    render();
    const current = root.querySelector('.ace-picker .current');
    if (current) current.scrollIntoView({ block: 'center' });
  },
  'pick-ace'(btn) {
    const pilot = Store.state.sides[btn.dataset.side].pilots.find(p => p.id === btn.dataset.id);
    pilot.aceSkills[Number(btn.dataset.index)] = btn.dataset.name;
    aceModal = null;
    Store.commit();
  },
  noop() {},
  'lock-list'(btn) {
    Store.state.missions[btn.dataset.turn].lists[btn.dataset.side].locked = !!btn.dataset.locked;
    Store.commit();
    window.scrollTo(0, 0);
  },
  'remove-element'(btn) {
    if (!confirm('Remove this element?')) return;
    Store.state.missions[btn.dataset.turn].lists[btn.dataset.side].elements.splice(Number(btn.dataset.index), 1);
    Store.commit();
  },
  'remove-ace-skill'(btn) {
    Store.state.sides[btn.dataset.side].pilots.find(p => p.id === btn.dataset.id).aceSkills.splice(Number(btn.dataset.index), 1);
    Store.commit();
  },
  step(btn) {
    const { obj, key } = resolve(btn.dataset.path);
    const next = (Number(obj[key]) || 0) + Number(btn.dataset.delta);
    obj[key] = btn.dataset.signed ? next : Math.max(0, next);
    Store.commit();
  },
  'open-counter'(btn) {
    counterModal = { turn: Number(btn.dataset.turn), id: btn.dataset.id, key: btn.dataset.key };
    render();
  },
  'adjust-sorties'(btn) {
    adjustingSorties = btn.dataset.side || null;
    render();
  },
  'edit-squadron'(btn) {
    editingSquadron = btn.dataset.side || null;
    render();
  },
  'export-backup'() { Store.exportBackup(); },
  'import-backup'() { Store.importBackup(); },
  'reset-campaign'() {
    if (!confirm('Clear the whole campaign and start again? This cannot be undone (export a backup first if unsure).')) return;
    Store.replace(defaultState());
    location.hash = '#/';
  },
  async 'sync-connect'() {
    const side = document.getElementById('sync-side').value;
    const token = document.getElementById('sync-token').value;
    if (side !== 'view' && !token.trim()) { alert('Paste your access token first.'); return; }
    await Sync.connect(side, token);
    render();
  },
  'sync-disconnect'() {
    if (!confirm('Stop sharing on this device? The data stays on this phone, but changes will no longer be sent or received.')) return;
    Sync.disconnect();
    render();
  },
  async 'sync-now'() {
    const key = Sync.ownFile();
    if (key && Sync.dirty(key)) await Sync.push();
    await Sync.pull();
    render();
  },
};

// With shared data, each part of the campaign is edited by one player only (see sync.js).
const ACTION_OWNER = {
  'add-pilot': btn => btn.dataset.side,
  'delete-pilot': btn => btn.dataset.side,
  'open-ace-picker': btn => btn.dataset.side,
  'pick-ace': btn => btn.dataset.side,
  'remove-ace-skill': btn => btn.dataset.side,
  'edit-squadron': btn => btn.dataset.side || null,
  'adjust-sorties': btn => btn.dataset.side || null,
  // Each player builds and saves their own side's mission lists; scoresheet results stay with MAIN_SIDE.
  'add-element': btn => btn.dataset.side,
  'remove-element': btn => btn.dataset.side,
  'lock-list': btn => btn.dataset.side,
  'open-counter': () => MAIN_SIDE,
  'reset-campaign': () => MAIN_SIDE,
  step: btn => pathOwner(btn.dataset.path),
};

function canAct(btn) {
  const owner = ACTION_OWNER[btn.dataset.act];
  const side = owner && owner(btn);
  return !side || Sync.canEdit(side);
}

// Greys out whatever the other player keeps.
function applyLocks() {
  if (!Sync.enabled()) return;
  root.querySelectorAll('[data-path]').forEach(el => {
    if (!Sync.canEdit(pathOwner(el.dataset.path))) {
      el.disabled = true;
      const pill = el.closest('.pill');
      if (pill) pill.classList.add('locked');
    }
  });
  root.querySelectorAll('[data-act]').forEach(btn => {
    if (!canAct(btn)) btn.disabled = true;
  });
}

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  e.preventDefault();
  if (btn.disabled || !canAct(btn)) return;
  actions[btn.dataset.act](btn);
});

// ---------- drag to reorder pilots (pointer events, so it works with touch) ----------

// The picked-up card follows the pointer (tilted, with a shadow) while the others slide out of
// its way; on release it glides into its slot and the new order is saved. Rows aren't moved in
// the DOM until the drop, so everything is done with transforms measured at pick-up.

let editingSquadron = null;
let adjustingSorties = null;
let drag = null;

const LIFT = 'rotate(-1.5deg) scale(1.03)';
const GRIP_ICON = `<svg width="14" height="22" viewBox="0 0 14 22" aria-hidden="true">${
  [3, 11].flatMap(x => [4, 11, 18].map(y => `<circle cx="${x}" cy="${y}" r="2" fill="currentColor"/>`)).join('')}</svg>`;

document.addEventListener('pointerdown', e => {
  const handle = e.target.closest('.drag-handle');
  if (!handle || drag) return;
  e.preventDefault();
  const item = handle.closest('.drag-item');
  const list = item.parentElement;
  const items = [...list.querySelectorAll('.drag-item')];
  const rects = items.map(el => el.getBoundingClientRect());
  const from = items.indexOf(item);
  const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
  try { handle.setPointerCapture(e.pointerId); } catch (err) { /* capture is a nicety */ }
  drag = {
    item, list, items, from, to: from,
    tops: rects.map(r => r.top + window.scrollY),
    bottoms: rects.map(r => r.bottom + window.scrollY),
    step: rects[from].height + gap,
    startY: e.clientY + window.scrollY,
    pointerY: e.clientY,
    dy: 0,
  };
  item.classList.add('dragging');
  // Ease the pick-up, then follow the pointer without lag.
  item.style.transition = 'transform .15s ease';
  item.style.transform = `translateY(0) ${LIFT}`;
  setTimeout(() => { item.style.transition = ''; }, 150);
  requestAnimationFrame(autoScroll);
});

function updateDrag() {
  const d = drag;
  d.dy = d.pointerY + window.scrollY - d.startY;
  d.item.style.transform = `translateY(${d.dy}px) ${LIFT}`;
  // Target slot: how many other rows the dragged card's centre has passed.
  const centre = (d.tops[d.from] + d.bottoms[d.from]) / 2 + d.dy;
  let to = 0;
  d.items.forEach((el, i) => {
    if (i !== d.from && (d.tops[i] + d.bottoms[i]) / 2 < centre) to++;
  });
  d.to = to;
  d.items.forEach((el, i) => {
    if (i === d.from) return;
    let shift = 0;
    if (d.from < to && i > d.from && i <= to) shift = -d.step;
    if (to < d.from && i >= to && i < d.from) shift = d.step;
    el.style.transform = shift ? `translateY(${shift}px)` : '';
  });
}

// Keeps scrolling while the pointer is held near the top, or near the bottom tab bar.
function autoScroll() {
  if (!drag || drag.dropping) return;
  const y = drag.pointerY;
  const speed = y < 70 ? -10 : y > window.innerHeight - 120 ? 10 : 0;
  if (speed) {
    window.scrollBy(0, speed);
    updateDrag();
  }
  requestAnimationFrame(autoScroll);
}

document.addEventListener('pointermove', e => {
  if (!drag || drag.dropping) return;
  drag.pointerY = e.clientY;
  updateDrag();
});

function endDrag() {
  if (!drag || drag.dropping) return;
  const d = drag;
  d.dropping = true;
  // Glide into the slot it will occupy, flat again.
  const offset = d.to > d.from ? d.bottoms[d.to] - d.bottoms[d.from]
    : d.to < d.from ? d.tops[d.to] - d.tops[d.from] : 0;
  d.item.classList.remove('dragging');
  d.item.classList.add('dropping');
  d.item.style.transform = `translateY(${offset}px)`;
  setTimeout(() => {
    drag = null;
    if (d.to === d.from) {
      d.items.forEach(el => { el.style.transform = ''; });
      d.item.classList.remove('dropping');
      return;
    }
    const side = d.list.dataset.side;
    const order = d.items.map(el => el.dataset.id);
    order.splice(d.to, 0, order.splice(d.from, 1)[0]);
    const pilots = Store.state.sides[side].pilots;
    const reordered = order.map(id => pilots.find(p => p.id === id));
    Store.state.sides[side].pilots = [...reordered, ...pilots.filter(p => !order.includes(p.id))];
    Store.commit();
  }, 200);
}
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);

// ---------- views ----------

function viewCampaign() {
  const s = Store.state;
  const totals = campaignTotals(s);
  const leader = totals.gb.kills === totals.de.kills ? null : (totals.gb.kills > totals.de.kills ? 'gb' : 'de');

  const missions = MISSIONS.map(m => {
    const played = isPlayed(s, m.turn);
    const vp = s.missions[m.turn].vp;
    return `<a class="row-card" href="#/mission/${m.turn}">
      <span class="turn-num">${m.turn}</span>
      <span class="row-main">
        <span class="row-title">${esc(m.title)}</span>
        <span class="row-sub">${esc(m.month)} · ${esc(SCENARIOS[m.scenario].name)}</span>
        ${played ? `<span class="row-sub tally">Victories ${SIDE_KEYS.map(side => `${sideTag(side)} <b>${missionKills(s, m.turn, side)}</b>`).join(' ')}${vp.gb !== '' || vp.de !== '' ? ` · VP ${vp.gb === '' ? '–' : vp.gb}–${vp.de === '' ? '–' : vp.de}` : ''}</span>` : ''}
      </span>
      ${resultChip(m.turn)}
    </a>`;
  }).join('');

  const squadrons = SIDE_KEYS.map(side => {
    const pilots = s.sides[side].pilots;
    const active = pilots.filter(p => p.status === 'Active').length;
    const lost = pilots.filter(p => GONE_STATUSES.includes(p.status)).length;
    return `<a class="row-card squadron-row side-${side}" href="#/roster/${side}">
      <span class="row-main">
        <span class="row-title">${esc(squadronName(side))}</span>
        <span class="row-sub">${pilots.length} pilots · ${active} active · ${lost} lost${s.sides[side].player ? ' · ' + esc(s.sides[side].player) : ''}</span>
      </span><span class="chev">›</span>
    </a>`;
  }).join('');

  return `
    <section class="page-head">
      <p class="eyebrow">Blood Red Skies campaign</p>
      <h1>${esc(s.campaignName)}</h1>
    </section>

    <section class="scoreboard">
      ${SIDE_KEYS.map(side => `
        <div class="score side-${side} ${leader === side ? 'leading' : ''}">
          <div class="score-label">${esc(SIDES[side].short)}</div>
          <div class="score-big">${totals[side].kills}</div>
          <div class="score-sub">victories · ${totals[side].wins} mission${totals[side].wins === 1 ? '' : 's'} won</div>
        </div>`).join('')}
    </section>
    <p class="hint">Campaign victory goes to the squadron with the most victories (enemy planes shot down).</p>

    <h2>Missions</h2>
    <div class="rows">${missions}</div>

    <h2>Squadrons</h2>
    <div class="rows">${squadrons}</div>

    <h2>Reference</h2>
    <div class="rows"><a class="row-card" href="#/aircraft"><span class="row-main"><span class="row-title">Aircraft</span><span class="row-sub">Points for 2 or 3 planes, stats and traits</span></span><span class="chev">›</span></a></div>

    <h2>Settings</h2>
    <div class="rows"><a class="row-card" href="#/sync"><span class="row-main"><span class="row-title">Shared data</span><span class="row-sub">${Sync.enabled() ? (Sync.side() === 'view' ? 'View only' : `Connected as ${esc(SIDES[Sync.side()].short)}`) : 'Not connected: this phone only'}</span></span><span class="chev">›</span></a></div>

    <div class="footer-links">
      <button class="link" data-act="export-backup">Export backup</button>
      <button class="link" data-act="import-backup">Import backup</button>
      <button class="link danger" data-act="reset-campaign">Reset campaign</button>
    </div>
  `;
}

function viewRoster(side) {
  const s = Store.state;
  const sq = s.sides[side];
  const R = SQUADRON_RULES;

  const adjusting = adjustingSorties === side && Sync.canEdit(side);
  // −/+ beside each pilot to correct sorties that were never recorded in the app.
  const sortieStepper = (p, rec) => {
    const path = `sides.${side}.pilots.#${p.id}.sortiesAdjust`;
    return `<span class="sortie-stepper">
      <button class="icon" data-act="step" data-path="${path}" data-delta="-1" data-signed="1" aria-label="One fewer sortie" ${rec.sorties ? '' : 'disabled'}>−</button>
      <b>${rec.sorties}</b>
      <button class="icon" data-act="step" data-path="${path}" data-delta="1" data-signed="1" aria-label="One more sortie">+</button>
    </span>`;
  };
  const row = (p, draggable) => {
    const rec = pilotRecord(s, side, p);
    if (adjusting) draggable = false;
    return `<div class="pilot-item ${draggable ? 'drag-item' : ''}" data-id="${p.id}">
      ${draggable ? `<span class="drag-handle" aria-label="Drag to reorder">${GRIP_ICON}</span>` : ''}
      <a class="row-card pilot-row ${GONE_STATUSES.includes(p.status) ? 'gone' : ''}" href="#/pilot/${side}/${p.id}">
        ${skillBadge(rec.skill)}
        <span class="row-main">
          <span class="row-title">${esc(p.name || '(unnamed)')}</span>
          <span class="row-sub">${PILOT_COST[rec.skill]} pts · ${rec.xp} XP · ${rec.kills} victor${rec.kills === 1 ? 'y' : 'ies'} · ${rec.sorties} sortie${rec.sorties === 1 ? '' : 's'}</span>
        </span>
        ${p.status !== 'Active' ? `<span class="chip status-${p.status}">${esc(p.status)}</span>` : ''}
        ${adjusting ? '' : '<span class="chev">›</span>'}
      </a>
      ${adjusting ? sortieStepper(p, rec) : ''}
    </div>`;
  };
  const current = sq.pilots.filter(p => !GONE_STATUSES.includes(p.status));
  const gone = sq.pilots.filter(p => GONE_STATUSES.includes(p.status));
  // A blank squadron opens in edit mode and stays there until Done.
  if (!sq.squadronName && !sq.player) editingSquadron = side;
  const editing = editingSquadron === side;

  return `
    <section class="page-head side-${side}">
      <p class="eyebrow">${esc(SIDES[side].nation)} · Roster</p>
      <div class="head-row">
        <h1>${esc(squadronName(side))}</h1>
        ${editing ? '' : `<button class="small-btn" data-act="edit-squadron" data-side="${side}">Edit</button>`}
      </div>
      ${sq.player && !editing ? `<p class="hint">Player: ${esc(sq.player)}</p>` : ''}
    </section>

    ${editing ? `<section class="panel">
      <label>Squadron name ${input(`sides.${side}.squadronName`, sq.squadronName, { attrs: `placeholder="${side === 'gb' ? 'e.g. No. 54 Squadron' : 'e.g. II./JG 26'}"` })}</label>
      <label class="block">Player ${input(`sides.${side}.player`, sq.player)}</label>
      <div class="button-row"><button data-act="edit-squadron" data-side="">Done</button></div>
    </section>` : ''}

    <details class="panel reference"><summary>Squadron &amp; experience rules</summary>
      <p class="small">Founding squadron: ${R.minPilots}–${R.maxPilots} pilots, skill 2–5 each, ${R.skillPoints} skill points in total. Up to ${R.maxReplacements} Rookie replacements join at the end of each month; leftover points can raise a replacement to skill 3.</p>
      <table class="rules-table">
        <tr><th>Level</th><th>XP</th><th>Start XP</th><th>Cost</th></tr>
        ${[2, 3, 4, 5].map(k => `<tr><td>${k} ${SKILL_NAME[k]}</td><td>${{ 2: '0–9', 3: '10–25', 4: '26–50', 5: '51+' }[k]}</td><td>${START_XP[k].dice}</td><td>+${PILOT_COST[k]}</td></tr>`).join('')}
      </table>
      <ul>
        <li>Survived mission +5 <em>(Rookie/Average only)</em></li>
        <li>Squadron victorious +5 <em>(Rookie/Average only)</em></li>
        <li>Each boom chit inflicted +1 <em>(Rookie/Average only)</em></li>
        <li>Each shooting hit +5 <em>(not if dodged)</em></li>
        <li>Each enemy plane shot down +5 <em>(on top of the hit)</em></li>
        <li>51 XP or ${ACE_KILLS} victories: ${SIDES[side].aceTitle} (skill 5, one ace skill). ${NAMED_ACE_KILLS} victories: Named ${SIDES[side].aceTitle} (second ace skill, +1 FP or AG).</li>
      </ul>
    </details>


    <div class="rows drag-list" data-side="${side}">${current.map(p => row(p, Sync.canEdit(side))).join('') || '<p class="empty">No pilots yet.</p>'}</div>
    <div class="button-row">
      <button data-act="add-pilot" data-side="${side}" data-joined="${lastPlayedTurn()}">+ Add pilot</button>
      ${adjusting
        ? `<button class="primary" data-act="adjust-sorties" data-side="">Done</button>`
        : `<button data-act="adjust-sorties" data-side="${side}">Adjust sorties</button>`}
    </div>
    ${adjusting ? '<p class="hint">Use − and + to correct sorties for missions not recorded in the app. Victories and XP are corrected on each pilot page.</p>' : ''}

    ${gone.length ? `<h2>Lost</h2><div class="rows">${gone.map(p => row(p, false)).join('')}</div>` : ''}
  `;
}

const joinedOptions = [{ value: 0, label: 'Founding' }, ...MISSIONS.map(m => ({ value: m.turn, label: m.month }))];

function lastPlayedTurn() {
  let last = 0;
  for (const m of MISSIONS) if (isPlayed(Store.state, m.turn)) last = m.turn;
  return last;
}

// An ace skill laid out like the printed card. `attrs` makes it tappable in the picker.
function aceCardBody(card) {
  return `<h4>${esc(card.name)}</h4>
    <p class="ace-flavour">${esc(card.flavour)}</p>
    <p><b>Play:</b> ${esc(card.play)}</p>
    <p><b>Do:</b> ${esc(card.do)}</p>
    <p class="ace-test">${esc(card.test)}</p>`;
}
function aceCard(card, cls = '', attrs = '') {
  return `<div class="ace-card ${cls}" ${attrs}>${aceCardBody(card)}</div>`;
}

// Pop-up listing every ace skill card to scroll through and tap to choose.
let aceModal = null;

function viewAceModal({ side, id, index }) {
  const p = Store.state.sides[side].pilots.find(x => x.id === id);
  if (!p) return '';
  const current = p.aceSkills[index];
  const cards = ACE_SKILLS.map(c => {
    const held = c.name !== current && p.aceSkills.includes(c.name);
    if (held) return aceCard(c, 'held', 'aria-disabled="true"').replace('</h4>', ' <small>· already has</small></h4>');
    return aceCard(c, c.name === current ? 'pick current' : 'pick',
      `role="button" tabindex="0" data-act="pick-ace" data-side="${side}" data-id="${id}" data-index="${index}" data-name="${esc(c.name)}"`);
  }).join('');
  return `<div class="modal-backdrop" data-act="close-modal">
    <div class="modal ace-picker" data-act="noop" role="dialog" aria-label="Choose an ace skill">
      <div class="ace-picker-head">
        <h3>Ace skill <small class="muted">· ${esc(p.name || '(unnamed)')}</small></h3>
        <button class="icon" data-act="close-modal" aria-label="Close">✕</button>
      </div>
      <p class="hint">Tap a card to choose it.</p>
      <div class="ace-picker-list">${cards}</div>
    </div>
  </div>`;
}

function viewPilot(side, id) {
  const s = Store.state;
  const p = s.sides[side].pilots.find(x => x.id === id);
  if (!p) return `<p class="empty">Pilot not found. <a href="#/roster/${side}">Back to roster</a></p>`;
  const rec = pilotRecord(s, side, p);
  const base = `sides.${side}.pilots.#${p.id}`;
  const aceTitle = SIDES[side].aceTitle;
  const fateLabel = key => (FATES.find(f => f.key === key) || FATES[0]).label;

  const aceSkills = p.aceSkills.map((skill, i) => {
    const card = ACE_SKILLS.find(c => c.name === skill);
    // Anything typed before the card list existed is shown as plain text until changed.
    return `<div class="ace-skill">
      ${card ? aceCard(card) : `<div class="ace-card"><h4>${esc(skill || 'No skill chosen')}</h4>${skill ? '<p class="hint">Not one of the cards: tap Change to pick the matching card.</p>' : ''}</div>`}
      <div class="ace-skill-actions">
        <button class="small-btn" data-act="open-ace-picker" data-side="${side}" data-id="${p.id}" data-index="${i}">Change</button>
        <button class="small-btn danger" data-act="remove-ace-skill" data-side="${side}" data-id="${p.id}" data-index="${i}">Remove</button>
      </div>
    </div>`;
  }).join('');

  const history = rec.history.map(h => {
    const m = missionDef(h.turn);
    const outcome = h.won ? 'Won' : s.missions[h.turn].winner === 'draw' ? 'Draw' : 'Lost';
    return `<a class="row-card" href="#/mission/${h.turn}/${side}">
      <span class="turn-num">${h.turn}</span>
      <span class="row-main">
        <span class="row-title">${esc(m.title)} <small class="muted">${esc(h.plane)}</small></span>
        <span class="row-sub">${outcome} · ${h.result.hits} hits · ${h.result.kills} victories · ${h.result.boom} boom${h.result.fate ? ' · ' + esc(fateLabel(h.result.fate)) : ''}</span>
      </span>
      <span class="xp-gain">+${h.gained}</span>
    </a>`;
  }).join('');

  return `
    <p class="crumb"><a href="#/roster/${side}">‹ ${esc(squadronName(side))}</a></p>
    <section class="page-head side-${side}">
      ${input(base + '.name', p.name, { cls: 'title-input', attrs: 'placeholder="Pilot name"' })}
      <div class="mini-stats">
        <div>${skillBadge(rec.skill)}</div>
        <div><b>${rec.xp}</b><span>XP</span></div>
        <div><b>${rec.kills}</b><span>victories</span></div>
        <div><b>${rec.sorties}</b><span>sorties</span></div>
      </div>
    </section>

    <section class="panel form-grid">
      <label>Status ${select(base + '.status', p.status, PILOT_STATUSES.map(v => ({ value: v, label: v })))}</label>
      <label>Joined ${select(base + '.joined', p.joined, joinedOptions, { dtype: 'int' })}</label>
      <label>Starting skill ${select(base + '.startSkill', p.startSkill, [2, 3, 4, 5].map(k => ({ value: k, label: `${k} ${SKILL_NAME[k]}` })), { dtype: 'int' })}</label>
      <label>Starting XP <span class="muted small">${START_XP[p.startSkill] ? START_XP[p.startSkill].dice : ''}</span>${numInput(base + '.startXp', p.startXp, 'min="0"')}</label>
      <label>XP adjustment ${numInput(base + '.xpAdjust', p.xpAdjust)}</label>
      <label>Victories adjustment ${numInput(base + '.killsAdjust', p.killsAdjust)}</label>
      <label>Sorties adjustment ${numInput(base + '.sortiesAdjust', p.sortiesAdjust)}</label>
    </section>

    <section class="panel">
      <h3>Ace skills</h3>
      ${rec.ace ? '' : `<p class="hint">${aceTitle}s (skill 5, at 51 XP or ${ACE_KILLS} victories) draw an ace skill card.</p>`}
      ${aceSkills}
      <button data-act="open-ace-picker" data-side="${side}" data-id="${p.id}" data-index="${p.aceSkills.length}">+ Ace skill</button>
      ${rec.namedAce || p.namedAceBonus ? `<label class="block">Named ${aceTitle} bonus ${select(base + '.namedAceBonus', p.namedAceBonus, [{ value: '', label: '— choose —' }, { value: 'Firepower', label: '+1 Firepower' }, { value: 'Agility', label: '+1 Agility' }])}</label>` : ''}
    </section>

    <section class="panel">
      <h3>Notes</h3>
      ${textarea(base + '.notes', p.notes, 3)}
    </section>

    <h2>Missions flown</h2>
    <div class="rows">${history || '<p class="empty">None yet.</p>'}</div>
    <div class="button-row"><button class="danger" data-act="delete-pilot" data-side="${side}" data-id="${p.id}">Delete pilot</button></div>
  `;
}

function pilotOptions(state, turn, side, el, seatIndex) {
  const list = state.missions[turn].lists[side];
  const current = el.pilots[seatIndex];
  const seatedElsewhere = new Set(list.elements.flatMap(e => e.pilots).filter(id => id && id !== current));
  const available = [];
  const unavailable = [];
  for (const p of state.sides[side].pilots) {
    if (Number(p.joined) >= turn && p.id !== current) continue;
    const skill = pilotRecord(state, side, p, turn).skill;
    const label = `${p.name || '(unnamed)'} — ${SKILL_NAME[skill]} ${PILOT_COST[skill]}`;
    const opt = { value: p.id, label, disabled: seatedElsewhere.has(p.id) };
    if (p.status === 'Active') available.push(opt);
    else unavailable.push(Object.assign(opt, { label: `${label} (${p.status})` }));
  }
  const options = [{ value: '', label: '— empty seat —' }, ...available];
  if (unavailable.length) options.push({ group: 'Not currently active', options: unavailable });
  return options;
}

function missionOverview(turn) {
  const s = Store.state;
  const m = missionDef(turn);
  const sc = SCENARIOS[m.scenario];
  const mission = s.missions[turn];
  const played = isPlayed(s, turn);
  return `
    <p class="scenario-line">Scenario ${m.scenario}: <strong>${esc(sc.name)}</strong></p>
    <p class="scenario-line">Attacker / bomber side: ${m.attacker ? sideTag(m.attacker) : 'none'}${sc.bombers && m.attacker ? ' · free bombers (not tracked)' : ''}</p>
    <p class="blurb">${esc(m.blurb)}</p>

    <section class="panel">
      <h3>Result</h3>
      ${resultPills(turn)}
      <table class="result-table">
        <tr><th></th>${SIDE_KEYS.map(side => `<th>${sideTag(side)}</th>`).join('')}</tr>
        <tr><td>Victory points</td>${SIDE_KEYS.map(side => `<td>${input(`missions.${turn}.vp.${side}`, mission.vp[side], { type: 'number', dtype: 'optint', cls: 'num', attrs: 'inputmode="numeric"' })}</td>`).join('')}</tr>
        <tr><td>Victories</td>${SIDE_KEYS.map(side => `<td class="num"><b>${played ? missionKills(s, turn, side) : '–'}</b></td>`).join('')}</tr>
        <tr><td>List points</td>${SIDE_KEYS.map(side => `<td class="num">${listCost(s, turn, side)}</td>`).join('')}</tr>
      </table>
      <p class="hint">Victories are totalled from the pilots on the RAF and Luftwaffe tabs.</p>
    </section>

    <section class="panel">
      <h3>Notes</h3>
      ${textarea(`missions.${turn}.notes`, mission.notes, 4, 'Anything worth remembering about this mission…')}
    </section>
  `;
}

function missionRules(turn) {
  const sc = SCENARIOS[missionDef(turn).scenario];
  return `
    <div class="rules">
      <p class="hint">BRS: Air Strike! p.${sc.page}</p>
      ${renderRules(sc.body)}
      <details class="nested"><summary>Common rules: Deploying by Elements &amp; High Cover <small>(p.${COMMON_SCENARIO_RULES.page})</small></summary>
        ${renderRules(COMMON_SCENARIO_RULES.body)}
      </details>
      <details class="nested"><summary>Common rules: Terrain <small>(p.${TERRAIN_RULES.page})</small></summary>
        ${renderRules(TERRAIN_RULES.body)}
        <div class="terrain-tabs">
          <div class="subtabs">${TERRAIN_RULES.types.map(t => `<button type="button" data-act="terrain-tab" data-key="${t.key}" class="${t.key === terrainTab ? 'on' : ''}">${t.label}</button>`).join('')}</div>
          ${TERRAIN_RULES.types.map(t => `<div class="terrain-pane" data-key="${t.key}"${t.key === terrainTab ? '' : ' hidden'}>${renderRules(t.body)}</div>`).join('')}
        </div>
      </details>
      <details class="nested"><summary>Common rules: Flak <small>(p.${FLAK_RULES.page})</small></summary>
        ${renderRules(FLAK_RULES.body)}
      </details>
    </div>`;
}

function resultPills(turn) {
  return pills(`missions.${turn}.winner`, Store.state.missions[turn].winner, [
    { value: '', label: 'No result' },
    { value: 'gb', label: 'RAF won', cls: 'side-gb' },
    { value: 'de', label: 'LW won', cls: 'side-de' },
    { value: 'draw', label: 'Draw' },
  ]);
}

// Lists tab: the builder while setting up; once saved, a scoresheet for recording the game.
function missionLists(turn, side) {
  return Store.state.missions[turn].lists[side].locked ? missionScoresheet(turn, side) : missionBuilder(turn, side);
}

function missionBuilder(turn, side) {
  const s = Store.state;
  const list = s.missions[turn].lists[side];
  const total = listCost(s, turn, side);
  const pct = Math.min(100, (total / POINTS_LIMIT) * 100);
  const planeOptions = [{ value: '', label: '— choose aircraft —' }, ...Object.entries(PLANES).filter(([, pl]) => pl.side === side).map(([k, pl]) => ({ value: k, label: pl.name }))];

  const elements = list.elements.map((el, i) => {
    const base = `missions.${turn}.lists.${side}.elements.${i}`;
    const plane = PLANES[el.plane];
    const cost = elementCost(s, turn, side, el);
    return `<div class="element side-${side}">
      <div class="element-head">
        <strong>Element ${i + 1}</strong>
        <span class="muted">${cost.total} pts</span>
        <button class="icon danger" aria-label="Remove element" data-act="remove-element" data-turn="${turn}" data-side="${side}" data-index="${i}">✕</button>
      </div>
      <div class="element-body">
        ${select(base + '.plane', el.plane, planeOptions)}
        ${plane ? `<div class="plane-line"><span class="traits">${esc(plane.traits.join(', '))}</span>${planeStats(plane)}</div>` : ''}
        ${pills(base + '.size', el.size, [2, 3].map(n => ({ value: n, label: `${n} planes${plane ? ` · ${plane.cost[n]}` : ''}` })), 'int')}
        <ol class="seats">${el.pilots.map((id, seat) => `<li>${select(`${base}.pilots.${seat}`, id || '', pilotOptions(s, turn, side, el, seat), { dtype: 'nullstr' })}</li>`).join('')}</ol>
        <p class="small muted">Planes ${cost.planes} + pilots ${cost.pilots}</p>
      </div>
    </div>`;
  }).join('');

  return `
    <div class="points-sticky ${total > POINTS_LIMIT ? 'over' : ''}">
      <div class="points-bar"><span style="width:${pct}%"></span></div>
      <div><strong>${total}</strong> / ${POINTS_LIMIT} pts · ${total > POINTS_LIMIT ? `${total - POINTS_LIMIT} over` : `${POINTS_LIMIT - total} left`}</div>
    </div>
    ${list.elements.length !== 2 ? `<p class="hint warn-text">${list.elements.length} element${list.elements.length === 1 ? '' : 's'} (normally two).</p>` : ''}
    ${elements}
    <button class="wide" data-act="add-element" data-turn="${turn}" data-side="${side}">+ Add element</button>
    <button class="wide primary save-list" data-act="lock-list" data-turn="${turn}" data-side="${side}" data-locked="1">Save list</button>
  `;
}

// The four scoresheet boxes. `each` is the XP one of them is worth for a pilot of that skill
// (matching missionXp); "Other" is raw XP for anything off-list.
const COUNTERS = [
  { key: 'hits', label: 'Hits', short: 'Hits', each: () => 5, note: () => '+5 XP each. Doesn’t count if the hit is dodged.' },
  { key: 'kills', label: 'Victories', short: 'Vict.', each: () => 5, note: () => '+5 XP each, on top of the hit.' },
  { key: 'boom', label: 'Boom chits', short: 'Boom', each: skill => (skill <= 3 ? 1 : 0),
    note: skill => (skill <= 3 ? '+1 XP each boom chit inflicted on the enemy.' : 'Recorded, but no XP: only Rookies and Averages earn XP for boom chits.') },
  { key: 'xpAdjust', label: 'Other XP', short: 'Other', other: true, note: () => 'XP for anything else during the mission. Can go below zero.' },
];

function signed(n) {
  return n > 0 ? '+' + n : String(n);
}

function scoresheetPilot(turn, side, id) {
  const s = Store.state;
  const found = findPilot(s, id);
  if (!found) return '';
  const p = found.pilot;
  const skill = pilotRecord(s, side, p, turn).skill;
  const r = resultFor(s, turn, id);
  const base = `missions.${turn}.results.${id}`;
  const xp = missionXp(r, skill, s.missions[turn].winner === side);
  // Survival and fate only matter once the mission has a result.
  const concluded = isPlayed(s, turn);
  const boxes = COUNTERS.map(c => {
    const value = Number(r[c.key]) || 0;
    const earned = c.other ? 0 : value * c.each(skill);
    return `<button class="count-box ${c.other ? 'other' : ''} ${value ? 'has' : ''}" data-act="open-counter" data-turn="${turn}" data-id="${id}" data-key="${c.key}" aria-label="${c.label}: ${value}">
      <b>${c.other && value ? `${signed(value)}<i>XP</i>` : value}</b><small>${c.short}</small>
      ${!c.other && value ? `<span class="xp-badge">${earned}</span>` : ''}
    </button>`;
  }).join('');
  return `<div class="pilot-card">
    <div class="pilot-line">
      ${skillBadge(skill)}
      <span class="row-main">
        <span class="row-title">${esc(p.name || '(unnamed)')}</span>
        <span class="row-sub">${PILOT_COST[skill]} pts · <span class="xp-gain">${signed(xp)} XP</span></span>
      </span>
      <span class="count-boxes">${boxes}</span>
    </div>
    ${concluded ? `<div class="card-row">
      ${pills(base + '.survived', r.survived, [{ value: true, label: 'Survived' }, { value: false, label: 'Lost' }], 'boolstr')}
      ${select(base + '.fate', r.fate, FATES.map(f => ({ value: f.key, label: f.label })))}
    </div>` : ''}
  </div>`;
}

// Pop-up for changing one of a pilot's counts.
let counterModal = null;

function viewCounterModal({ turn, id, key }) {
  const s = Store.state;
  const found = findPilot(s, id);
  const c = COUNTERS.find(x => x.key === key);
  if (!found || !c) return '';
  const skill = pilotRecord(s, found.side, found.pilot, turn).skill;
  const value = Number(resultFor(s, turn, id)[key]) || 0;
  const path = `missions.${turn}.results.${id}.${key}`;
  const earned = c.other ? value : value * c.each(skill);
  return `<div class="modal-backdrop" data-act="close-modal">
    <div class="modal" data-act="noop" role="dialog" aria-label="${c.label}">
      <h3>${c.label} <small class="muted">· ${esc(found.pilot.name || '(unnamed)')}</small></h3>
      <div class="big-stepper">
        <button data-act="step" data-path="${path}" data-delta="-1" ${c.other ? 'data-signed="1"' : ''} aria-label="Minus one">−</button>
        <span class="big-value">${c.other ? `${value ? signed(value) : 0}<small> XP</small>` : value}</span>
        <button data-act="step" data-path="${path}" data-delta="1" ${c.other ? 'data-signed="1"' : ''} aria-label="Plus one">+</button>
      </div>
      <p class="hint center">${esc(c.note(skill))}${c.other ? '' : ` This mission: <b>${signed(earned)} XP</b>.`}</p>
      <button class="wide primary" data-act="close-modal">Done</button>
    </div>
  </div>`;
}

function missionScoresheet(turn, side) {
  const s = Store.state;
  const list = s.missions[turn].lists[side];
  const played = isPlayed(s, turn);

  const elements = list.elements.map((el, i) => {
    const plane = PLANES[el.plane];
    const cost = elementCost(s, turn, side, el);
    const pilots = el.pilots.filter(Boolean);
    return `<div class="element side-${side}">
      <div class="element-head plane-head">
        <span class="row-main">
          <strong>${plane ? esc(plane.name) : `Element ${i + 1}`}</strong>
          <span class="row-sub">${el.size} planes · ${cost.total} pts</span>
          ${plane ? `<span class="traits">${esc(plane.traits.join(', '))}</span>` : ''}
        </span>
        ${plane ? planeStats(plane) : ''}
      </div>
      <div class="element-pilots">${pilots.map(id => scoresheetPilot(turn, side, id)).join('') || '<p class="empty">No pilots assigned.</p>'}</div>
    </div>`;
  }).join('');

  return `
    ${elements}
    <div class="sheet-foot">
      <span class="sheet-points"><strong>${listCost(s, turn, side)}</strong> / ${POINTS_LIMIT} pts${played ? `<br><span class="muted small">${missionKills(s, turn, side)} victories</span>` : ''}</span>
      <button class="small-btn" data-act="lock-list" data-turn="${turn}" data-side="${side}" data-locked="">Edit list</button>
    </div>
    <p class="hint">${played ? 'Setting a fate also updates the pilot\'s status on the roster.' : 'XP and victories count toward the roster once the result is set on Overview.'}</p>
  `;
}

function viewMission(turn, tab) {
  const m = missionDef(turn);
  if (!m) return '<p class="empty">Select a mission from the <a href="#/">Campaign</a> page.</p>';
  const views = { overview: missionOverview, rules: missionRules };
  // The RAF and Luftwaffe tabs each hold that side's list (builder, or scoresheet once saved).
  const current = MISSION_TABS.some(t => t.key === tab) ? tab : 'overview';
  const body = SIDES[current] ? missionLists(turn, current) : views[current](turn);
  return `
    <section class="page-head"><p class="eyebrow">Mission ${m.turn} · ${esc(m.month)}</p><h1>${esc(m.title)}</h1></section>
    <nav class="tabs">${MISSION_TABS.map(t => `<a class="${t.key === current ? 'on' : ''} ${t.side ? 'side-' + t.side : ''}" href="#/mission/${turn}/${t.key}">${t.label}</a>`).join('')}</nav>
    <div class="tab-body">${body}</div>
  `;
}

function viewAircraft() {
  return `
    <section class="page-head"><p class="eyebrow">Reference</p><h1>Aircraft</h1>
      <p class="hint">Each element is 2 or 3 planes. Pilots cost extra: ${[2, 3, 4, 5].map(k => `${SKILL_NAME[k]} +${PILOT_COST[k]}`).join(', ')}.</p></section>
    ${SIDE_KEYS.map(side => `
      <h2>${esc(SIDES[side].name)}</h2>
      <div class="rows">${Object.values(PLANES).filter(p => p.side === side).map(p => `
        <div class="element side-${side}">
          <div class="element-head plane-head">
            <span class="row-main">
              <strong>${esc(p.name)}</strong>
              <span class="row-sub">2 for ${p.cost[2]} pts · 3 for ${p.cost[3]} pts</span>
              <span class="traits">${esc(p.traits.join(', '))}</span>
            </span>
            ${planeStats(p)}
          </div>
        </div>`).join('')}</div>`).join('')}
  `;
}

function viewSync() {
  const on = Sync.enabled();
  const side = Sync.side();
  const files = Object.values(SYNC_FILES).map(f => `<li><b>${esc(f.label)}</b>: kept by the ${esc(SIDES[f.writer].short)} player, in <code>${esc(f.owner)}/${esc(f.repo)}</code>${f.branch ? ` (${esc(f.branch)} branch)` : ''}</li>`).join('');
  return `
    <p class="crumb"><a href="#/">‹ Campaign</a></p>
    <section class="page-head"><p class="eyebrow">Settings</p><h1>Shared data</h1></section>
    <p class="hint">Both players' phones read the same campaign from GitHub. Each player can only change their own part; the rest is shown read-only and refreshes every minute.</p>
    <ul class="small">${files}</ul>
    ${on ? `
      <section class="panel">
        <p>This phone is ${side === 'view' ? '<b>view only</b>' : `the <b>${esc(SIDES[side].short)}</b> player`}.</p>
        <p class="small">${Sync.badge()}${Sync.message ? `<br><span class="warn-text">${esc(Sync.message)}</span>` : ''}</p>
        <div class="button-row">
          <button data-act="sync-now">Sync now</button>
          <button class="danger" data-act="sync-disconnect">Disconnect</button>
        </div>
      </section>` : `
      <section class="panel">
        <label>This phone is <select id="sync-side">${optionsHtml([{ value: 'de', label: `The ${SIDES.de.short} player (missions too)` }, { value: 'gb', label: `The ${SIDES.gb.short} player` }, { value: 'view', label: 'View only' }], 'de')}</select></label>
        <label class="block">Access token <input id="sync-token" type="password" autocomplete="off" placeholder="github_pat_…"></label>
        <p class="hint">The token is kept on this phone only. If you have data on this phone already and the shared copy is empty, your data is sent up; otherwise the shared copy replaces what's here.</p>
        <div class="button-row"><button class="primary" data-act="sync-connect">Connect</button></div>
      </section>`}
  `;
}

// The page's data belongs to the other player: say so above the greyed-out fields.
function readOnlyNote(route) {
  if (!Sync.enabled()) return '';
  let owner = route.name === 'roster' || route.name === 'pilot' ? route.a : null;
  if (route.name === 'mission' && missionDef(route.a)) {
    // A side's list tab: the builder is that side's; a saved list's scoresheet is shared, so no note.
    if (SIDES[route.b]) owner = Store.state.missions[route.a].lists[route.b].locked ? null : route.b;
    else owner = MAIN_SIDE;
  }
  if (!owner || !SIDES[owner] || Sync.canEdit(owner)) return '';
  return `<p class="readonly-note">Read only: the ${esc(SIDES[owner].short)} player keeps this.</p>`;
}

// ---------- shell ----------

function parseRoute() {
  const parts = (location.hash || '#/').slice(2).split('/');
  return { name: parts[0] || 'campaign', a: parts[1], b: parts[2] };
}

function bottomBar(route) {
  const section = route.name === 'mission' ? 'mission'
    : route.name === 'roster' || route.name === 'pilot' ? 'roster-' + route.a
    : 'campaign';
  const tabs = [
    { key: 'campaign', href: '#/', icon: '★', label: 'Campaign' },
    { key: 'mission', href: ui.lastMission ? `#/mission/${ui.lastMission}` : '#/mission', icon: '✈', label: 'Mission' },
    { key: 'roster-gb', href: '#/roster/gb', icon: '◎', label: 'RAF', cls: 'side-gb' },
    { key: 'roster-de', href: '#/roster/de', icon: '✠', label: 'Luftwaffe', cls: 'side-de' },
  ];
  return `<nav class="bottombar">${tabs.map(t => `<a href="${t.href}" class="${t.cls || ''} ${section === t.key ? 'on' : ''}"><span class="bb-icon">${t.icon}</span>${t.label}</a>`).join('')}</nav>`;
}

function render() {
  const route = parseRoute();

  // The Mission tab is always the mission last selected from the Campaign page.
  if (route.name === 'mission' && missionDef(route.a)) {
    ui.lastMission = Number(route.a);
    saveUi();
  }

  let body;
  if (route.name === 'roster' && SIDES[route.a]) body = viewRoster(route.a);
  else if (route.name === 'pilot' && SIDES[route.a]) body = viewPilot(route.a, route.b);
  else if (route.name === 'mission') body = viewMission(Number(route.a), route.b);
  else if (route.name === 'aircraft') body = viewAircraft();
  else if (route.name === 'sync') body = viewSync();
  else body = viewCampaign();

  // Keep focus on whichever field the user moved to.
  const activeId = document.activeElement && document.activeElement.id;
  if (route.name !== 'mission' || !counterModal || Number(route.a) !== counterModal.turn) counterModal = null;
  if (route.name !== 'pilot' || !aceModal || route.b !== aceModal.id) aceModal = null;
  root.innerHTML = `
    ${route.name === 'sync' ? '' : Sync.badge()}
    <main id="app">${readOnlyNote(route)}${body}</main>
    ${bottomBar(route)}
    ${counterModal ? viewCounterModal(counterModal) : ''}
    ${aceModal ? viewAceModal(aceModal) : ''}
  `;
  applyLocks();
  if (activeId) {
    const el = document.getElementById(activeId);
    if (el) el.focus();
  }
}

// Re-render after the browser has moved focus, so tabbing between fields keeps working.
let renderQueued = false;
function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  setTimeout(() => { renderQueued = false; render(); }, 0);
}

let lastPage = '';
Store.init();
Store.onChange(queueRender);
Store.onChange(() => Sync.onLocalChange());
Sync.start();
window.addEventListener('hashchange', () => {
  // Only jump to the top when moving to a different page, not between list/debrief sides.
  const page = location.hash.split('/').slice(0, 3).join('/');
  render();
  if (page !== lastPage) window.scrollTo(0, 0);
  lastPage = page;
});
// Opening the app (no hash) lands on the Campaign page.
render();
