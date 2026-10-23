// UI: hash routing, views and edit handling. Every input carries a data-path into the
// state; changes are written straight back, committed, and the view re-rendered.

const app = document.getElementById('app');
const nav = document.getElementById('nav');
const openDetails = new Set(['lists', 'debrief']);

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
  return input(path, value, { type: 'number', dtype: 'int', cls: 'num', attrs });
}

function checkbox(path, checked) {
  return `<input id="${fieldId(path)}" type="checkbox" data-path="${esc(path)}" data-type="bool" ${checked ? 'checked' : ''}>`;
}

function select(path, value, options, { dtype = 'str', cls = '' } = {}) {
  const opts = options.map(o => {
    if (o.group) {
      return `<optgroup label="${esc(o.group)}">${o.options.map(optionHtml(value)).join('')}</optgroup>`;
    }
    return optionHtml(value)(o);
  }).join('');
  return `<select id="${fieldId(path)}" class="${cls}" data-path="${esc(path)}" data-type="${dtype}">${opts}</select>`;
}

function optionHtml(value) {
  return o => `<option value="${esc(o.value)}" ${String(o.value) === String(value ?? '') ? 'selected' : ''} ${o.disabled ? 'disabled' : ''}>${esc(o.label)}</option>`;
}

function textarea(path, value, rows = 3) {
  return `<textarea id="${fieldId(path)}" data-path="${esc(path)}" data-type="str" rows="${rows}">${esc(value)}</textarea>`;
}

function details(key, summary, body, cls = '') {
  return `<details class="${cls}" data-ui="${key}" ${openDetails.has(key) ? 'open' : ''}><summary>${summary}</summary>${body}</details>`;
}

function skillBadge(skill) {
  return `<span class="skill skill-${skill}" title="${SKILL_NAME[skill]}">${skill}<small>${SKILL_NAME[skill]}</small></span>`;
}

function sideTag(side) {
  return `<span class="side-tag side-${side}">${esc(SIDES[side].short)}</span>`;
}

function squadronLabel(side) {
  const s = Store.state.sides[side];
  return s.squadronName ? `${esc(s.squadronName)} <small>(${esc(SIDES[side].name)})</small>` : esc(SIDES[side].name);
}

function joinedLabel(joined) {
  return Number(joined) === 0 ? 'Founding' : `After turn ${joined}`;
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

function resolve(path, create) {
  const parts = path.split('.');
  let obj = Store.state;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    let next;
    if (part.startsWith('#')) next = obj.find(x => x.id === part.slice(1));
    else next = obj[part];
    if (next == null) {
      if (!create) return null;
      next = obj[part] = {};
    }
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
    if (def && ['kia', 'captured', 'mia'].includes(value)) {
      const r = resolve(path, true).obj;
      r.survived = value !== 'kia';
    }
  }
}

app.addEventListener('change', e => {
  const el = e.target.closest('[data-path]');
  if (!el) return;
  const target = resolve(el.dataset.path, true);
  if (!target) return;
  const value = readValue(el);
  target.obj[target.key] = value;
  afterEdit(el.dataset.path, value);
  Store.commit();
});

app.addEventListener('toggle', e => {
  const el = e.target;
  if (!el.dataset || !el.dataset.ui) return;
  if (el.open) openDetails.add(el.dataset.ui);
  else openDetails.delete(el.dataset.ui);
}, true);

// ---------- actions ----------

