# Ratchet — UI brief (for Claude Design)

Paste this whole file into Claude Design, and attach the CricHeroes screenshot
(`~/Pictures/Screenshots/Screenshot from 2026-10-28 11-30-36.png`) as the scoring-screen reference.

## 1. What this is

A company sports app. Admins/scorers score matches live on a phone; everyone else watches live on
phone, laptop, or an office TV. Cricket first (T20 / ODI / custom overs, tape-ball casual games),
foosball next, more sports later. Design for cricket now, but keep layouts sport-agnostic where
possible (score header, "this over / recent" strip, scorecard tables, big-screen board).

**Priorities, in order:** (1) the scorer can enter a ball in one tap without looking twice,
(2) the live view is instantly readable, (3) it looks like a polished product, not an admin template.

## 2. Screens to design (this round)

| # | Screen | Route | Who | Device |
|---|---|---|---|---|
| A | **Scorer console** (the core one) | `/admin/matches/[id]/score` | scorer/admin | phone, one-handed, outdoors |
| B | **Live match view** | `/sports/cricket/matches/[id]` | public | phone first, then desktop |
| C | **Entry points** to A and B | `/`, `/sports/cricket`, `/admin/matches`, `/admin/matches/[id]` | all | phone + desktop |
| D | (stretch) **TV board** | `/display/[id]` | office screen | 1080p/4K landscape |

Design A and B in full detail. For C, design the navigation path and the match card; the rest of
the landing page can stay as-is.

## 3. Design tokens (already in the codebase — keep or refine)

Dark-first. Light theme not needed yet.

| Token | Value | Use |
|---|---|---|
| `bg` | `#0b0f14` | page |
| `surface` | `#121820` | cards |
| `surface-2` | `#1a222d` | inputs, keys, inner blocks |
| `border` | `#263040` | dividers |
| `fg` | `#e8edf3` | text |
| `muted` | `#8b98a9` | secondary text |
| `brand` | `#f59e0b` | amber — primary action, striker highlight, projected/target |
| `accent` | `#3b82f6` | blue — fours, links, secondary action |
| `live` | `#ef4444` | red — LIVE badge, wickets, destructive |
| `success` | `#22c55e` | green — connected, UNDO, completed |

Ball chip colors: dot = `surface-2`/muted, 1-3 runs = white, **4 = blue**, **6 = purple**,
**wicket = red**, extras (wd/nb/b/lb) = amber.
Numbers use tabular figures / monospace so scores don't jitter. Font: system sans.
Stack: Tailwind v4 + React (Next.js). Deliver designs that translate to Tailwind classes.

## 4. Screen A — Scorer console

**Reference:** the attached CricHeroes screenshot. Keep its structure and speed; make it cleaner and
more premium. Mobile portrait, max width ~430px, keypad pinned to the bottom third, thumb-reachable.

### A1. Main scoring screen (state: `awaiting = "ball"`)

Top to bottom:
1. **Top bar** — back arrow ("← Match"), connection dot (green "connected" / grey "connecting…").
2. **Tabs** — `Scoring | Scorecard`.
3. **Score header** (centered, big): batting team name, `32/0` huge, `(2.4/5)` overs/total beside it,
   below: `CRR 12.00 · Projected 60 (at 12 RPO)`. When chasing, replace projected with
   `Need 18 from 14 balls`.
4. **Batters** — two cards side by side: name, `13(5)`. **Striker is highlighted** (amber border +
   `*`). Show 4s/6s optionally.
5. **Bowler row** — name + figures `1.4-0-17-0` (O-M-R-W).
6. **This over** — ball chips in a row (`2 1 2 1`, `W`, `Wd`, `Nb+4`, `4`, `6`, `0`). Empty state: "New over".
7. **Keypad** — the main input. Layout (from the screenshot): left block 3 columns × 3 rows,
   right column of 4 stacked keys.

   ```
   [ 0 ] [ 1 ] [ 2 ] | UNDO   (green)
   [ 3 ] [ 4 ] [ 6 ] | 5, 7
   [WD ] [NB ] [BYE] | OUT    (red)
                     | LB
   ```
   - Run keys are big (≥ 64px), `4` has sub-label FOUR, `6` has SIX.
   - WD / NB / BYE / LB are smaller, muted. `UNDO` green, `OUT` red.
   - Disabled state while a request is in flight (no double taps).
