# Foosball

Foosball is a sport like cricket: teams, tournaments (Table or Custom), matches, a scorer console, live pages and TV mode.
Everything about creating a tournament is the same; picking **Foosball** as the sport swaps the cricket overs for foosball rules.

## Rules (set per tournament, copied onto each match)

| Setting | Options | Default |
|---|---|---|
| Match | single game, best of 3, best of 5 | best of 3 |
| A game goes to | 5, 7, 10 goals (or any 1 to 50 with the stepper) | 10 |
| Finishing a game | first to the target, or must win by 2 | first to the target |

- A game ends when a side has reached the target and leads by enough (1 or 2 goals).
- The match goes to the first side to win most of the games (2 of 3, 3 of 5). There are no ties.
- Points per match: win 1, tie 0, no result 0 (editable). Table order: points, then the chosen tiebreak (goal difference by
  default; goal difference counts goals over every game of every match).
- Rules can be edited until the tournament starts; scheduled matches follow. After the first goal they are locked.

## Scorer console
Two big panels, one per side. Tap a panel (or press **A** / **B**, or the arrow keys) when that side scores. **U** or the big
button undoes the last goal, even the one that won a game. The next game starts by itself. END MATCH records a forfeit or an
agreed winner, or no result. When a match is played out it ends by itself and shows the result with the games.

## How it is built
- Engine: `packages/sports-engine/src/foosball.ts` (events `goal {side}` and `finish`), registered in `all.ts`. Tests in `foosball.test.ts`.
- Rules live in `packages/shared` (`foosballRulesSchema`, option lists) and `tournaments.meta.rules`; matches get them in `config`.
- Standings take goal difference through `FinishedMatch.goals` (`standings.ts`); the table column is DIFF.
- UI: `components/foosball/` (scorer, match-page card, TV), wizard and Edit tournament rules, `scorer-page.tsx` routes by sport.

## Not done
- Doubles/lineups: a team is a team; players are not picked per match and goals are not credited to a person.
- Creating a single foosball match outside a tournament (there is no friendly-match creation for any sport now).
- Foosball leaderboards and player stats beyond matches played and won.
- Sides/serve tracking, golden goal, timers.
