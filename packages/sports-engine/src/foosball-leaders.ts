import type { Board, BoardRow } from './leaders';
import { playerGoals, type FoosballState } from './foosball';

export interface FoosLeaderMatch { state: FoosballState; completed: boolean }

const MAX_ROWS = 8;
const plural = (n: number, w: string) => `${n} ${n === 1 ? w : w === 'match' ? 'matches' : `${w}s`}`;

/** Joint places share a number: players equal on every ranking rule are both 1. */
function rank(rows: { playerId: string; key: number[]; value: string; detail: string }[]): BoardRow[] {
  const sorted = [...rows].sort((x, y) => { for (let i = 0; i < x.key.length; i++) if (x.key[i] !== y.key[i]) return y.key[i]! - x.key[i]!; return 0; });
  const same = (a: number[], b: number[]) => a.every((v, i) => v === b[i]);
  const top = sorted[0]?.key[0] || 1;
  return sorted.slice(0, MAX_ROWS).map((r, i) => {
    const first = sorted.findIndex((o) => same(o.key, r.key));
    return { playerId: r.playerId, rank: first + 1, tied: sorted.filter((o) => same(o.key, r.key)).length > 1, value: r.value, detail: r.detail, bar: r.key[0]! / top };
  });
}

/** Foosball leaderboards from the scoring log: who scored the goals. Matches without named scorers add nothing. */
export function computeFoosballBoards(input: FoosLeaderMatch[]): Board[] {
  const total = new Map<string, { goals: number; own: number; matches: number; best: number }>();
  for (const { state } of input) {
    const per = playerGoals(state);
    const inSquad = new Set(Object.values(state.squads ?? {}).flat());
    for (const id of new Set([...inSquad, ...Object.keys(per)])) {
      const t = total.get(id) ?? { goals: 0, own: 0, matches: 0, best: 0 };
      const g = per[id] ?? { goals: 0, own: 0 };
      t.goals += g.goals; t.own += g.own; t.matches += 1; t.best = Math.max(t.best, g.goals);
      total.set(id, t);
    }
  }
  const scorers = [...total].filter(([, t]) => t.goals > 0);
  return [
    {
      key: 'goals', title: 'TOP SCORERS', rule: 'goals, then fewer matches played',
      rows: rank(scorers.map(([playerId, t]) => ({ playerId, key: [t.goals, -t.matches], value: String(t.goals), detail: `${plural(t.matches, 'match')} · ${(t.goals / t.matches).toFixed(1)} a match${t.own ? ` · ${plural(t.own, 'own goal')}` : ''}` }))),
    },
    {
      key: 'best', title: 'MOST IN A MATCH', rule: 'goals in a single match, then total goals',
      rows: rank(scorers.map(([playerId, t]) => ({ playerId, key: [t.best, t.goals], value: String(t.best), detail: `${plural(t.goals, 'goal')} in all` }))),
    },
  ];
}
