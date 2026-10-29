import type { CricketState } from './cricket';

/** One cricket match as the leaderboards need it. Only completed matches count towards wins, losses and matches played. */
export interface LeaderMatch {
  state: CricketState;
  completed: boolean;
  winnerTeamId: string | null;
}

export interface BoardRow {
  playerId: string;
  /** Joint places share a number: two players equal on every ranking rule are both 1. */
  rank: number;
  tied: boolean;
  value: string;
  detail: string;
  /** 0 to 1, for the bar. */
  bar: number;
}

export interface Board {
  key: string;
  title: string;
  /** The ranking rules, in order, as shown under the title. */
  rule: string;
  /** Set when the minimum was relaxed because nobody met it yet. */
  note?: string;
  rows: BoardRow[];
}

export const MIN_INNINGS = 2;
export const MIN_BOWLED_BALLS = 12; // two overs
const TOP = 5;
const MAX_ROWS = 8;

const overs = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`;
const econ = (runs: number, balls: number) => (balls ? (runs * 6) / balls : Infinity);
const plural = (n: number, w: string) => `${n} ${n === 1 ? w : w === 'match' ? 'matches' : `${w}s`}`;

interface Acc {
  matches: number; wins: number; losses: number;
  appeared: number;
  bat: { innings: number; outs: number; runs: number; balls: number };
  bowl: { balls: number; runs: number; wickets: number };
  catches: number;
  bestBat: { runs: number; balls: number; out: boolean; opp: string } | null;
  bestBowl: { wickets: number; runs: number; balls: number; opp: string } | null;
}
const blank = (): Acc => ({ matches: 0, wins: 0, losses: 0, appeared: 0, bat: { innings: 0, outs: 0, runs: 0, balls: 0 }, bowl: { balls: 0, runs: 0, wickets: 0 }, catches: 0, bestBat: null, bestBowl: null });

type Candidate = { id: string; keys: number[]; value: string; detail: string; score: number; invert?: boolean };

/** Sorts by `keys` (every key is "higher is better"; negate the ones where lower wins) and gives joint places on exact ties. */
function board(key: string, title: string, rule: string, names: Record<string, string>, cands: Candidate[], note?: string): Board {
  const sorted = [...cands].sort((a, b) => {
    for (let i = 0; i < a.keys.length; i++) if (a.keys[i] !== b.keys[i]) return b.keys[i]! - a.keys[i]!;
    return (names[a.id] ?? '').localeCompare(names[b.id] ?? '');
  });
  const same = (a: Candidate, b: Candidate) => a.keys.every((k, i) => k === b.keys[i]);
  const ranked = sorted.map((c, i) => {
    let first = i;
    while (first > 0 && same(sorted[first - 1]!, c)) first--;
    return { c, rank: first + 1 };
  });
  const rows = ranked.filter((r) => r.rank <= TOP).slice(0, MAX_ROWS);
  const scores = rows.map((r) => r.c.score).filter((s) => Number.isFinite(s) && s > 0);
  const best = scores.length ? (rows[0]?.c.invert ? Math.min(...scores) : Math.max(...scores)) : 1;
  return {
    key, title, rule, note,
    rows: rows.map(({ c, rank }) => ({
      playerId: c.id, rank, tied: ranked.filter((r) => r.rank === rank).length > 1, value: c.value, detail: c.detail,
      bar: !Number.isFinite(c.score) || c.score <= 0 ? 0.04 : c.invert ? Math.min(1, best / c.score) : Math.min(1, c.score / best),
    })),
  };
}

/**
 * Tournament leaderboards for cricket. Ranking rules, in order:
 * - Most runs: runs, then strike rate.
 * - Most wickets: wickets, then economy (lower), then fewer runs conceded.
 * - Most wins: wins, then win rate, then more matches.
 * - Most lost: losses, then lower win rate, then more matches.
 * - Most catches: catches, then catches per match, then fewer matches.
 * - Best average: runs per dismissal (never out: runs), then runs, then strike rate. Needs 2 innings.
 * - Highest score: best single innings, then fewer balls faced, then not out.
 * - Best bowling in a match: wickets, then economy (lower), then fewer runs.
 * - Best economy: lower economy, then more wickets, then more overs. Needs 2 overs bowled.
 * Equal on every rule shares a place; the name only orders the list.
 */
export function computeCricketBoards(input: LeaderMatch[], names: Record<string, string>): Board[] {
  const acc = new Map<string, Acc>();
  const get = (id: string) => { let a = acc.get(id); if (!a) acc.set(id, (a = blank())); return a; };

  for (const { state: s, completed, winnerTeamId } of input) {
    if (s?.kind !== 'cricket') continue;
    const teamName = (id: string) => s.teams.find((t) => t.id === id)?.name ?? 'opponent';
    const side = new Map<string, string>(); // player -> team in this match
    for (const [teamId, ids] of Object.entries(s.squads ?? {})) for (const pid of ids) side.set(pid, teamId);
    for (const inn of s.innings) {
      for (const id of Object.keys(inn.batters)) if (!side.has(id)) side.set(id, inn.battingTeamId);
      for (const id of Object.keys(inn.bowlers)) if (!side.has(id)) side.set(id, inn.bowlingTeamId);
    }

    for (const [pid, teamId] of side) {
      const a = get(pid);
      a.appeared++;
      if (!completed) continue;
      a.matches++;
      if (winnerTeamId) (winnerTeamId === teamId ? a.wins++ : a.losses++);
    }

    for (const inn of s.innings) {
      const opp = teamName(inn.bowlingTeamId);
      for (const b of Object.values(inn.batters)) {
        const a = get(b.id);
        a.bat.innings++; a.bat.runs += b.runs; a.bat.balls += b.balls;
        if (b.out) a.bat.outs++;
        const best = a.bestBat;
        const better = !best || b.runs > best.runs || (b.runs === best.runs && (b.balls < best.balls || (b.balls === best.balls && !b.out && best.out)));
        if (better) a.bestBat = { runs: b.runs, balls: b.balls, out: !!b.out, opp };
        if (b.out?.kind === 'caught' && b.out.fielderId) get(b.out.fielderId).catches++;
      }
      const against = teamName(inn.battingTeamId);
      for (const b of Object.values(inn.bowlers)) {
        const a = get(b.id);
        a.bowl.balls += b.legalBalls; a.bowl.runs += b.runs; a.bowl.wickets += b.wickets;
        if (b.legalBalls > 0) {
          const best = a.bestBowl;
          const better = !best || b.wickets > best.wickets || (b.wickets === best.wickets && (econ(b.runs, b.legalBalls) < econ(best.runs, best.balls) || (econ(b.runs, b.legalBalls) === econ(best.runs, best.balls) && b.runs < best.runs)));
          if (better) a.bestBowl = { wickets: b.wickets, runs: b.runs, balls: b.legalBalls, opp: against };
        }
      }
    }
  }

  const all = [...acc].map(([id, a]) => ({ id, a }));
  const sr = (runs: number, balls: number) => (balls ? (runs / balls) * 100 : 0);
  const rate = (a: Acc) => (a.matches ? a.wins / a.matches : 0);
  const pct = (a: Acc) => `${Math.round(rate(a) * 100)}% win rate`;

  const runs = board('runs', 'MOST RUNS', 'Runs, then strike rate', names,
    all.filter(({ a }) => a.bat.runs > 0).map(({ id, a }) => ({ id, keys: [a.bat.runs, sr(a.bat.runs, a.bat.balls)], value: String(a.bat.runs), detail: `${plural(a.bat.balls, 'ball')} · SR ${sr(a.bat.runs, a.bat.balls).toFixed(1)}`, score: a.bat.runs })));

  const wickets = board('wickets', 'MOST WICKETS', 'Wickets, then economy, then fewer runs', names,
    all.filter(({ a }) => a.bowl.wickets > 0).map(({ id, a }) => ({ id, keys: [a.bowl.wickets, -econ(a.bowl.runs, a.bowl.balls), -a.bowl.runs], value: String(a.bowl.wickets), detail: `${overs(a.bowl.balls)} ov · ${a.bowl.runs} runs · econ ${econ(a.bowl.runs, a.bowl.balls).toFixed(2)}`, score: a.bowl.wickets })));

  const wins = board('wins', 'MOST WINS', 'Wins, then win rate, then more matches', names,
    all.filter(({ a }) => a.wins > 0).map(({ id, a }) => ({ id, keys: [a.wins, rate(a), a.matches], value: String(a.wins), detail: `${plural(a.matches, 'match')} · ${pct(a)}`, score: a.wins })));

  const lost = board('lost', 'MOST LOST', 'Losses, then lower win rate, then more matches', names,
    all.filter(({ a }) => a.losses > 0).map(({ id, a }) => ({ id, keys: [a.losses, -rate(a), a.matches], value: String(a.losses), detail: `${plural(a.matches, 'match')} · ${pct(a)}`, score: a.losses })));

  const catches = board('catches', 'MOST CATCHES', 'Catches, then catches per match, then fewer matches', names,
    all.filter(({ a }) => a.catches > 0).map(({ id, a }) => ({ id, keys: [a.catches, a.catches / Math.max(1, a.appeared), -a.appeared], value: String(a.catches), detail: plural(a.appeared, 'match'), score: a.catches })));

  const batters = all.filter(({ a }) => a.bat.innings > 0 && a.bat.runs > 0);
  const qualBat = batters.filter(({ a }) => a.bat.innings >= MIN_INNINGS);
  const avgPool = qualBat.length ? qualBat : batters;
  const average = board('average', 'BEST AVERAGE', 'Runs per dismissal, then runs, then strike rate', names,
    avgPool.map(({ id, a }) => { const avg = a.bat.runs / Math.max(1, a.bat.outs); return { id, keys: [avg, a.bat.runs, sr(a.bat.runs, a.bat.balls)], value: `${avg.toFixed(1)}${a.bat.outs ? '' : '*'}`, detail: `${a.bat.runs} runs · ${plural(a.bat.innings, 'inning')}${a.bat.outs ? '' : ' · never out'}`, score: avg }; }),
    qualBat.length || !batters.length ? `Minimum ${MIN_INNINGS} innings. * means never dismissed, so the average is their runs.` : `Nobody has batted ${MIN_INNINGS} innings yet, so everyone who batted is shown.`);

  const highest = board('highest', 'HIGHEST SCORE IN A MATCH', 'Runs, then fewer balls faced, then not out', names,
    all.filter(({ a }) => a.bestBat && a.bestBat.runs > 0).map(({ id, a }) => { const b = a.bestBat!; return { id, keys: [b.runs, -b.balls, b.out ? 0 : 1], value: `${b.runs}${b.out ? '' : '*'}`, detail: `${plural(b.balls, 'ball')} vs ${b.opp}`, score: b.runs }; }));

  const bestBowling = board('best-bowling', 'BEST BOWLING IN A MATCH', 'Wickets, then economy, then fewer runs', names,
    all.filter(({ a }) => a.bestBowl && a.bestBowl.wickets > 0).map(({ id, a }) => { const b = a.bestBowl!; return { id, keys: [b.wickets, -econ(b.runs, b.balls), -b.runs], value: `${b.wickets}/${b.runs}`, detail: `${overs(b.balls)} ov · econ ${econ(b.runs, b.balls).toFixed(2)} vs ${b.opp}`, score: b.wickets }; }));

  const bowlers = all.filter(({ a }) => a.bowl.balls > 0);
  const qualBowl = bowlers.filter(({ a }) => a.bowl.balls >= MIN_BOWLED_BALLS);
  const econPool = qualBowl.length ? qualBowl : bowlers;
  const economy = board('economy', 'BEST ECONOMY', 'Lower economy, then more wickets, then more overs', names,
    econPool.map(({ id, a }) => { const e = econ(a.bowl.runs, a.bowl.balls); return { id, keys: [-e, a.bowl.wickets, a.bowl.balls], value: e.toFixed(2), detail: `${overs(a.bowl.balls)} ov · ${plural(a.bowl.wickets, 'wkt')} · ${a.bowl.runs} runs`, score: e, invert: true }; }),
    qualBowl.length || !bowlers.length ? 'Minimum 2 overs bowled.' : 'Nobody has bowled 2 overs yet, so everyone who bowled is shown.');

  return [runs, wickets, wins, lost, catches, average, highest, bestBowling, economy];
}