8. **"Scoring shortcuts" drawer** under the keypad (collapsed by default, swipe/tap up):
   Swap strike · Retire batter · Penalty +5 · End innings · Call a tie · No result · Release scorer lock.
9. **Error toast/bar** under the header, e.g. "Your view is out of date", "Another scorer is scoring this match".

### A2. Sheets / dialogs opened from the keypad (bottom sheets on mobile)

- **Extras sheet** (WD / NB / BYE / LB) — pick runs.
  WD: "extra runs on top of the 1-run penalty" 0-6. NB: same, plus a 3-way toggle
  *Off the bat / Byes / Leg byes*. BYE/LB: 1-6.
- **More runs sheet** (`5, 7`) — just 5 and 7.
- **Wicket sheet** (OUT) — one scrollable sheet:
  - Delivery: *Normal / Wide / No ball* (this filters valid dismissals)
  - How out: Bowled, Caught, LBW, Stumped, Hit wicket, Run out
    (Wide → only Stumped / Hit wicket / Run out; No ball → only Run out)
  - Run out only: *Who is out* (striker / non-striker) and *Runs completed* 0-3
  - Caught / Stumped / Run out: *Fielder* picker (optional)
  - Confirm button (red)
- **Retire sheet** — for each batter: "hurt" vs "out".

### A3. Prompt screens (what the scorer must supply next — full-width panels replacing the keypad)

The engine tells the UI what's needed (`awaiting`). Design each:

| `awaiting` | Screen |
|---|---|
| `toss` | Who won (two big toggles), elected to bat/bowl, Continue |
| `innings_start` | First or second innings title ("Need 142 to win" on 2nd), pick striker, non-striker, opening bowler (3 selects), Start |
| `batter` | "New batter" — list of available players from batting squad (retired-hurt players tagged) |
| `bowler` | "Over 3 · choose bowler" — list of bowling squad with their figures; the previous bowler greyed out ("cannot bowl consecutive overs"); capped bowlers greyed out |
| `complete` | Result banner ("Team B won by 3 wickets"), link back to match |

Plus: persistent "Undo last action" button on every prompt screen.

### A4. Scorecard tab
Per innings: header `Team 126/4 (20.0 ov)`; batters table (R, B, 4s, 6s, SR, how-out under the name);
extras line `Extras 9 (b 2, lb 1, wd 5, nb 1)`; did-not-bat; fall of wickets; bowlers table (O, M, R, W, Econ).
Horizontally scrollable tables on mobile.

### A5. Scorer UX rules
- One-handed, thumb zone. Nothing important in the top 30% except the score.
- Haptic-feeling feedback: pressed state, brief highlight of the new chip.
- Never ask for info the engine can infer (strike rotation, end-of-over swap are automatic).
- Undo is always one tap, always visible.
- Works in bright sunlight: high contrast, large numerals.
- Optimistic feel: the new chip appears instantly; if the server rejects it, show the error bar and revert.

## 5. Screen B — Live match view (public)

Mobile first; on desktop use a two-column layout (live panel left, scorecard right).

1. **Header** — `Team A vs Team B`, venue + local date/time, LIVE badge (pulsing dot), connection
   indicator ("● Live updates on"), `TV mode ↗` link.
2. **Score card** — both sides, each `Name … 126/4 (18.2/20)`; the batting side emphasized.
   Under it the status line in amber: `Beta need 18 runs from 14 balls` / `Alpha won by 6 runs` /
   `Innings break · Beta need 143 to win` / `Waiting for toss`.
3. **At the crease** (only while live) — striker `*` and non-striker with `runs (balls)`, current
   bowler with `O-M-R-W`, **this-over chips**, CRR, current partnership `42 (28)`.
4. **Scorecard** — same tables as A4, one card per innings, newest innings first on mobile.
5. States to design: pre-match (no toss), live, innings break, completed (with result), abandoned /
   no result, loading/reconnecting, empty (no players).
