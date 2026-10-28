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
- [ ] **Change bowler mid-over** and **Edit toss and openers** (drawer items). Engine does not support them; use Undo.
- [ ] **Abandoned** option in the end-match sheet: set it from the admin match page status for now.
- [ ] **Wicketkeeper** marker (stumped shows all fielders). Roster has no keeper flag; `match_lineups` is unused.
- [ ] **Overs left** per bowler only shows when a max-overs-per-bowler setting exists (not exposed in the match form yet).
- [ ] Match header shows overs, innings and venue but not the match number.
- [ ] Scorer lock has no timeout; a scorer who leaves keeps the lock until released by them or an admin.
- [ ] Wicket sheet has a Delivery row (normal / wide / no ball) that is not in the design, kept so wides and no-balls with wickets still work.

## Engine and data

- [ ] Foosball engine, scorer and live view (Phase 5).
- [ ] Super over and DLS for cricket.
- [ ] Edit forms for teams, players, tournaments and matches in admin; fixture generation.
- [ ] Redis for more than one realtime instance; audit log UI; rate limits (Phase 6).
