# Blood Red Skies – Campaign Roster

A record-keeping app for a two-player Blood Red Skies (Air Strike!) campaign: *Campaign 1 — The Western Front & Defence of Britain*, eight missions from May to December 1940.

It doesn't drive the game or roll dice. It's a book you can open at any page and edit:

- **Campaign**: scoreboard (enemy planes shot down, missions won) and the mission list.
- **Squadrons**: one roster each for the RAF and the Luftwaffe. Pilots (drag to reorder), starting skill and XP, status, ace skills and notes.
- **Missions**: for each month, the campaign briefing, the result and victory points, and the scenario rules as written in the rulebook. The Lists tab has two modes:
  - a **list builder**: elements of 2 or 3 planes, with pilots assigned to the seats and points checked against 500 (plane cost plus pilot cost, +25/50/75/100 by skill);
  - once saved, a **scoresheet** for the game: hits, victories and boom chits for each pilot, a Result button, and survival and fate once the result is in.
- **Aircraft**: each plane's points, stats and traits.

Pilot XP, skill, sorties and victories are **worked out** from each pilot's starting values plus every recorded mission. Edit any old mission and everything after it updates. A past list keeps the skill and points its pilots had at the time.

## Running it

Open `index.html` in Chrome or Edge. There's no install or build step.

It's designed for phones. The live copy is at https://beatfreak80.github.io/brs-roster/.

**Releasing an update:** bump `APP_VERSION` and every `?v=` in `index.html`, then push to `main`. Open apps notice the new version and reload themselves.

 On a desktop it shows as a phone-width column.

A tab bar at the bottom switches between Campaign, Mission, RAF and Luftwaffe. You pick a mission on the Campaign page, and the Mission tab always shows the one you last picked.

## Saving

Every change is saved in the browser straight away.

**Shared data** (Campaign page › Settings › Shared data) lets both players use the same campaign from their own phones. The data is kept as JSON files on the `data` branch of this repo, one per player:

- `campaign.json`: the Luftwaffe roster, the missions and everything else. Only the Luftwaffe player edits it.
- `raf.json`: the RAF roster. Only the RAF player edits it.

Each phone connects with its side and a GitHub fine-grained token for this repo (Contents: read and write). The app decides which file each phone saves. The other player's data shows read-only. Changes go up 5 seconds after the last edit, and the other player's changes come in when the app opens, when it comes back to the front, and every minute. Fates recorded on a scoresheet reach the RAF roster through the RAF player's app.

**Export backup** / **Import backup** at the bottom of the Campaign page still work. Importing on a connected phone sends that phone's part of the backup up to GitHub.

## Files

- `js/data.js`: planes, points, XP rules and the eight missions
- `js/scenarios.js`: scenario rules text from BRS: Air Strike!
- `js/aceskills.js`: the ace skill cards
- `js/calc.js`: derived values (XP, skill, victories, list points)
- `js/store.js`: state, autosave and the JSON file
- `js/sync.js`: shared data on GitHub
- `js/app.js`: views and editing
- `cards/`: the original plane card images (for reference; the app shows stats instead)

The rulebook PDFs and the campaign Word document are kept out of git (see `.gitignore`).
