# UI to-do (from the Claude Design project)

Design project: "Sports Dashboard Showcase" (`e02a7dd4-7cb1-45c3-8d43-942968de3034`), Ratch design system, dark theme.
Built so far: **Scorer Console** and **Matches Dashboard**. Everything below is designed or implied
but not built yet. Implement one by one.

Shared building blocks already in place: `styles/ratch-base.css` (tokens, chips, animations),
`components/ratch/shell.tsx` (top nav), `components/ratch/chip.tsx`.

## Matches dashboard (`/matches`)

- [ ] **Top nav destinations**: Tournaments, Teams, Players, Standings. Shown disabled ("coming soon") in the nav.
- [ ] **Other sports**: the design shows football (minute, "Second half · 67'"), foosball (game 2 of 3) and badminton (set scores). Only cricket has an engine; foosball is Phase 5. Needs engines + per-sport score lines.
- [ ] **Remind me** on upcoming matches. Replaced by a DETAILS link for now. Needs a reminder/notification system (email or push).
- [ ] **Scorer assignment**: the design only shows scoring buttons on matches assigned to that scorer, plus a "my matches" view. Today every admin/scorer sees scoring buttons on every unfinished match. Needs an assignment model and UI in admin.
- [ ] **Match numbers** in the competition label ("CITY T20 · MATCH 14"). Not in the data model.
- [ ] **User menu**: avatar is initials only. No profile menu or sign-out in the nav (sign-out lives in the admin sidebar).
- [ ] **Landing page (`/`) and TV display** still use the old layout. (Sports index, sport hub and match page are now in the Ratch shell.)
- [ ] **No dark designs exist for the match page and sport hub.** They were composed from the Matches Dashboard components plus the structure of the showcase's light-theme "Live match" screen. Send real designs to refine them.
- [ ] **Win probability bar** (in the showcase's live match screen): no model behind it.
- [ ] **Designs in the project not built yet:** `Tournaments.dc.html` and `Create.dc.html`.
- [ ] Showcase "Lineup and profile", player stats, match picks / fantasy league and venue booking screens: not part of the current product scope.
- [ ] **Dedicated scorecard route**: the SCORECARD button opens the match page (which includes the scorecard).
- [ ] Loads at most 200 matches. Add pagination or date windows when volume grows.
- [ ] Decide whether `/matches` should become the home page (`/`).

## Scorer console (`/admin/matches/[id]/score`)

- [ ] **Offline scoring queue**: the design promises balls are saved on the device and sync later. Today scoring pauses when offline (no data is lost, but nothing is queued).
- [ ] **Optimistic updates**: a ball appears after the server confirms (~0.6s, shows "SAVING…"). The design implies it appears instantly.
- [ ] **Free hit after a no-ball**: mentioned in the design copy; the engine does not enforce it.
- [x] **Overs per match.** EDIT MATCH on a match (admins, tournament managers) can change its overs (1 to 50) with the time and venue, until the first event. Powerplay and the bowler cap follow unless set by hand. Not changeable after the toss.
- [x] **Reduce overs mid-match, DLS result, end match.** The scorer console has REDUCE OVERS and END MATCH buttons (also in More actions).
  Reduce overs works in either innings and at the innings break (new overs must be fewer than now and not fewer than the current
  innings has bowled); innings already played keep their overs, the bowler cap follows. After the first innings a revised target can
  be set (DLS table or your own figure): the chase ends when it is reached, and a chase that falls short loses by the gap
  ("X won by 9 runs (DLS method)"). End match: win, tie, no result; from the second innings also "X won · DLS", and an optional
  margin ("by 12 runs"). Not done: the app does not calculate DLS targets itself, and NRR for a shortened match uses the raw overs.
- [x] **Cricket role on the profile.** /profile has BATTER / BOWLER / ALL-ROUNDER (click again to clear), saved in `players.role`
  (BAT, BOWL, AR); picking one creates the person's player record if they had none. WK (set by an organiser) is kept and shown.
- [x] **Edit the toss** until the first ball (from the openers step, the scoring screen header, or More actions). If openers were already picked they are cleared. [ ] **Change bowler mid-over** and **edit openers** still use Undo.
- [x] **Tournament managers.** An admin adds managers to a tournament (MANAGERS tab). Managers score that tournament's matches and edit match time and venue; only admins edit the rest (settings, teams, fixtures, managers); everyone else is a viewer. In a tournament, ordinary scorers can only score a match assigned to them. Matches outside a tournament keep the older rule (any scorer unless assigned elsewhere).
- [ ] **Abandoned** option in the end-match sheet: set it from the admin match page status for now.
- [ ] **Wicketkeeper** marker (stumped shows all fielders). Roster has no keeper flag; `match_lineups` is unused.
- [ ] **Overs left** per bowler only shows when a max-overs-per-bowler setting exists (not exposed in the match form yet).
- [ ] Match header shows overs, innings and venue but not the match number.
- [ ] Scorer lock has no timeout; a scorer who leaves keeps the lock until released by them or an admin.
- [ ] Wicket sheet has a Delivery row (normal / wide / no ball) that is not in the design, kept so wides and no-balls with wickets still work.

## Fixtures

- [x] **Two fixture types, chosen when creating a tournament and editable until it starts.**
  - **Table** (`formatKey: 'lk'`): everyone plays everyone once; the fixtures are generated (circle method, matches per day,
    first match time, rest day, venue per day). The admin picks **top 4** (semi-finals 1st v 4th and 2nd v 3rd, then a final)
    or **top 2** (a final between 1st and 2nd). Knockout sides are table positions that fill in when the league matches are
    done; the league table ignores knockout results. Fixtures are made again automatically when teams or settings change.
  - **Custom** (`formatKey: 'custom'`): the JSON import below.
  - **Matches per team:** a Table can be a full round robin or fewer matches each (every team plays exactly that many, nobody
    twice, no pair repeated). With an odd number of teams only even numbers work. If the team count changes, a value that no
    longer fits drops to the nearest that does. The top 2 / top 4 rows of the table are coloured.
  - Teams can't be added once the tournament has started (and the type, qualifiers, overs and daily schedule lock).
  - `league`, `ko` and `groups` still exist for tournaments made before this; the wizard and editor only offer Table and Custom.
- [x] **Groups in the Custom JSON (format version 3).** The pasted file can have `"groups": [{ "name", "teams" }]`, a `"group"`
  on each group-stage fixture, and knockout sides written `Group A Rank 1`. Each team must be in exactly one group; each
  group must be a full round robin (every pair once); group matches can't be mixed across groups; knockout places can't come
  from "Winner of Match N" of a group match, must come after that group's last match, and are used once. Each group has its
  own points table (P W L T NR NRR Pts, top places marked) on the Standings tab; Fixtures groups matches under the group's
  name, then Semi-final, Final. A group's places resolve once all of that group's matches are done; the semi-finals appear
  when both groups they need are done, the final after the semi-finals. Copy prompt now has a strict typed schema.
  **Second stage (format version 4):** a group can be made of places in earlier groups, e.g.
  `{ "name": "Super Four", "from": ["Group A Rank 1", "Group A Rank 2", "Group B Rank 1", "Group B Rank 2"] }`. It plays its own
  round robin (matches have `"group": "Super Four"` and the places as teams), has its own points table (a placeholder
  table listing the places until they are known; counts only its own matches), and later rounds (quarter-finals, semi-finals,
  final) take places from any group: "Super Four Rank 1". Groups are listed in order; a place can feed one later group or one
  knockout match, never two. Not carried over: points from the first stage don't carry into the second.
  Not done: a Bracket tab built from the real knockout fixtures (group tournaments hide the projected bracket), a manual
  override for ties the tiebreak can't split, creating groups from the wizard (JSON only).
- [ ] Table fixtures are always cricket-style matches with no scorer or playing XI; assigning them in bulk is still open.
- [ ] A Table tournament in a sport with no engine (foosball) saves the generated fixtures as a schedule only, and the
  knockout can't advance until results can be recorded.
- [ ] A league that ends level on every tiebreak decides the semi-final places by the table's order; there is no manual override.
- [x] **Fixture import (JSON, format version 2).** On a tournament's Fixtures tab an admin copies a prompt (teams, venues,
  dates, rules and the JSON format), uses any external tool to make the fixtures, pastes the JSON back, checks it row by
  row, and saves it. Format: `{ "version": 2, "byes": [..], "fixtures": [ { "match", "round", "date", "time", "venue", "teamA", "teamB" } ] }`.
  A side is a team name, or "Winner of Match N" / "Loser of Match N", so a whole knockout (byes, quarter-finals, semi-finals,
  final) can be described. The check flags bad references, a winner used twice, a winner nobody plays, teams missing
  from the bracket, and a knockout whose match count is not teams - 1. Version 1 files still read.
  The format is a proposal; change it in `packages/sports-engine/src/fixture-import.ts` (and bump the version).
