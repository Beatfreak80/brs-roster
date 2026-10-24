// Phone-first UI: hash routing, views and edit handling. Every input carries a data-path into
// the state; changes are written straight back, committed, and the view re-rendered.
//
// Two navigation layouts are available while we try them out:
//   A — bottom tab bar (Campaign / Missions / RAF / Luftwaffe) + mission picker in the header
//   B — a single "jump to" dropdown in the header

const root = document.getElementById('root');
const UI_KEY = 'brs-roster:ui';
const MISSION_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'rules', label: 'Rules' },
  { key: 'lists', label: 'Lists' },
  { key: 'debrief', label: 'Debrief' },
];

// Per-device view preferences (not campaign data).
const ui = Object.assign({ layout: 'a', side: 'gb', lastMission: 0 }, readUi());

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

function stepper(path, value, label) {
  return `<div class="stepper">
    <span class="stepper-label">${label}</span>
    <button class="step" data-act="step" data-path="${esc(path)}" data-delta="-1" aria-label="${label} minus one">−</button>
    <span class="stepper-value">${Number(value) || 0}</span>
    <button class="step" data-act="step" data-path="${esc(path)}" data-delta="1" aria-label="${label} plus one">+</button>
  </div>`;
}

function skillBadge(skill) {
  return `<span class="skill skill-${skill}">${skill}<small>${SKILL_NAME[skill]}</small></span>`;
}

function sideTag(side) {
  return `<span class="side-tag side-${side}">${esc(SIDES[side].short)}</span>`;
}

function squadronName(side) {
  return Store.state.sides[side].squadronName || SIDES[side].name;
}

// Segmented RAF | Luftwaffe switch; remembers the last side picked on this device.
function sideSwitch() {
  return `<div class="segmented side-switch">${SIDE_KEYS.map(side =>
    `<button class="${ui.side === side ? 'on side-' + side : ''}" data-act="set-side" data-side="${side}">${esc(SIDES[side].short)}</button>`).join('')}</div>`;
}

function resultChip(turn) {
  const w = Store.state.missions[turn].winner;
  if (!w) return '<span class="chip muted-chip">Not played</span>';
  if (w === 'draw') return '<span class="chip">Draw</span>';
  return `<span class="chip side-${w}">${esc(SIDES[w].short)} won</span>`;
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
  const nav = e.target.closest('[data-nav]');
  if (nav) {
    location.hash = nav.value;
    return;
  }
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
    aceSkills: [], namedAceBonus: '', xpAdjust: 0, killsAdjust: 0, notes: '',
  };
  Store.state.sides[side].pilots.push(pilot);
  Store.commit();
  location.hash = `#/pilot/${side}/${pilot.id}`;
  setTimeout(() => {
    const el = document.getElementById(fieldId(`sides.${side}.pilots.#${pilot.id}.name`));
    if (el) el.focus();
  }, 30);
}

