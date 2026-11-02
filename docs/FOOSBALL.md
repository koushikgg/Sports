# Foosball

Foosball is a sport like cricket: teams, tournaments (Table or Custom), matches, a scorer console, live pages and TV mode.
Everything about creating a tournament is the same; picking **Foosball** as the sport swaps the cricket overs for foosball rules.

## Rules (set per tournament, copied onto each match)

| Setting | Options | Default |
|---|---|---|
| Match | single game, best of 3, best of 5 | best of 3 |
| A game goes to | 5, 7, 10 goals (or any 1 to 50 with the stepper) | 10 |
| Finishing a game | first to the target, or must win by 2 | first to the target |
| Players a side | singles (1) or doubles (2) | doubles |

- A game ends when a side has reached the target and leads by enough (1 or 2 goals).
- The match goes to the first side to win most of the games (2 of 3, 3 of 5). There are no ties.
- Points per match: win 1, tie 0, no result 0 (editable). Table order: points, then the chosen tiebreak (goal difference by
  default; goal difference counts goals over every game of every match).
- Rules can be edited until the tournament starts; scheduled matches follow. After the first goal they are locked.

## Starting a match
The console opens with no popup. Until the first goal an inline card says what is needed and scoring is switched off:
- **A team has too few players:** the match's *players a side* setting decides (doubles needs 2 in each team, singles 1; matches
  made before the setting existed need 1). The card says which team is short and how many to add, links to its page, and START
  stays off. The server refuses the first goal and the lineup save in the same case, so this can't be skipped.
- **Every team has exactly the players the match needs:** one START MATCH button; all of them play.
- **A team has more:** CHOOSE PLAYERS opens a picker (one or two a side, as the match says; a team with just enough is picked for you). CANCEL
  closes it and leaves the console as it was; START MATCH saves the pick as the match's playing XI (`match_lineups`), which then
  becomes each team's squad. The players are locked once the first goal is scored.

## Scorer console
Two panels, one per side, each with a button for every player in that team's roster (or the playing XI). Tap the player who
scored: the goal counts for their side and is credited to them. **+ GOAL · NO SCORER** (or **A** / **B**, or the arrow keys)
counts a goal without naming anyone, and is the only button for a team with no players.
**SELF GOAL** (or **O**) turns on self-goal mode: tap the player who put it into their own goal. The point goes to the *other*
team and is credited to that player as a self goal (it is not one of their goals). **U** or the big button undoes the last
goal, even the one that won a game. The next game starts by itself. END MATCH records a forfeit or an
agreed winner, or no result. When a match is played out it ends by itself and shows the result with the games.

## How it is built
- Engine: `packages/sports-engine/src/foosball.ts` (events `goal {side}` and `finish`), registered in `all.ts`. Tests in `foosball.test.ts`.
- Rules live in `packages/shared` (`foosballRulesSchema`, option lists) and `tournaments.meta.rules`; matches get them in `config`.
- Standings take goal difference through `FinishedMatch.goals` (`standings.ts`); the table column is DIFF.
- UI: `components/foosball/` (scorer, match-page card, TV), wizard and Edit tournament rules, `scorer-page.tsx` routes by sport.

## Stats
Each goal in the scoring log carries its scorer and whether it was a self goal. From that:
- **Profile and player pages** get a FOOSBALL tab (every sport that is on has one): matches, won, win rate, games won, goals,
  goals a match, most in a match, self goals; the match list shows goals and self goals per match.
- **Match page** lists who scored (goals and self goals).
- **Tournament Leaders tab**: top scorers, and most goals in a single match.
- A match counts for a player when they are on a team that played it (the playing XI if one was chosen, otherwise the roster).

## Not done
- Doubles: a team is a team; players are not picked per match as a pair (a playing XI works, though).
- Creating a single foosball match outside a tournament (there is no friendly-match creation for any sport now).
- Foosball leaderboards and player stats beyond matches played and won.
- Sides/serve tracking, golden goal, timers.
