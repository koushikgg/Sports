import { describe, expect, it } from 'vitest';
import type { CricketState } from './cricket';
import { computeCricketBoards, type Board, type LeaderMatch } from './leaders';

const bat = (id: string, runs: number, balls: number, out: unknown = null) => ({ id, runs, balls, fours: 0, sixes: 0, out });
const bowl = (id: string, legalBalls: number, runs: number, wickets: number) => ({ id, legalBalls, runs, wickets, maidens: 0, wides: 0, noBalls: 0, overRuns: 0 });
const names: Record<string, string> = { a1: 'Asha', a2: 'Bina', a3: 'Chitra', b1: 'Dev', b2: 'Esha', b3: 'Farid' };

/** A plays B. `inn1` is A batting (B bowling), `inn2` is B batting (A bowling). */
function match(o: { winner: 'A' | 'B' | null; completed?: boolean; a?: Record<string, any>; b?: Record<string, any>; bowlA?: Record<string, any>; bowlB?: Record<string, any> }): LeaderMatch {
  const state = {
    kind: 'cricket', teams: [{ id: 'A', name: 'Alpha' }, { id: 'B', name: 'Beta' }],
    squads: { A: ['a1', 'a2', 'a3'], B: ['b1', 'b2', 'b3'] },
    innings: [
      { battingTeamId: 'A', bowlingTeamId: 'B', batters: o.a ?? {}, bowlers: o.bowlB ?? {} },
      { battingTeamId: 'B', bowlingTeamId: 'A', batters: o.b ?? {}, bowlers: o.bowlA ?? {} },
    ],
  } as unknown as CricketState;
  return { state, completed: o.completed ?? true, winnerTeamId: o.winner };
}
const find = (boards: Board[], key: string) => boards.find((b) => b.key === key)!;
const order = (b: Board) => b.rows.map((r) => `${r.playerId}:${r.rank}`);