6. Live updates should animate subtly: score tick, new chip pops in, wicket flashes red once.
   Respect `prefers-reduced-motion`.

## 6. Entry points (C)

How a viewer reaches B:
`/` landing → **Live now** carousel card → match page, or sport tile → `/sports/cricket` → card → match page.

How a scorer reaches A:
`/admin` → **Matches** → match row → **match detail** → **Open scorer console**.

Design these:
- **Match card** (used on landing, sport hub, carousel): sport label + status badge (Live / Scheduled /
  Completed), two team rows with scores (scores only once started), amber status line, local
  time · venue. Live cards have a red border/dot and update in place.
- **Admin match detail** (`/admin/matches/[id]`): match info (sport, venue, time, config such as overs),
  status buttons (scheduled / live / paused / completed / abandoned), a prominent
  **Open scorer console** primary button, "TV display ↗", delete (danger, separated).
  On mobile this should feel like a launcher: the scorer opens the link on their phone.
- **Admin matches list**: rows with `Team A vs Team B`, sport, time, status badge; a "live" filter chip
  would be welcome.
- **Landing hero + Live now carousel** (snap-scrolling cards, 85% width on mobile).

## 7. (Stretch) Screen D — TV board

Landscape, black background, readable from 10 m: team name, giant `126/4`, overs + CRR + target,
two batter boxes + bowler box (`wkts-runs`), big over chips, amber status line at the bottom,
LIVE badge and connection dot top-right. No chrome, no cursor.

## 8. Data you can mock (real shapes)

Mid-match cricket, Beta chasing 143 in a 20-over game:

```json
{
  "teams": ["Alpha", "Beta"],
  "overs": 20,
  "innings": [
    { "team": "Alpha", "runs": 142, "wickets": 6, "legalBalls": 120, "closed": true },
    {
      "team": "Beta", "runs": 87, "wickets": 3, "legalBalls": 62, "closed": false,
      "striker":    { "name": "Ravi Kumar",  "runs": 41, "balls": 28, "fours": 4, "sixes": 2 },
      "nonStriker": { "name": "Meera Iyer",  "runs": 12, "balls": 11, "fours": 1, "sixes": 0 },
      "bowler":     { "name": "Arjun Mali",  "legalBalls": 14, "maidens": 0, "runs": 22, "wickets": 1 },
      "thisOver": ["1", "4", "W", "Wd", "0", "6"],
      "partnership": { "runs": 33, "balls": 22 },
      "fallOfWickets": ["12-1 (Sam, 1.4)", "44-2 (Dev, 5.1)", "61-3 (Priya, 8.2)"]
    }
  ],
  "status": "Beta need 56 runs from 58 balls",
  "awaiting": "ball"
}
```

Dismissal strings: `b Arjun`, `c Dev b Arjun`, `lbw b Sam`, `st Kiran b Sam`, `run out (Priya)`,
`hit wicket b Sam`, `retired hurt`, `not out`, `batting`.
Ball chip labels: `0 1 2 3 4 6`, `W`, `Wd`, `Wd+2`, `Nb`, `Nb+4`, `Nb+2b`, `2b`, `1lb`, `Wd+W`.
Squads are 4-11 players per team (casual games use 4-8); names can be long, so truncate gracefully.

## 9. Constraints

- Mobile-first (scorer: 360-430px wide; viewers: any). No horizontal page scroll; tables may scroll inside their card.
- Accessible: ≥ 4.5:1 contrast, 44px minimum tap targets (keypad keys much bigger), visible focus rings,
  labels on icon-only buttons, status never conveyed by color alone (badge text + icon).
- Local timezone for times. Right-to-left not needed.
- Keep components small and reusable: `ScoreHeader`, `BatterCard`, `BowlerRow`, `ChipStrip`, `Keypad`,
  `BottomSheet`, `PlayerPicker`, `MatchCard`, `StatusBadge`, `ScorecardTable`.
- Deliver: a frame per state listed above (A1, A2 each sheet, A3 each prompt, A4, B in each state,
  C cards + admin match detail), plus a short note of spacing/type scale so it maps to Tailwind.