- [x] **Knockout slots fill themselves (cricket).** Fixtures with two known teams become scheduled matches at once; a
  "Winner of Match N" slot becomes a match when that match completes with a winner (checked whenever the tournament page is
  opened, and safe to run twice). Until then it shows as TEAMS TBD.
- [x] (done, foosball now has an engine) **Sports without a scoring engine.** Their fixtures are saved as a schedule only (no match rows), because
  a match for a sport with no engine would break the match lists. Foosball is also switched off in Admin > Sports. Needs the
  foosball engine (Phase 5) and a way to record a winner so the bracket can advance.
- [ ] A drawn knockout match (tie, no winner) leaves its next slot waiting; an admin needs a way to pick the winner.
- [ ] The Bracket tab is still a projection from the standings, not the imported bracket.
- [ ] Editing or deleting an imported fixture (reschedule, change venue). Only the match itself can be deleted today.
- [ ] Assigning scorers and lineups to imported fixtures in bulk (they start with no scorer and no XI).
- [ ] Still open from the first plan: venue clashes between fixtures and re-seeding when teams change.
- [ ] Standings for **groups** format (two tables) and a way to advance qualifiers into knockout fixtures.
- [ ] Match wizard rules saved but not enforced yet: wides and no balls re-bowled, super over, DLS. (Free hit and the
  bowler over cap are enforced.)