const actions = {
  'add-pilot'(btn) {
    const side = btn.dataset.side;
    const joined = Number(btn.dataset.joined || 0);
    const pilot = {
      id: newId(), name: '', startSkill: joined ? 2 : 3, startXp: 0, joined, status: 'Active',
      aceSkills: [], namedAceBonus: '', xpAdjust: 0, killsAdjust: 0, notes: '',
    };
    Store.state.sides[side].pilots.push(pilot);
    Store.commit();
    setTimeout(() => {
      const el = document.getElementById(fieldId(`sides.${side}.pilots.#${pilot.id}.name`));
      if (el) el.focus();
    }, 20);
  },
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
    Store.commit();
    if (location.hash.startsWith('#/pilot/')) location.hash = `#/roster/${side}`;
  },
  'add-element'(btn) {
    Store.state.missions[btn.dataset.turn].lists[btn.dataset.side].elements.push(emptyElement());
    Store.commit();
  },
  'remove-element'(btn) {
    const list = Store.state.missions[btn.dataset.turn].lists[btn.dataset.side];
    list.elements.splice(Number(btn.dataset.index), 1);
    Store.commit();
  },
  'add-ace-skill'(btn) {
    const pilot = Store.state.sides[btn.dataset.side].pilots.find(p => p.id === btn.dataset.id);
    pilot.aceSkills.push('');
    Store.commit();
  },
  'remove-ace-skill'(btn) {
    const pilot = Store.state.sides[btn.dataset.side].pilots.find(p => p.id === btn.dataset.id);
    pilot.aceSkills.splice(Number(btn.dataset.index), 1);
    Store.commit();
  },
  async 'file-open'() {
    if (Store.meta.dirty && !confirm('You have changes that are not saved to a file. Open another file anyway?')) return;
    try { await Store.open(); } catch (e) { if (e.name !== 'AbortError') alert('Could not open file: ' + e.message); }
  },
  async 'file-save'() {
    try { await Store.save(); } catch (e) { if (e.name !== 'AbortError') alert('Could not save: ' + e.message); }
  },
  async 'file-saveas'() {
    try { await Store.saveAs(); } catch (e) { if (e.name !== 'AbortError') alert('Could not save: ' + e.message); }
  },
  'file-new'() {
    if (!confirm('Start a brand new campaign? Everything in the app now will be cleared (save it to a file first if you want to keep it).')) return;
    Store.replace(defaultState(), '');
    location.hash = '#/';
  },
};

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  e.preventDefault();
  actions[btn.dataset.act](btn);
});

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    actions['file-save']();
  }
});

window.addEventListener('beforeunload', e => {
  if (Store.meta.dirty) e.preventDefault();
});

// ---------- views ----------

function viewHome() {
  const s = Store.state;
  const totals = campaignTotals(s);
  const leader = totals.gb.kills === totals.de.kills ? null : (totals.gb.kills > totals.de.kills ? 'gb' : 'de');

  const rows = MISSIONS.map(m => {
    const mission = s.missions[m.turn];
    const sc = SCENARIOS[m.scenario];
    const result = mission.winner === 'draw' ? 'Draw' : mission.winner ? `${sideTag(mission.winner)} won` : '<span class="muted">Not played</span>';
    return `<tr>
      <td>${m.turn}</td>
      <td><a href="#/mission/${m.turn}"><strong>${esc(m.title)}</strong></a><br><small>${esc(m.month)}</small></td>
      <td>${m.scenario}: ${esc(sc.name)}</td>
      <td>${m.attacker ? sideTag(m.attacker) : '<span class="muted">—</span>'}</td>
      <td>${result}</td>
      <td class="num">${isPlayed(s, m.turn) ? missionKills(s, m.turn, 'gb') : ''}</td>
      <td class="num">${isPlayed(s, m.turn) ? missionKills(s, m.turn, 'de') : ''}</td>
    </tr>`;
  }).join('');

  const squadronCards = SIDE_KEYS.map(side => {
    const pilots = s.sides[side].pilots;
    const active = pilots.filter(p => p.status === 'Active').length;
    const lost = pilots.filter(p => GONE_STATUSES.includes(p.status)).length;
    const aces = pilots.filter(p => pilotRecord(s, side, p).ace).length;
    return `<a class="card squadron-card side-${side}" href="#/roster/${side}">
      <h3>${squadronLabel(side)}</h3>
      <p>${s.sides[side].player ? 'Player: ' + esc(s.sides[side].player) : '<span class="muted">No player set</span>'}</p>
      <p><strong>${pilots.length}</strong> pilots · ${active} active · ${lost} lost · ${aces} ${SIDES[side].aceTitle}${aces === 1 ? '' : 's'}</p>
    </a>`;
  }).join('');

  return `
    <section class="page-head">
      <p class="eyebrow">Blood Red Skies campaign</p>
      <h1>${input('campaignName', s.campaignName, { cls: 'title-input' })}</h1>
      <p class="muted">Eight missions, May to December 1940, one per month. ${POINTS_LIMIT} points per side, two elements each.</p>
    </section>

    <section class="scoreboard">
      ${SIDE_KEYS.map(side => `
        <div class="score side-${side} ${leader === side ? 'leading' : ''}">
          <div class="score-label">${esc(SIDES[side].name)}</div>
          <div class="score-big">${totals[side].kills}</div>
          <div class="score-sub">enemy planes shot down · ${totals[side].wins} mission${totals[side].wins === 1 ? '' : 's'} won</div>
        </div>`).join('')}
    </section>
    <p class="muted small">Campaign victory goes to the squadron that shot down the most enemy planes.</p>

    <h2>Missions</h2>
    <div class="table-wrap"><table class="grid">
      <thead><tr><th>#</th><th>Mission</th><th>Scenario</th><th>Attacker / bombers</th><th>Result</th><th class="num">RAF kills</th><th class="num">LW kills</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>

    <h2>Squadrons</h2>
    <div class="two-col">${squadronCards}</div>
  `;
}

