// Static game data: sides, planes, pilot costs, experience rules and the campaign's eight missions.

const POINTS_LIMIT = 500;

const SIDES = {
  gb: { key: 'gb', name: 'Royal Air Force', short: 'RAF', nation: 'Great Britain', aceTitle: 'Ace' },
  de: { key: 'de', name: 'Luftwaffe', short: 'Luftwaffe', nation: 'Germany', aceTitle: 'Experte' },
};
const SIDE_KEYS = ['gb', 'de'];

// Each card is an element of 2 or 3 planes; cost is per element size (top-right dots on the card).
const PLANES = {
  spitfire: {
    side: 'gb', maker: 'Supermarine', name: 'Spitfire Mk I/II', kind: 'Single engine fighter', year: 1940,
    fp: 1, ag: 3, spd: 7, mph: 357, traits: ['Tight Turn'],
    cost: { 2: 62, 3: 93 },
  },
  hurricane: {
    side: 'gb', maker: 'Hawker', name: 'Hurricane Mk II', kind: 'Single engine fighter', year: 1940,
    fp: 1, ag: 2, spd: 7, mph: 342, traits: ['Robust', 'Tight Turn'],
    cost: { 2: 58, 3: 87 },
  },
  beaufighter: {
    side: 'gb', maker: 'Bristol', name: 'Beaufighter', kind: 'Twin engine heavy fighter', year: 1940,
    fp: 3, ag: 1, spd: 6, mph: 323, traits: ['Heavy Hitter', 'Robust', 'Multi Engine (2)'],
    cost: { 2: 88, 3: 132 },
  },
  bf109e: {
    side: 'de', maker: 'Messerschmitt', name: 'Bf 109E', kind: 'Single engine fighter', year: 1939,
    fp: 1, ag: 3, spd: 7, mph: 354, traits: ['Great Climb', 'Great Dive'],
    cost: { 2: 64, 3: 96 },
  },
  bf110c: {
    side: 'de', maker: 'Messerschmitt', name: 'Bf 110C', kind: 'Twin engine heavy fighter', year: 1939,
    fp: 2, ag: 1, spd: 7, mph: 349, traits: ['Great Dive', 'Heavy Hitter', 'Turret (Rear FP1)'],
    cost: { 2: 78, 3: 117 },
  },
};

const PILOT_COST = { 2: 25, 3: 50, 4: 75, 5: 100 };
const SKILL_NAME = { 2: 'Rookie', 3: 'Average', 4: 'Veteran', 5: 'Ace' };
// Starting experience by pilot skill (campaign rules p.5), shown as a hint when creating pilots.
const START_XP = {
  2: { dice: 'D6-1', min: 0, max: 5 },
  3: { dice: 'D6+10', min: 11, max: 16 },
  4: { dice: '3D6+20', min: 23, max: 38 },
  5: { dice: 'D6+50', min: 51, max: 56 },
};

const SQUADRON_RULES = { minPilots: 6, maxPilots: 12, skillPoints: 24, minSkill: 2, maxSkill: 5, maxReplacements: 4 };
const ACE_KILLS = 5;
const NAMED_ACE_KILLS = 15;

const PILOT_STATUSES = ['Active', 'Injured', 'MIA', 'Captured', 'Retired', 'KIA'];
const GONE_STATUSES = ['Captured', 'Retired', 'KIA'];

// Post-mission fates. `status` is applied to the pilot when the fate is recorded.
const FATES = [
  { key: '', label: 'Returned safely', status: null },
  { key: 'scratch', label: 'Shot down – unhurt', status: null },
  { key: 'injured', label: 'Injured – rest of month', status: 'Injured' },
  { key: 'major', label: 'Major injury – also misses next month', status: 'Injured' },
  { key: 'crippled', label: 'Crippling injury – retired', status: 'Retired' },
  { key: 'mia', label: 'MIA', status: 'MIA' },
  { key: 'captured', label: 'Captured', status: 'Captured' },
  { key: 'kia', label: 'KIA', status: 'KIA' },
];

// From "Blood Red Skies: Campaign 1 — The Western Front & Defence of Britain".
const MISSIONS = [
  {
    turn: 1, month: 'May 1940', title: 'Clearing the Skies', scenario: 2, attacker: null,
    blurb: 'The Blitzkrieg opens on 10 May. Luftwaffe fighter gruppen sweep ahead of the bomber formations to establish air superiority over Belgium and northern France before the drive to the Channel and the encirclement that leads to Dunkirk. RAF squadrons contest these sweeps at heavy cost.',
  },
  {
    turn: 2, month: 'June 1940', title: 'Dynamo', scenario: 4, attacker: 'de',
    blurb: 'Operation Dynamo (26 May – 4 June). German bombers attack the beaches and the evacuation fleet, escorted by Bf 109s. Fighter Command flies standing patrols from Kent airfields to intercept.',
  },
  {
    turn: 3, month: 'July 1940', title: 'Choking the Supply Lines', scenario: 11, attacker: 'gb',
    blurb: "Following Hitler's order for Operation Sealion, the Wehrmacht begins shifting troops, ammunition, and barge-hauling equipment north toward the Channel ports by road and rail. Bomber Command's fighter bombers, still recovering from the disastrous daylight raids of May, switch to low-level search-and-strike missions against these inland supply columns and rail movements feeding the invasion build-up.",
  },
  {
    turn: 4, month: 'August 1940', title: 'Adlertag', scenario: 8, attacker: 'de',
    blurb: "Adlertag (13 August) and the “Hardest Day” (18 August) mark the Luftwaffe's pivot from probing coastal shipping to a sustained effort to destroy RAF Fighter Command on the ground — targeting sector airfields, forward fighter stations, and the coastal radar chain that gave Britain its early warning of incoming raids.",
  },
  {
    turn: 5, month: 'September 1940', title: 'Black Saturday', scenario: 7, attacker: 'de',
    blurb: "7 September 1940 marked a decisive shift in German strategy. Having failed to cripple Fighter Command by attacking its airfields through August, the Luftwaffe turned instead to a massed daylight assault on London's docklands and industrial targets — the opening of the Blitz proper. The switch gave Fighter Command's battered squadrons crucial breathing room to recover, even as it exposed London's civilians to sustained bombing for the first time.",
  },
  {
    turn: 6, month: 'October 1940', title: 'Striking the Staging Ports', scenario: 6, attacker: 'gb',
    blurb: "With Operation Sealion postponed but not formally cancelled until 12 October, Bomber Command's No. 2 Group continues daylight raids against the Luftwaffe's forward fighter bases and the Channel ports' invasion-support infrastructure — targets close enough to the English coast for Fighter Command's Spitfires and Hurricanes to fly as escort, unlike the unescorted night raids being mounted against Germany proper during the same period.",
  },
  {
    turn: 7, month: 'November 1940', title: 'Moonlight Sonata', scenario: 0, attacker: 'de',
    blurb: '14/15 November — the Coventry raid marks the night Blitz\'s terrible maturity, guided by X-Gerät pathfinders. RAF night-fighter intruder sorties attempt to catch pathfinders and returning bombers in the dark — a small, high-stakes engagement that mirrors the emerging night war.',
  },
  {
    turn: 8, month: 'December 1940', title: 'The Long Way Back', scenario: 9, attacker: 'de',
    blurb: "By December 1940, the Battle of Britain was over. Beaten off in daylight, the Luftwaffe had turned to night raids on Sheffield, Manchester, and Liverpool — a war of attrition, not a war-winner. For the bomber crews, the flight home was the real ordeal, as Britain's night fighters and flak drove them off rather than let them slip away.",
  },
];