const actions = {
  'add-pilot'(btn) { newPilot(btn.dataset.side, Number(btn.dataset.joined || 0)); },
  'delete-pilot'(btn) {
    const { side, id } = btn.dataset;
    const pilot = Store.state.sides[side].pilots.find(p => p.id === id);
    const flown = MISSIONS.filter(m => pilotFlew(Store.state, m.turn, side, id)).map(m => m.turn);
    let msg = `Delete ${pilot.name || 'this pilot'} from the roster?`;
    if (flown.length) msg += `\n\nThey are in the lists for mission(s) ${flown.join(', ')} and will be removed from those lists and their results.`;
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
  'remove-element'(btn) {
    if (!confirm('Remove this element?')) return;
    Store.state.missions[btn.dataset.turn].lists[btn.dataset.side].elements.splice(Number(btn.dataset.index), 1);
    Store.commit();
  },
  'add-ace-skill'(btn) {
    Store.state.sides[btn.dataset.side].pilots.find(p => p.id === btn.dataset.id).aceSkills.push('');
    Store.commit();
  },
  'remove-ace-skill'(btn) {
    Store.state.sides[btn.dataset.side].pilots.find(p => p.id === btn.dataset.id).aceSkills.splice(Number(btn.dataset.index), 1);
    Store.commit();
  },
  step(btn) {
    const { obj, key } = resolve(btn.dataset.path);
    obj[key] = Math.max(0, (Number(obj[key]) || 0) + Number(btn.dataset.delta));
    Store.commit();
  },
  'set-side'(btn) {
    ui.side = btn.dataset.side;
    saveUi();
    render();
  },
  'set-layout'(btn) {
    ui.layout = btn.dataset.layout;
    saveUi();
    render();
  },
  'export-backup'() { Store.exportBackup(); },
  'import-backup'() { Store.importBackup(); },
  'reset-campaign'() {
    if (!confirm('Clear the whole campaign and start again? This cannot be undone (export a backup first if unsure).')) return;
    Store.replace(defaultState());
    location.hash = '#/';
  },
};

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  e.preventDefault();
  actions[btn.dataset.act](btn);
});

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
        ${played ? `<span class="row-sub">Shot down: RAF ${missionKills(s, m.turn, 'gb')} · LW ${missionKills(s, m.turn, 'de')}${vp.gb !== '' || vp.de !== '' ? ` · VP ${vp.gb === '' ? '–' : vp.gb}–${vp.de === '' ? '–' : vp.de}` : ''}</span>` : ''}
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
      ${textarea('campaignName', s.campaignName, 2).replace('<textarea', '<textarea class="title-input"')}
    </section>

    <section class="scoreboard">
      ${SIDE_KEYS.map(side => `
        <div class="score side-${side} ${leader === side ? 'leading' : ''}">
          <div class="score-label">${esc(SIDES[side].short)}</div>
          <div class="score-big">${totals[side].kills}</div>
          <div class="score-sub">shot down · ${totals[side].wins} won</div>
        </div>`).join('')}
    </section>
    <p class="hint">Campaign victory goes to the squadron that shot down the most enemy planes.</p>

    <h2>Missions</h2>
    <div class="rows">${missions}</div>

    <h2>Squadrons</h2>
    <div class="rows">${squadrons}</div>

    <h2>Reference</h2>
    <div class="rows"><a class="row-card" href="#/aircraft"><span class="row-main"><span class="row-title">Aircraft cards</span><span class="row-sub">Points for 2 or 3 planes, stats and traits</span></span><span class="chev">›</span></a></div>

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
  const check = squadronCheck(s, side);
  const R = SQUADRON_RULES;
  const issues = [];
  if (check.foundingCount && check.foundingCount < R.minPilots) issues.push(`Founding squadron needs at least ${R.minPilots} pilots (has ${check.foundingCount}).`);
  if (check.foundingCount > R.maxPilots) issues.push(`Founding squadron has ${check.foundingCount} pilots; the maximum is ${R.maxPilots}.`);
  if (check.remaining < 0) issues.push(`${-check.remaining} Pilot Skill point${check.remaining === -1 ? '' : 's'} over the ${R.skillPoints}-point budget.`);
  if (check.onRoster > R.maxPilots) issues.push(`${check.onRoster} pilots on the roster; the maximum is ${R.maxPilots}.`);

  const row = p => {
    const rec = pilotRecord(s, side, p);
    const ace = rec.namedAce ? `Named ${SIDES[side].aceTitle}` : rec.ace ? SIDES[side].aceTitle : '';
    return `<a class="row-card pilot-row ${GONE_STATUSES.includes(p.status) ? 'gone' : ''}" href="#/pilot/${side}/${p.id}">
      ${skillBadge(rec.skill)}
      <span class="row-main">
        <span class="row-title">${esc(p.name || '(unnamed)')} ${ace ? `<span class="badge gold">${ace}</span>` : ''}</span>
        <span class="row-sub">${rec.xp} XP · ${rec.kills} kill${rec.kills === 1 ? '' : 's'} · ${rec.sorties} sortie${rec.sorties === 1 ? '' : 's'}</span>
      </span>
      ${p.status !== 'Active' ? `<span class="chip status-${p.status}">${esc(p.status)}</span>` : ''}
      <span class="chev">›</span>
    </a>`;
  };
  const current = sq.pilots.filter(p => !GONE_STATUSES.includes(p.status));
  const gone = sq.pilots.filter(p => GONE_STATUSES.includes(p.status));

  return `
    <section class="page-head side-${side}">
      <p class="eyebrow">${esc(SIDES[side].nation)} · Roster</p>
      <h1>${esc(squadronName(side))}</h1>
    </section>

    <details class="panel">
      <summary>Squadron details</summary>
      <label class="block">Squadron name ${input(`sides.${side}.squadronName`, sq.squadronName, { attrs: `placeholder="${side === 'gb' ? 'e.g. No. 54 Squadron' : 'e.g. II./JG 26'}"` })}</label>
      <label class="block">Player ${input(`sides.${side}.player`, sq.player)}</label>
      <p class="hint">Founding pilots: ${R.minPilots}–${R.maxPilots}, skill 2–5, ${R.skillPoints} skill points in total. Up to ${R.maxReplacements} Rookie replacements join at the end of each month; leftover points can raise a replacement to skill 3.</p>
    </details>

    <div class="mini-stats">
      <div><b>${check.onRoster}</b><span>on roster</span></div>
      <div><b>${check.foundingCount}</b><span>founders</span></div>
      <div><b class="${check.remaining < 0 ? 'bad' : ''}">${check.remaining}</b><span>skill pts left</span></div>
    </div>
    ${issues.length ? `<ul class="issues">${issues.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}

    <div class="rows">${current.map(row).join('') || '<p class="empty">No pilots yet.</p>'}</div>
    <div class="button-row">
      <button data-act="add-pilot" data-side="${side}" data-joined="0">+ Founding pilot</button>
      <button data-act="add-pilot" data-side="${side}" data-joined="${lastPlayedTurn() || 1}">+ Replacement</button>
    </div>

    ${gone.length ? `<h2>Lost</h2><div class="rows">${gone.map(row).join('')}</div>` : ''}

    <details class="panel reference"><summary>Experience rules</summary>
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
        <li>51 XP or ${ACE_KILLS} kills: ${SIDES[side].aceTitle} (skill 5, one ace skill). ${NAMED_ACE_KILLS} kills: Named ${SIDES[side].aceTitle} (second ace skill, +1 FP or AG).</li>
      </ul>
    </details>
  `;
}

function lastPlayedTurn() {
  let last = 0;
  for (const m of MISSIONS) if (isPlayed(Store.state, m.turn)) last = m.turn;
  return last;
}

function viewPilot(side, id) {
  const s = Store.state;
  const p = s.sides[side].pilots.find(x => x.id === id);
  if (!p) return `<p class="empty">Pilot not found. <a href="#/roster/${side}">Back to roster</a></p>`;
  const rec = pilotRecord(s, side, p);
  const base = `sides.${side}.pilots.#${p.id}`;
  const aceTitle = SIDES[side].aceTitle;
  const fateLabel = key => (FATES.find(f => f.key === key) || FATES[0]).label;
  const joinedOptions = [{ value: 0, label: 'Founding' }, ...MISSIONS.map(m => ({ value: m.turn, label: `After turn ${m.turn}` }))];

  const aceSkills = p.aceSkills.map((skill, i) => `
    <div class="inline-row">${input(`${base}.aceSkills.${i}`, skill, { attrs: 'placeholder="Ace skill card"' })}
      <button class="icon danger" data-act="remove-ace-skill" data-side="${side}" data-id="${p.id}" data-index="${i}" aria-label="Remove">✕</button></div>`).join('');

  const history = rec.history.map(h => {
    const m = missionDef(h.turn);
    const outcome = h.won ? 'Won' : s.missions[h.turn].winner === 'draw' ? 'Draw' : 'Lost';
    return `<a class="row-card" href="#/mission/${h.turn}/debrief">
      <span class="turn-num">${h.turn}</span>
      <span class="row-main">
        <span class="row-title">${esc(m.title)} <small class="muted">${esc(h.plane)}</small></span>
        <span class="row-sub">${outcome} · ${h.result.hits} hits · ${h.result.kills} kills · ${h.result.boom} boom${h.result.fate ? ' · ' + esc(fateLabel(h.result.fate)) : ''}</span>
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
        <div><b>${rec.kills}</b><span>kills</span></div>
        <div><b>${rec.sorties}</b><span>sorties</span></div>
      </div>
      ${rec.namedAce ? `<span class="badge gold">Named ${aceTitle}</span>` : rec.ace ? `<span class="badge gold">${aceTitle}</span>` : ''}
    </section>

    <section class="panel form-grid">
      <label>Status ${select(base + '.status', p.status, PILOT_STATUSES.map(v => ({ value: v, label: v })))}</label>
      <label>Joined ${select(base + '.joined', p.joined, joinedOptions, { dtype: 'int' })}</label>
      <label>Starting skill ${select(base + '.startSkill', p.startSkill, [2, 3, 4, 5].map(k => ({ value: k, label: `${k} ${SKILL_NAME[k]}` })), { dtype: 'int' })}</label>
      <label>Starting XP <span class="muted small">${START_XP[p.startSkill] ? START_XP[p.startSkill].dice : ''}</span>${numInput(base + '.startXp', p.startXp, 'min="0"')}</label>
      <label>XP adjustment ${numInput(base + '.xpAdjust', p.xpAdjust)}</label>
      <label>Kills adjustment ${numInput(base + '.killsAdjust', p.killsAdjust)}</label>
    </section>

    <section class="panel">
      <h3>Ace skills</h3>
      ${rec.ace ? '' : `<p class="hint">${aceTitle}s (skill 5, at 51 XP or ${ACE_KILLS} kills) draw an ace skill card.</p>`}
      ${aceSkills}
      <button data-act="add-ace-skill" data-side="${side}" data-id="${p.id}">+ Ace skill</button>
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
      ${pills(`missions.${turn}.winner`, mission.winner, [
        { value: '', label: 'Not played' },
        { value: 'gb', label: 'RAF won', cls: 'side-gb' },
        { value: 'de', label: 'LW won', cls: 'side-de' },
        { value: 'draw', label: 'Draw' },
      ])}
      <table class="result-table">
        <tr><th></th>${SIDE_KEYS.map(side => `<th>${sideTag(side)}</th>`).join('')}</tr>
        <tr><td>Victory points</td>${SIDE_KEYS.map(side => `<td>${input(`missions.${turn}.vp.${side}`, mission.vp[side], { type: 'number', dtype: 'optint', cls: 'num', attrs: 'inputmode="numeric"' })}</td>`).join('')}</tr>
        <tr><td>Enemy planes shot down</td>${SIDE_KEYS.map(side => `<td class="num"><b>${played ? missionKills(s, turn, side) : '–'}</b></td>`).join('')}</tr>
        <tr><td>List points</td>${SIDE_KEYS.map(side => `<td class="num">${listCost(s, turn, side)}</td>`).join('')}</tr>
      </table>
      <p class="hint">Planes shot down are totalled from the pilots' kills on the Debrief tab.</p>
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
    </div>`;
}

function missionLists(turn) {
  const s = Store.state;
  const side = ui.side;
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
        ${plane ? `<div class="plane-line"><img class="card-thumb" src="${encodeURI(plane.card)}" alt="${esc(plane.name)} card"><span class="small muted">FP ${plane.fp} · AG ${plane.ag} · SPD ${plane.spd}<br>${esc(plane.traits.join(', '))}</span></div>` : ''}
        ${pills(base + '.size', el.size, [2, 3].map(n => ({ value: n, label: `${n} planes${plane ? ` · ${plane.cost[n]}` : ''}` })), 'int')}
        <ol class="seats">${el.pilots.map((id, seat) => `<li>${select(`${base}.pilots.${seat}`, id || '', pilotOptions(s, turn, side, el, seat), { dtype: 'nullstr' })}</li>`).join('')}</ol>
        <p class="small muted">Planes ${cost.planes} + pilots ${cost.pilots}</p>
      </div>
    </div>`;
  }).join('');

  return `
    ${sideSwitch()}
    <div class="points-sticky ${total > POINTS_LIMIT ? 'over' : ''}">
      <div class="points-bar"><span style="width:${pct}%"></span></div>
      <div><strong>${total}</strong> / ${POINTS_LIMIT} pts · ${total > POINTS_LIMIT ? `${total - POINTS_LIMIT} over` : `${POINTS_LIMIT - total} left`}</div>
    </div>
    ${list.elements.length !== 2 ? `<p class="hint warn-text">${list.elements.length} element${list.elements.length === 1 ? '' : 's'} (normally two).</p>` : ''}
    ${elements}
    <button class="wide" data-act="add-element" data-turn="${turn}" data-side="${side}">+ Add element</button>
  `;
}

function missionDebrief(turn) {
  const s = Store.state;
  const side = ui.side;
  const played = isPlayed(s, turn);
  const won = s.missions[turn].winner === side;
  const cards = seatedPilotIds(s, turn, side).map(id => {
    const found = findPilot(s, id);
    if (!found) return '';
    const p = found.pilot;
    const skill = pilotRecord(s, side, p, turn).skill;
    const r = resultFor(s, turn, id);
    const base = `missions.${turn}.results.${id}`;
    return `<div class="pilot-card side-${side}">
      <div class="pilot-card-head">
        ${skillBadge(skill)}
        <span class="row-main">
          <a class="row-title" href="#/pilot/${side}/${id}">${esc(p.name || '(unnamed)')}</a>
          <span class="row-sub">${esc(planeFlownBy(s, turn, side, id))}</span>
        </span>
        <span class="xp-gain" title="XP from this mission">${played ? '+' + missionXp(r, skill, won) + ' XP' : '–'}</span>
      </div>
      ${stepper(base + '.hits', r.hits, 'Hits')}
      ${stepper(base + '.kills', r.kills, 'Kills')}
      ${stepper(base + '.boom', r.boom, 'Boom chits')}
      <div class="card-row">
        <label class="check"><input type="checkbox" data-path="${base}.survived" data-type="bool" ${r.survived ? 'checked' : ''}> Survived</label>
        ${select(base + '.fate', r.fate, FATES.map(f => ({ value: f.key, label: f.label })))}
      </div>
      <details class="nested"><summary>XP adjustment ${r.xpAdjust ? `(${r.xpAdjust > 0 ? '+' : ''}${r.xpAdjust})` : ''}</summary>${numInput(base + '.xpAdjust', r.xpAdjust)}</details>
    </div>`;
  }).join('');

  return `
    ${sideSwitch()}
    <p class="hint">${played ? `${missionKills(s, turn, side)} enemy planes shot down.` : 'Set the result on the Overview tab for XP and kills to count.'}</p>
    ${cards || '<p class="empty">No pilots in this list yet. Add them on the Lists tab.</p>'}
    <p class="hint">Setting a fate also updates the pilot's status on the roster.</p>
  `;
}

function viewMission(turn, tab) {
  const m = missionDef(turn);
  if (!m) return '<p class="empty">Mission not found.</p>';
  const views = { overview: missionOverview, rules: missionRules, lists: missionLists, debrief: missionDebrief };
  const current = views[tab] ? tab : 'overview';
  const pickerInHeader = ui.layout === 'a';
  return `
    ${pickerInHeader ? '' : `<section class="page-head"><p class="eyebrow">Turn ${m.turn} · ${esc(m.month)}</p><h1>${esc(m.title)}</h1></section>`}
    <nav class="tabs">${MISSION_TABS.map(t => `<a class="${t.key === current ? 'on' : ''}" href="#/mission/${turn}/${t.key}">${t.label}</a>`).join('')}</nav>
    <div class="tab-body">${views[current](turn)}</div>
  `;
}

function viewAircraft() {
  return `
    <section class="page-head"><p class="eyebrow">Reference</p><h1>Aircraft</h1>
      <p class="hint">Each card is one element of 2 or 3 planes. Pilots cost extra: ${[2, 3, 4, 5].map(k => `${SKILL_NAME[k]} +${PILOT_COST[k]}`).join(', ')}.</p></section>
    ${SIDE_KEYS.map(side => `
      <h2>${esc(SIDES[side].name)}</h2>
      ${Object.values(PLANES).filter(p => p.side === side).map(p => `
        <figure class="aircraft">
          <img src="${encodeURI(p.card)}" alt="${esc(p.name)} card">
          <figcaption><strong>${esc(p.name)}</strong> · 2 for ${p.cost[2]} · 3 for ${p.cost[3]}</figcaption>
        </figure>`).join('')}`).join('')}
  `;
}

// ---------- shell & layouts ----------

function parseRoute() {
  const parts = (location.hash || '#/').slice(2).split('/');
  return { name: parts[0] || 'campaign', a: parts[1], b: parts[2] };
}

function missionPicker(turn, tab) {
  const options = MISSIONS.map(m => ({ value: `#/mission/${m.turn}/${tab}`, label: `${m.turn}. ${m.title} — ${m.month}` }));
  return `<select class="title-select" data-nav aria-label="Mission">${optionsHtml(options, `#/mission/${turn}/${tab}`)}</select>`;
}

// Layout A: header shows where you are; bottom tab bar to switch section.
function headerA(route) {
  let title;
  if (route.name === 'mission') title = missionPicker(Number(route.a), route.b || 'overview');
  else if (route.name === 'roster') title = `<span class="title-text">${esc(squadronName(route.a))}</span>`;
  else if (route.name === 'pilot') title = `<span class="title-text">${esc(squadronName(route.a))}</span>`;
  else if (route.name === 'aircraft') title = '<span class="title-text">Aircraft</span>';
  else title = '<span class="title-text">Blood Red Skies</span>';
  return `<header class="appbar">${title}${layoutSwitch()}</header>`;
}

function bottomBar(route) {
  const section = route.name === 'mission' ? 'missions'
    : route.name === 'roster' || route.name === 'pilot' ? 'roster-' + route.a
    : 'campaign';
  const tabs = [
    { key: 'campaign', href: '#/', icon: '★', label: 'Campaign' },
    { key: 'missions', href: '#/missions', icon: '✈', label: 'Missions' },
    { key: 'roster-gb', href: '#/roster/gb', icon: '◎', label: 'RAF', cls: 'side-gb' },
    { key: 'roster-de', href: '#/roster/de', icon: '✠', label: 'Luftwaffe', cls: 'side-de' },
  ];
  return `<nav class="bottombar">${tabs.map(t => `<a href="${t.href}" class="${t.cls || ''} ${section === t.key ? 'on' : ''}"><span class="bb-icon">${t.icon}</span>${t.label}</a>`).join('')}</nav>`;
}

// Layout B: one dropdown to jump anywhere.
function headerB(route) {
  let current = '#/';
  if (route.name === 'mission') current = `#/mission/${route.a}`;
  else if (route.name === 'roster' || route.name === 'pilot') current = `#/roster/${route.a}`;
  else if (route.name === 'aircraft') current = '#/aircraft';
  const options = [
    { value: '#/', label: '★ Campaign' },
    { group: 'Missions', options: MISSIONS.map(m => ({ value: `#/mission/${m.turn}`, label: `${m.turn}. ${m.title}` })) },
    { group: 'Squadrons', options: SIDE_KEYS.map(side => ({ value: `#/roster/${side}`, label: squadronName(side) })) },
    { group: 'Reference', options: [{ value: '#/aircraft', label: 'Aircraft' }] },
  ];
  return `<header class="appbar">
    <select class="title-select jump" data-nav aria-label="Go to">${optionsHtml(options, current)}</select>
    ${layoutSwitch()}
  </header>`;
}

function layoutSwitch() {
  return `<div class="segmented layout-switch" title="Try both navigation layouts">${['a', 'b'].map(l =>
    `<button class="${ui.layout === l ? 'on' : ''}" data-act="set-layout" data-layout="${l}">${l.toUpperCase()}</button>`).join('')}</div>`;
}

function render() {
  const route = parseRoute();

  // "Missions" opens the last mission looked at.
  if (route.name === 'missions') {
    location.replace(`#/mission/${ui.lastMission || 1}`);
    return;
  }
  if (route.name === 'mission' && missionDef(route.a)) {
    ui.lastMission = Number(route.a);
    saveUi();
  }

  let body;
  if (route.name === 'roster' && SIDES[route.a]) body = viewRoster(route.a);
  else if (route.name === 'pilot' && SIDES[route.a]) body = viewPilot(route.a, route.b);
  else if (route.name === 'mission') body = viewMission(Number(route.a), route.b);
  else if (route.name === 'aircraft') body = viewAircraft();
  else body = viewCampaign();

  // Keep focus on whichever field the user moved to.
  const activeId = document.activeElement && document.activeElement.id;
  const layoutA = ui.layout === 'a';
  root.className = `layout-${ui.layout}`;
  root.innerHTML = `
    ${layoutA ? headerA(route) : headerB(route)}
    <main id="app">${body}</main>
    ${layoutA ? bottomBar(route) : ''}
  `;
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
window.addEventListener('hashchange', () => {
  // Only jump to the top when moving to a different page, not between list/debrief sides.
  const page = location.hash.split('/').slice(0, 3).join('/');
  render();
  if (page !== lastPage) window.scrollTo(0, 0);
  lastPage = page;
});
// Opening the app goes to the last mission looked at.
if (!location.hash && ui.lastMission) location.replace(`#/mission/${ui.lastMission}`);
render();