function viewRoster(side) {
  const s = Store.state;
  const sq = s.sides[side];
  const check = squadronCheck(s, side);
  const R = SQUADRON_RULES;
  const issues = [];
  if (check.foundingCount < R.minPilots) issues.push(`Founding squadron has ${check.foundingCount} pilots; it needs at least ${R.minPilots}.`);
  if (check.foundingCount > R.maxPilots) issues.push(`Founding squadron has ${check.foundingCount} pilots; the maximum is ${R.maxPilots}.`);
  if (check.remaining < 0) issues.push(`${-check.remaining} Pilot Skill point${check.remaining === -1 ? '' : 's'} over the ${R.skillPoints}-point budget.`);
  if (check.onRoster > R.maxPilots) issues.push(`${check.onRoster} pilots on the roster; the maximum squadron size is ${R.maxPilots}.`);

  const pilotRows = sq.pilots.map((p, i) => {
    const rec = pilotRecord(s, side, p);
    const base = `sides.${side}.pilots.#${p.id}`;
    const xpHint = START_XP[p.startSkill];
    const skillOptions = [2, 3, 4, 5].map(k => ({ value: k, label: `${k} ${SKILL_NAME[k]}` }));
    const joinedOptions = [{ value: 0, label: 'Founding' }, ...MISSIONS.map(m => ({ value: m.turn, label: `After turn ${m.turn}` }))];
    const badges = [
      rec.namedAce ? `<span class="badge gold">Named ${SIDES[side].aceTitle}</span>` : rec.ace ? `<span class="badge gold">${SIDES[side].aceTitle}</span>` : '',
      rec.ace && p.aceSkills.filter(Boolean).length < (rec.namedAce ? 2 : 1) ? '<span class="badge warn" title="Record the ace skill card(s) on the pilot page">needs ace skill</span>' : '',
    ].join('');
    return `<tr class="${GONE_STATUSES.includes(p.status) ? 'gone' : ''}">
      <td>${i + 1}</td>
      <td>${input(base + '.name', p.name, { attrs: 'placeholder="Pilot name"' })} ${badges}</td>
      <td>${select(base + '.joined', p.joined, joinedOptions, { dtype: 'int' })}</td>
      <td>${select(base + '.startSkill', p.startSkill, skillOptions, { dtype: 'int' })}</td>
      <td>${numInput(base + '.startXp', p.startXp, `min="0" title="${xpHint ? `${xpHint.dice}: ${xpHint.min}–${xpHint.max}` : ''}"`)}<small class="muted">${xpHint ? xpHint.dice : ''}</small></td>
      <td>${skillBadge(rec.skill)}</td>
      <td class="num">${rec.xp}</td>
      <td class="num">${rec.sorties}</td>
      <td class="num">${rec.kills}</td>
      <td>${select(base + '.status', p.status, PILOT_STATUSES.map(v => ({ value: v, label: v })), { cls: 'status status-' + p.status })}</td>
      <td class="actions"><a href="#/pilot/${side}/${p.id}">Details</a>
        <button class="icon danger" title="Delete pilot" data-act="delete-pilot" data-side="${side}" data-id="${p.id}">✕</button></td>
    </tr>`;
  }).join('');

  return `
    <section class="page-head side-${side}">
      <p class="eyebrow">${esc(SIDES[side].nation)} · Squadron roster</p>
      <h1>${squadronLabel(side)}</h1>
      <div class="form-row">
        <label>Squadron name ${input(`sides.${side}.squadronName`, sq.squadronName, { attrs: `placeholder="e.g. ${side === 'gb' ? 'No. 54 Squadron' : 'II./JG 26'}"` })}</label>
        <label>Player ${input(`sides.${side}.player`, sq.player)}</label>
      </div>
    </section>

    <section class="panel">
      <div class="stats-row">
        <div><span class="stat">${check.foundingCount}</span> founding pilots <small>(${R.minPilots}–${R.maxPilots})</small></div>
        <div><span class="stat">${check.foundingPoints}</span> skill points on founders</div>
        <div><span class="stat">${check.upgradePoints}</span> spent upgrading replacements</div>
        <div><span class="stat ${check.remaining < 0 ? 'bad' : ''}">${check.remaining}</span> of ${R.skillPoints} left</div>
        <div><span class="stat ${check.onRoster > R.maxPilots ? 'bad' : ''}">${check.onRoster}</span> on roster <small>(max ${R.maxPilots})</small></div>
      </div>
      ${issues.length ? `<ul class="issues">${issues.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <p class="small muted">Founding pilots start at skill 2–5 from a ${R.skillPoints}-point budget. Up to ${R.maxReplacements} Rookie replacements arrive at the end of each month; leftover points can raise a replacement to skill 3 (counts as 1 point each).
      Current skill and XP are worked out from starting values plus every recorded mission.</p>
    </section>

    <div class="table-wrap"><table class="grid roster">
      <thead><tr><th>#</th><th>Pilot</th><th>Joined</th><th>Start skill</th><th>Start XP</th><th>Skill</th><th class="num">XP</th><th class="num">Sorties</th><th class="num">Kills</th><th>Status</th><th></th></tr></thead>
      <tbody>${pilotRows || `<tr><td colspan="11" class="muted center">No pilots yet.</td></tr>`}</tbody>
    </table></div>
    <div class="button-row">
      <button data-act="add-pilot" data-side="${side}" data-joined="0">+ Add founding pilot</button>
      <button data-act="add-pilot" data-side="${side}" data-joined="${lastPlayedTurn() || 1}">+ Add replacement</button>
    </div>

    <details class="panel reference"><summary>Experience rules</summary>
      <table class="rules-table">
        <tr><th>Level</th><th>XP</th><th>Starting XP</th><th>List cost</th></tr>
        ${[2, 3, 4, 5].map(k => `<tr><td>${k} ${SKILL_NAME[k]}</td><td>${{ 2: '0–9', 3: '10–25', 4: '26–50', 5: '51+' }[k]}</td><td>${START_XP[k].dice}</td><td>+${PILOT_COST[k]} pts</td></tr>`).join('')}
      </table>
      <ul>
        <li>Survived mission +5 xp <em>(Rookie and Average only)</em></li>
        <li>Squadron is victorious +5 xp <em>(Rookie and Average only)</em></li>
        <li>Each boom chit inflicted on the enemy +1 xp <em>(Rookie and Average only)</em></li>
        <li>Each shooting hit +5 xp <em>(not if dodged)</em></li>
        <li>Each enemy plane shot down +5 xp <em>(cumulative with the hit)</em></li>
        <li>51 XP or ${ACE_KILLS} kills: ${SIDES[side].aceTitle} — Pilot Skill 5 and one ace skill card. ${NAMED_ACE_KILLS} kills: Named ${SIDES[side].aceTitle} — a second ace skill and +1 Firepower or Agility.</li>
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
  if (!p) return `<p>Pilot not found. <a href="#/roster/${side}">Back to roster</a></p>`;
  const rec = pilotRecord(s, side, p);
  const base = `sides.${side}.pilots.#${p.id}`;
  const aceTitle = SIDES[side].aceTitle;
  const fateLabel = key => (FATES.find(f => f.key === key) || FATES[0]).label;

  const aceSkills = p.aceSkills.map((skill, i) => `
    <div class="inline-row">${input(`${base}.aceSkills.${i}`, skill, { attrs: 'placeholder="Ace skill card"' })}
      <button class="icon danger" data-act="remove-ace-skill" data-side="${side}" data-id="${p.id}" data-index="${i}" title="Remove">✕</button></div>`).join('');

  const history = rec.history.map(h => {
    const m = missionDef(h.turn);
    return `<tr>
      <td><a href="#/mission/${h.turn}">${h.turn}. ${esc(m.title)}</a></td>
      <td>${esc(h.plane)}</td>
      <td>${skillBadge(h.skillAtStart)}</td>
      <td class="num">${h.result.hits}</td>
      <td class="num">${h.result.kills}</td>
      <td class="num">${h.result.boom}</td>
      <td>${h.won ? 'Won' : s.missions[h.turn].winner === 'draw' ? 'Draw' : 'Lost'}</td>
      <td>${h.result.survived ? 'Yes' : 'No'}</td>
      <td>${esc(fateLabel(h.result.fate))}</td>
      <td class="num"><strong>+${h.gained}</strong></td>
    </tr>`;
  }).join('');

  return `
    <p class="crumb"><a href="#/roster/${side}">← ${squadronLabel(side)}</a></p>
    <section class="page-head side-${side}">
      <p class="eyebrow">${esc(SIDES[side].nation)} · Pilot</p>
      <h1>${input(base + '.name', p.name, { cls: 'title-input', attrs: 'placeholder="Pilot name"' })}</h1>
      <div class="stats-row">
        <div>${skillBadge(rec.skill)}</div>
        <div><span class="stat">${rec.xp}</span> XP</div>
        <div><span class="stat">${rec.sorties}</span> sorties</div>
        <div><span class="stat">${rec.kills}</span> kills</div>
        <div>${rec.namedAce ? `<span class="badge gold">Named ${aceTitle}</span>` : rec.ace ? `<span class="badge gold">${aceTitle}</span>` : ''}</div>
      </div>
    </section>

    <section class="panel form-grid">
      <label>Status ${select(base + '.status', p.status, PILOT_STATUSES.map(v => ({ value: v, label: v })))}</label>
      <label>Joined ${select(base + '.joined', p.joined, [{ value: 0, label: 'Founding' }, ...MISSIONS.map(m => ({ value: m.turn, label: `After turn ${m.turn}` }))], { dtype: 'int' })}</label>
      <label>Starting skill ${select(base + '.startSkill', p.startSkill, [2, 3, 4, 5].map(k => ({ value: k, label: `${k} ${SKILL_NAME[k]}` })), { dtype: 'int' })}</label>
      <label>Starting XP ${numInput(base + '.startXp', p.startXp, 'min="0"')}<small class="muted">${START_XP[p.startSkill] ? START_XP[p.startSkill].dice : ''}</small></label>
      <label>XP adjustment ${numInput(base + '.xpAdjust', p.xpAdjust)}<small class="muted">Manual correction outside missions</small></label>
      <label>Kills adjustment ${numInput(base + '.killsAdjust', p.killsAdjust)}<small class="muted">Manual correction outside missions</small></label>
    </section>

    <section class="panel">
      <h3>Ace skills</h3>
      ${rec.ace ? '' : `<p class="small muted">Pilots become ${aceTitle}s (Pilot Skill 5) at 51 XP or ${ACE_KILLS} kills and draw an ace skill card.</p>`}
      ${aceSkills}
      <button data-act="add-ace-skill" data-side="${side}" data-id="${p.id}">+ Add ace skill</button>
      ${rec.namedAce || p.namedAceBonus ? `<label class="block">Named ${aceTitle} bonus ${select(base + '.namedAceBonus', p.namedAceBonus, [{ value: '', label: '— choose —' }, { value: 'Firepower', label: '+1 Firepower' }, { value: 'Agility', label: '+1 Agility' }])}</label>` : ''}
    </section>

    <section class="panel">
      <h3>Notes</h3>
      ${textarea(base + '.notes', p.notes, 4)}
    </section>

    <h2>Mission history</h2>
    <div class="table-wrap"><table class="grid">
      <thead><tr><th>Mission</th><th>Plane</th><th>Skill</th><th class="num">Hits</th><th class="num">Kills</th><th class="num">Boom</th><th>Result</th><th>Survived</th><th>Fate</th><th class="num">XP</th></tr></thead>
      <tbody>${history || '<tr><td colspan="10" class="muted center">No missions flown yet.</td></tr>'}</tbody>
    </table></div>
    <p class="button-row"><button class="danger" data-act="delete-pilot" data-side="${side}" data-id="${p.id}">Delete pilot</button></p>
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
    const label = `${p.name || '(unnamed)'} — ${SKILL_NAME[skill]}, ${PILOT_COST[skill]} pts`;
    const opt = { value: p.id, label, disabled: seatedElsewhere.has(p.id) };
    if (p.status === 'Active') available.push(opt);
    else unavailable.push(Object.assign(opt, { label: `${label} (${p.status})` }));
  }
  const options = [{ value: '', label: '— empty seat —' }, ...available];
  if (unavailable.length) options.push({ group: 'Not currently active', options: unavailable });
  return options;
}

function viewListBuilder(turn, side) {
  const s = Store.state;
  const list = s.missions[turn].lists[side];
  const total = listCost(s, turn, side);
  const pct = Math.min(100, (total / POINTS_LIMIT) * 100);
  const planeOptions = [{ value: '', label: '— choose aircraft —' }, ...Object.entries(PLANES).filter(([, pl]) => pl.side === side).map(([k, pl]) => ({ value: k, label: pl.name }))];

  const elements = list.elements.map((el, i) => {
    const base = `missions.${turn}.lists.${side}.elements.${i}`;
    const plane = PLANES[el.plane];
    const cost = elementCost(s, turn, side, el);
    const seats = el.pilots.map((id, seat) => `
      <li>${select(`${base}.pilots.${seat}`, id || '', pilotOptions(s, turn, side, el, seat), { dtype: 'nullstr' })}</li>`).join('');
    return `<div class="element">
      <div class="element-head">
        <strong>Element ${i + 1}</strong>
        <button class="icon danger" title="Remove element" data-act="remove-element" data-turn="${turn}" data-side="${side}" data-index="${i}">✕</button>
      </div>
      <div class="element-body">
        ${plane ? `<img class="card-thumb" src="${encodeURI(plane.card)}" alt="${esc(plane.name)} card">` : '<div class="card-thumb empty">No aircraft</div>'}
        <div class="element-fields">
          ${select(base + '.plane', el.plane, planeOptions)}
          <div class="size-pick">
            ${[2, 3].map(n => `<label class="pill ${el.size === n ? 'on' : ''}"><input type="radio" name="${fieldId(base)}-size" data-path="${base}.size" data-type="int" value="${n}" ${el.size === n ? 'checked' : ''}>${n} planes${plane ? ` · ${plane.cost[n]} pts` : ''}</label>`).join('')}
          </div>
          ${plane ? `<p class="small muted">FP ${plane.fp} · AG ${plane.ag} · SPD ${plane.spd} · ${esc(plane.traits.join(', '))}</p>` : ''}
          <ol class="seats">${seats}</ol>
          <p class="small">Planes ${cost.planes} + pilots ${cost.pilots} = <strong>${cost.total} pts</strong></p>
        </div>
      </div>
    </div>`;
  }).join('');

  return `<div class="list side-${side}">
    <h3>${squadronLabel(side)}</h3>
    <div class="points ${total > POINTS_LIMIT ? 'over' : ''}">
      <div class="points-bar"><span style="width:${pct}%"></span></div>
      <div><strong>${total}</strong> / ${POINTS_LIMIT} pts ${total > POINTS_LIMIT ? `— ${total - POINTS_LIMIT} over` : `— ${POINTS_LIMIT - total} left`}</div>
    </div>
    ${list.elements.length !== 2 ? `<p class="small warn-text">${list.elements.length} element${list.elements.length === 1 ? '' : 's'} (normally two).</p>` : ''}
    ${elements}
    <button data-act="add-element" data-turn="${turn}" data-side="${side}">+ Add element</button>
  </div>`;
}

function viewDebrief(turn, side) {
  const s = Store.state;
  const ids = seatedPilotIds(s, turn, side);
  const won = s.missions[turn].winner === side;
  const rows = ids.map(id => {
    const found = findPilot(s, id);
    if (!found) return '';
    const p = found.pilot;
    const skill = pilotRecord(s, side, p, turn).skill;
    const r = resultFor(s, turn, id);
    const base = `missions.${turn}.results.${id}`;
    return `<tr>
      <td><a href="#/pilot/${side}/${id}">${esc(p.name || '(unnamed)')}</a><br><small class="muted">${esc(planeFlownBy(s, turn, side, id))}</small></td>
      <td>${skillBadge(skill)}</td>
      <td class="center">${checkbox(base + '.survived', r.survived)}</td>
      <td>${numInput(base + '.boom', r.boom, 'min="0"')}</td>
      <td>${numInput(base + '.hits', r.hits, 'min="0"')}</td>
      <td>${numInput(base + '.kills', r.kills, 'min="0"')}</td>
      <td>${select(base + '.fate', r.fate, FATES.map(f => ({ value: f.key, label: f.label })))}</td>
      <td>${numInput(base + '.xpAdjust', r.xpAdjust)}</td>
      <td class="num"><strong>+${isPlayed(s, turn) ? missionXp(r, skill, won) : '—'}</strong></td>
    </tr>`;
  }).join('');

  return `<div class="debrief side-${side}">
    <h3>${squadronLabel(side)} <small>${isPlayed(s, turn) ? missionKills(s, turn, side) + ' enemy planes shot down' : ''}</small></h3>
    <div class="table-wrap"><table class="grid compact">
      <thead><tr><th>Pilot</th><th>Skill</th><th title="Survived the mission">Surv.</th><th title="Boom chits inflicted on the enemy">Boom</th><th title="Shooting hits scored (not dodged)">Hits</th><th>Kills</th><th>Fate</th><th title="Manual XP adjustment">Adj.</th><th class="num">XP</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="9" class="muted center">Pick pilots in the list above first.</td></tr>'}</tbody>
    </table></div>
  </div>`;
}

function viewMission(turn) {
  const s = Store.state;
  const m = missionDef(turn);
  if (!m) return '<p>Mission not found.</p>';
  const mission = s.missions[turn];
  const sc = SCENARIOS[m.scenario];
  const prev = missionDef(turn - 1);
  const next = missionDef(turn + 1);

  let bomberNote = '';
  if (sc.bombers && m.attacker) {
    bomberNote = `<p class="callout">${esc(SIDES[m.attacker].name)} receives free bombers this mission (not tracked here).</p>`;
  }

  return `
    <nav class="pager">
      ${prev ? `<a href="#/mission/${prev.turn}">← ${prev.turn}. ${esc(prev.title)}</a>` : '<span></span>'}
      ${next ? `<a href="#/mission/${next.turn}">${next.turn}. ${esc(next.title)} →</a>` : '<span></span>'}
    </nav>
    <section class="page-head">
      <p class="eyebrow">Turn ${m.turn} · ${esc(m.month)}</p>
      <h1>${esc(m.title)}</h1>
      <p class="scenario-line">Scenario ${m.scenario}: <strong>${esc(sc.name)}</strong> · Attacker / bomber side: ${m.attacker ? sideTag(m.attacker) : 'none'}</p>
      <p class="blurb">${esc(m.blurb)}</p>
      ${bomberNote}
    </section>

    ${details(`rules-${turn}`, `Scenario rules — ${esc(sc.name)} <small>(Air Strike! p.${sc.page})</small>`,
      `<div class="rules">${renderRules(sc.body)}</div>` +
      details('common-rules', `Common scenario rules: Deploying by Elements &amp; High Cover <small>(p.${COMMON_SCENARIO_RULES.page})</small>`,
        `<div class="rules">${renderRules(COMMON_SCENARIO_RULES.body)}</div>`, 'nested'),
      'panel rules-panel')}

    ${details('lists', `Lists <small>${SIDE_KEYS.map(side => `${SIDES[side].short} ${listCost(s, turn, side)}/${POINTS_LIMIT}`).join(' · ')}</small>`,
      `<div class="two-col">${SIDE_KEYS.map(side => viewListBuilder(turn, side)).join('')}</div>`, 'panel')}

    ${details('debrief', 'Debrief &amp; results',
      `<div class="form-row">
        <label>Result ${select(`missions.${turn}.winner`, mission.winner, [
          { value: '', label: 'Not played yet' },
          { value: 'gb', label: `${SIDES.gb.name} won` },
          { value: 'de', label: `${SIDES.de.name} won` },
          { value: 'draw', label: 'Draw' },
        ])}</label>
      </div>
      ${isPlayed(s, turn) ? '' : '<p class="small muted">XP and kills only count once a result is set.</p>'}
      <div class="debriefs">${SIDE_KEYS.map(side => viewDebrief(turn, side)).join('')}</div>
      <p class="small muted">Recording a fate also updates the pilot's status on the roster. After the month, injured pilots recover and up to ${SQUADRON_RULES.maxReplacements} Rookie replacements join; add them on each squadron page.</p>
      <label class="block">Mission notes ${textarea(`missions.${turn}.notes`, mission.notes, 4)}</label>`, 'panel')}
  `;
}

function viewAircraft() {
  return `
    <section class="page-head"><p class="eyebrow">Reference</p><h1>Aircraft</h1>
      <p class="muted">Each card is one element of two or three planes. Pilots are bought on top: ${[2, 3, 4, 5].map(k => `${SKILL_NAME[k]} +${PILOT_COST[k]}`).join(', ')}.</p></section>
    ${SIDE_KEYS.map(side => `
      <h2>${esc(SIDES[side].name)}</h2>
      <div class="aircraft-grid">
        ${Object.values(PLANES).filter(p => p.side === side).map(p => `
          <figure class="aircraft">
            <img src="${encodeURI(p.card)}" alt="${esc(p.name)} card">
            <figcaption><strong>${esc(p.maker)} ${esc(p.name)}</strong> — 2 planes ${p.cost[2]} pts · 3 planes ${p.cost[3]} pts</figcaption>
          </figure>`).join('')}
      </div>`).join('')}
  `;
}

// ---------- shell ----------

function renderNav(route) {
  const s = Store.state;
  const link = (href, label, extra = '') => `<a href="${href}" class="${location.hash === href || (href === '#/' && !location.hash) ? 'active' : ''}">${label}${extra}</a>`;
  nav.innerHTML = `
    <div class="nav-group">
      ${link('#/', 'Campaign')}
    </div>
    <div class="nav-group"><div class="nav-title">Squadrons</div>
      ${SIDE_KEYS.map(side => link(`#/roster/${side}`, esc(s.sides[side].squadronName || SIDES[side].name), ` <span class="dot side-${side}"></span>`)).join('')}
    </div>
    <div class="nav-group"><div class="nav-title">Missions</div>
      ${MISSIONS.map(m => {
        const w = s.missions[m.turn].winner;
        const mark = w ? `<span class="result-mark ${w === 'draw' ? '' : 'side-' + w}">${w === 'draw' ? 'D' : SIDES[w].short === 'RAF' ? 'RAF' : 'LW'}</span>` : '';
        return link(`#/mission/${m.turn}`, `<span class="turn">${m.turn}</span> ${esc(m.title)}`, mark);
      }).join('')}
    </div>
    <div class="nav-group">
      ${link('#/aircraft', 'Aircraft')}
    </div>
  `;
}

function renderFileStatus() {
  const el = document.getElementById('file-status');
  const name = Store.meta.fileName || 'not saved to a file';
  el.innerHTML = `<span class="file-name">${esc(name)}</span>${Store.meta.dirty ? ' <span class="unsaved" title="Changes are autosaved in this browser but not yet saved to the file">● unsaved</span>' : ''}`;
}

function render() {
  const hash = location.hash || '#/';
  const parts = hash.slice(2).split('/');
  // Keep focus on whichever field the user moved to.
  const activeId = document.activeElement && document.activeElement.id;
  let html;
  if (parts[0] === 'roster' && SIDES[parts[1]]) html = viewRoster(parts[1]);
  else if (parts[0] === 'pilot' && SIDES[parts[1]]) html = viewPilot(parts[1], parts[2]);
  else if (parts[0] === 'mission') html = viewMission(Number(parts[1]));
  else if (parts[0] === 'aircraft') html = viewAircraft();
  else html = viewHome();
  app.innerHTML = html;
  renderNav();
  renderFileStatus();
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

Store.init();
Store.onChange(queueRender);
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
render();