## Tournaments, create, login

- [ ] **Follow** button on a tournament (needs followers and notifications). Not shown.
- [ ] "Followers have been notified" copy from the Create design is not shown: nothing notifies anyone yet.
- [ ] Editing a tournament or a match after it is created (rules, teams, XI until the toss).
- [ ] Terms of use and privacy policy pages. The login page shows the sentence without links.
- [x] **Private tournaments.** A tournament is Public or Private (WHO CAN SEE IT in the wizard and editor). Private ones, and
  their matches, are visible only to admins and that tournament's managers; everyone else sees a "This tournament is
  private" notice (guests get a sign-in button). The live socket room checks this too. Player stats and leaderboards are
  not filtered by it.
- [x] **Route tree.** Everything sits under its parent: `/tournaments/create`, `/tournaments/[id]/matches/create`,
  `/tournaments/[id]/matches/[matchId]` (+ `/score`, `/display`), and `/sports/[sport]/matches/[id]` (+ `/score`, `/display`)
  for matches with no tournament. Old addresses (`/create`, `/score/[id]`, `/display/[id]`, `/tournaments/[id]/create`)
  redirect. A wrong tournament in the address is corrected.
- [ ] Creating a standalone (friendly) cricket match from the UI was removed with the wizard's tournament/match switch; those
  matches can still be scored and viewed under `/sports/[sport]/matches/[id]`. Needs a home in the new tree.
- [x] Venues are optional for a tournament; matches then have no venue.
- [ ] Real Google round trip is untested until the real client id is added (see docs/AUTH.md).
- [ ] The login brand card shows what is live, or next, from the database; the design's sample feed is not used.

## Engine and data

- [x] Foosball engine, scorer, live view and TV mode: see docs/FOOSBALL.md. [ ] Doubles/lineups, foosball leaderboards, single matches outside a tournament.
- [ ] Super over and DLS for cricket.
- [ ] Edit forms for teams, players, tournaments and matches in admin; fixture generation.
- [ ] Redis for more than one realtime instance; audit log UI; rate limits (Phase 6).
