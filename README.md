# Blood Red Skies – Campaign Roster

A record-keeping app for a two-player Blood Red Skies (Air Strike!) campaign: *Campaign 1 — The Western Front & Defence of Britain*, eight missions from May to December 1940.

It doesn't drive the game or roll dice. It's a book you can open at any page and edit:

- **Campaign**: scoreboard (enemy planes shot down, missions won) and the mission list.
- **Squadrons**: one roster each for the RAF and the Luftwaffe. Pilots, starting skill and XP, status, ace skills and notes. Shows the founding squadron's 6–12 pilots and 24-point check.
- **Missions**: for each month, the campaign briefing and the scenario rules as written in the rulebook, then:
  - a **list builder**: elements of 2 or 3 planes from the cards, with pilots assigned to the seats and points checked against 500 (plane cost plus pilot cost, +25/50/75/100 by skill);
  - a **debrief**: winner, and for each pilot whether they survived, boom chits, hits, kills, fate and XP.
- **Aircraft**: the plane cards.

Pilot XP, skill, sorties and kills are **worked out** from each pilot's starting values plus every recorded mission. Edit any old mission and everything after it updates.

## Running it

Open `index.html` in Chrome or Edge. There's no install or build step.

It's designed for phones. On a desktop it shows as a phone-width column.

A tab bar at the bottom switches between Campaign, Missions, RAF and Luftwaffe. On a mission, the header is a dropdown for picking the month. Missions opens the last mission you looked at.

## Saving

Every change is autosaved in the browser. A shared database will replace this later. Until then, use **Export backup** / **Import backup** at the bottom of the Campaign page to keep a copy.

## Files

- `js/data.js`: planes, points, XP rules and the eight missions
- `js/scenarios.js`: scenario rules text from BRS: Air Strike!
- `js/calc.js`: derived values (XP, skill, kills, list points)
- `js/store.js`: state, autosave and the JSON file
- `js/app.js`: views and editing
- `cards/`: plane cards

The rulebook PDFs and the campaign Word document are kept out of git (see `.gitignore`).
