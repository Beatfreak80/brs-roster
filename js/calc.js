// Derived values: pilot experience, skill, kills and list points are all computed from
// each pilot's starting values plus the recorded mission results, so editing any past
// mission flows through to everything after it.

const DEFAULT_RESULT = { survived: true, boom: 0, hits: 0, kills: 0, fate: '', xpAdjust: 0 };

function levelFromXp(xp) {
  if (xp >= 51) return 5;
  if (xp >= 26) return 4;
  if (xp >= 10) return 3;
  return 2;
}

function missionDef(turn) {
  return MISSIONS.find(m => m.turn === Number(turn));
}

function isPlayed(state, turn) {
  return !!state.missions[turn].winner;
}

function findPilot(state, id) {
  for (const side of SIDE_KEYS) {
    const pilot = state.sides[side].pilots.find(p => p.id === id);
    if (pilot) return { side, pilot };
  }
  return null;
}

function seatedPilotIds(state, turn, side) {
  const ids = [];
  for (const el of state.missions[turn].lists[side].elements) {
    for (const id of el.pilots) if (id) ids.push(id);
  }
  return ids;
}

function pilotFlew(state, turn, side, id) {
  return seatedPilotIds(state, turn, side).includes(id);
}

function planeFlownBy(state, turn, side, id) {
  const el = state.missions[turn].lists[side].elements.find(e => e.pilots.includes(id));
  return el && PLANES[el.plane] ? PLANES[el.plane].name : '';
}

function resultFor(state, turn, id) {
  return Object.assign({}, DEFAULT_RESULT, state.missions[turn].results[id]);
}

// XP earned in one mission. Survival, victory and boom chit XP only go to Rookies and Averages.
function missionXp(result, skillAtStart, won) {
  const junior = skillAtStart <= 3;
  let xp = 0;
  if (junior && result.survived) xp += 5;
  if (junior && won) xp += 5;
  if (junior) xp += Number(result.boom) || 0;
  xp += 5 * (Number(result.hits) || 0);
  xp += 5 * (Number(result.kills) || 0);
  xp += Number(result.xpAdjust) || 0;
  return xp;
}

function skillFor(pilot, xp, kills) {
  let skill = Math.max(Number(pilot.startSkill) || 2, levelFromXp(xp));
  if (kills >= ACE_KILLS) skill = 5;
  return Math.min(skill, 5);
}

// Pilot record as it stood at the start of `beforeTurn` (use Infinity for "now"),
// plus a per-mission history.
function pilotRecord(state, side, pilot, beforeTurn = Infinity) {
  let xp = (Number(pilot.startXp) || 0) + (Number(pilot.xpAdjust) || 0);
  let kills = Number(pilot.killsAdjust) || 0;
  let sorties = 0;
  const history = [];
  for (const m of MISSIONS) {
    if (m.turn >= beforeTurn) break;
    if (!isPlayed(state, m.turn) || !pilotFlew(state, m.turn, side, pilot.id)) continue;
    const skillAtStart = skillFor(pilot, xp, kills);
    const result = resultFor(state, m.turn, pilot.id);
    const won = state.missions[m.turn].winner === side;
    const gained = missionXp(result, skillAtStart, won);
    xp += gained;
    kills += Number(result.kills) || 0;
    sorties += 1;
    history.push({ turn: m.turn, skillAtStart, result, won, gained, plane: planeFlownBy(state, m.turn, side, pilot.id) });
  }
  const skill = skillFor(pilot, xp, kills);
  return {
    xp, kills, sorties, skill, history,
    ace: skill === 5,
    namedAce: kills >= NAMED_ACE_KILLS,
  };
}

function elementCost(state, turn, side, el) {
  const plane = PLANES[el.plane];
  const planes = plane ? plane.cost[el.size] || 0 : 0;
  let pilots = 0;
  for (const id of el.pilots) {
    if (!id) continue;
    const found = findPilot(state, id);
    if (found) pilots += PILOT_COST[pilotRecord(state, side, found.pilot, turn).skill];
  }
  return { planes, pilots, total: planes + pilots };
}

function listCost(state, turn, side) {
  let total = 0;
  for (const el of state.missions[turn].lists[side].elements) total += elementCost(state, turn, side, el).total;
  return total;
}

// Enemy planes shot down by `side` in a mission (sum of its pilots' recorded kills).
function missionKills(state, turn, side) {
  if (!isPlayed(state, turn)) return 0;
  return seatedPilotIds(state, turn, side).reduce((n, id) => n + (Number(resultFor(state, turn, id).kills) || 0), 0);
}

function campaignTotals(state) {
  const totals = {};
  for (const side of SIDE_KEYS) {
    totals[side] = { kills: 0, wins: 0 };
    for (const m of MISSIONS) {
      totals[side].kills += missionKills(state, m.turn, side);
      if (state.missions[m.turn].winner === side) totals[side].wins += 1;
    }
  }
  return totals;
}

// Founding squadron check (campaign rules p.1) and replacement upgrade budget.
function squadronCheck(state, side) {
  const pilots = state.sides[side].pilots;
  const founding = pilots.filter(p => Number(p.joined) === 0);
  const foundingPoints = founding.reduce((n, p) => n + (Number(p.startSkill) || 0), 0);
  const upgradePoints = pilots
    .filter(p => Number(p.joined) > 0)
    .reduce((n, p) => n + Math.max(0, (Number(p.startSkill) || 2) - 2), 0);
  const spent = foundingPoints + upgradePoints;
  const onRoster = pilots.filter(p => !GONE_STATUSES.includes(p.status)).length;
  return {
    foundingCount: founding.length,
    foundingPoints,
    upgradePoints,
    spent,
    remaining: SQUADRON_RULES.skillPoints - spent,
    onRoster,
  };
}