describe('cricket leaderboards', () => {
  it('wins and losses use the squad, so players who did not bat or bowl count too', () => {
    const b = computeCricketBoards([match({ winner: 'A' }), match({ winner: 'A' }), match({ winner: 'B' })], names);
    expect(order(find(b, 'wins')).slice(0, 3)).toEqual(['a1:1', 'a2:1', 'a3:1']);
    expect(find(b, 'wins').rows[0]!.value).toBe('2');
    expect(find(b, 'wins').rows[0]!.detail).toBe('3 matches · 67% win rate');
    expect(find(b, 'lost').rows.map((r) => r.playerId)).toEqual(['b1', 'b2', 'b3', 'a1', 'a2', 'a3']); // Beta lost twice, Alpha once
    expect(find(b, 'lost').rows[0]!.value).toBe('2');
  });

  it('ties and no results are neither wins nor losses', () => {
    const b = computeCricketBoards([match({ winner: null }), match({ winner: 'A', completed: false })], names);
    expect(find(b, 'wins').rows).toEqual([]);
    expect(find(b, 'lost').rows).toEqual([]);
  });

  it('most wins breaks a tie on win rate, then matches', () => {
    // a1 and a2 both have 1 win; a2 also lost a second match, so a1 has the better win rate
    const m1 = match({ winner: 'A' });
    const m2 = match({ winner: 'B' });
    (m2.state.squads as Record<string, string[]>).A = ['a2', 'a3'];
    const b = computeCricketBoards([m1, m2], names);
    const w = find(b, 'wins');
    expect(w.rows.map((r) => r.playerId).slice(0, 3)).toEqual(['a1', 'a2', 'a3']);
    expect(w.rows[0]!.rank).toBe(1);
    expect(w.rows[1]!.rank).toBe(2);
  });

  it('most wickets in one match: same wickets goes to the better economy', () => {
    const b = computeCricketBoards([
      match({ winner: 'A', bowlB: { b1: bowl('b1', 24, 36, 3), b2: bowl('b2', 24, 28, 3), b3: bowl('b3', 24, 20, 1) } }),
    ], names);
    const best = find(b, 'best-bowling');
    expect(best.rows.map((r) => r.playerId)).toEqual(['b2', 'b1', 'b3']);
    expect(best.rows[0]!.value).toBe('3/28');
    expect(best.rows[0]!.detail).toBe('4.0 ov · econ 7.00 vs Alpha');
  });

  it('best bowling picks each player\'s best match, not their total', () => {
    const b = computeCricketBoards([
      match({ winner: 'A', bowlB: { b1: bowl('b1', 24, 30, 2) } }),
      match({ winner: 'A', bowlB: { b1: bowl('b1', 24, 20, 1), b2: bowl('b2', 24, 10, 2) } }),
    ], names);
    const best = find(b, 'best-bowling');
    expect(best.rows.map((r) => `${r.playerId}:${r.value}`)).toEqual(['b2:2/10', 'b1:2/30']);
  });

  it('exact ties share a place and are marked tied', () => {
    const b = computeCricketBoards([match({ winner: 'A', bowlB: { b1: bowl('b1', 24, 30, 2), b2: bowl('b2', 24, 30, 2), b3: bowl('b3', 12, 5, 1) } })], names);
    const best = find(b, 'best-bowling');
    expect(best.rows.map((r) => [r.playerId, r.rank, r.tied])).toEqual([['b1', 1, true], ['b2', 1, true], ['b3', 3, false]]);
  });

  it('highest score: fewer balls wins a tie on runs, and each player appears once', () => {
    const b = computeCricketBoards([
      match({ winner: 'A', a: { a1: bat('a1', 50, 30, { kind: 'bowled' }), a2: bat('a2', 50, 25, { kind: 'bowled' }), a3: bat('a3', 10, 8) } }),
      match({ winner: 'A', a: { a1: bat('a1', 20, 15) } }),
    ], names);
    const h = find(b, 'highest');
    expect(h.rows.map((r) => `${r.playerId}:${r.value}`)).toEqual(['a2:50', 'a1:50', 'a3:10*']);
    expect(h.rows[0]!.detail).toBe('25 balls vs Beta');
  });

  it('best average needs 2 innings and marks never-out players', () => {
    const b = computeCricketBoards([
      match({ winner: 'A', a: { a1: bat('a1', 60, 40, { kind: 'bowled' }), a2: bat('a2', 90, 50), a3: bat('a3', 100, 50, { kind: 'bowled' }) } }),
      match({ winner: 'A', a: { a1: bat('a1', 30, 20), a2: bat('a2', 10, 10, { kind: 'lbw' }) } }),
    ], names);
    const avg = find(b, 'average');
    // a3 has one innings so does not qualify; a1 = 90/1 = 90.0, a2 = 100/1 = 100.0
    expect(avg.rows.map((r) => `${r.playerId}:${r.value}`)).toEqual(['a2:100.0', 'a1:90.0']);
    expect(avg.note).toMatch(/Minimum 2 innings/);
  });

  it('best average relaxes the minimum when nobody qualifies yet', () => {
    const b = computeCricketBoards([match({ winner: 'A', a: { a1: bat('a1', 40, 30, { kind: 'bowled' }) } })], names);
    const avg = find(b, 'average');
    expect(avg.rows.map((r) => r.playerId)).toEqual(['a1']);
    expect(avg.note).toMatch(/Nobody has batted 2 innings/);
  });

  it('best economy: lower wins, ties go to more wickets, needs 2 overs', () => {
    const b = computeCricketBoards([
      match({ winner: 'A', bowlB: { b1: bowl('b1', 24, 24, 1), b2: bowl('b2', 24, 24, 3), b3: bowl('b3', 6, 1, 0) } }),
    ], names);
    const e = find(b, 'economy');
    expect(e.rows.map((r) => `${r.playerId}:${r.value}`)).toEqual(['b2:6.00', 'b1:6.00']); // b3 has only 1 over
    expect(e.rows[0]!.rank).toBe(1);
    expect(e.rows[1]!.rank).toBe(2);
    expect(e.rows[0]!.bar).toBe(1);
  });

  it('catches count caught dismissals by fielder; run outs and stumpings do not count', () => {
    const b = computeCricketBoards([
      match({ winner: 'A', a: { a1: bat('a1', 5, 5, { kind: 'caught', fielderId: 'b2' }), a2: bat('a2', 5, 5, { kind: 'caught', fielderId: 'b2' }), a3: bat('a3', 5, 5, { kind: 'run_out', fielderId: 'b1' }) } }),
      match({ winner: 'A', a: { a1: bat('a1', 5, 5, { kind: 'stumped', fielderId: 'b1' }) }, b: { b1: bat('b1', 1, 1, { kind: 'caught', fielderId: 'a3' }) } }),
    ], names);
    expect(find(b, 'catches').rows.map((r) => `${r.playerId}:${r.value}`)).toEqual(['b2:2', 'a3:1']);
  });

  it('most runs breaks ties on strike rate; most wickets on economy', () => {
    const b = computeCricketBoards([match({ winner: 'A', a: { a1: bat('a1', 40, 40), a2: bat('a2', 40, 30) }, bowlB: { b1: bowl('b1', 24, 30, 2), b2: bowl('b2', 24, 20, 2) } })], names);
    expect(find(b, 'runs').rows.map((r) => r.playerId)).toEqual(['a2', 'a1']);
    expect(find(b, 'wickets').rows.map((r) => r.playerId)).toEqual(['b2', 'b1']);
  });

  it('every board states its rule and handles an empty tournament', () => {
    const b = computeCricketBoards([], names);
    expect(b).toHaveLength(9);
    expect(b.every((x) => x.rule.length > 0 && x.rows.length === 0)).toBe(true);
  });
});
