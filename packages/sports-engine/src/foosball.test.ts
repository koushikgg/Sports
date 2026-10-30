import { describe, expect, it } from 'vitest';
import { decide, replay, type LoggedEvent, type MatchContext, type SportEvent } from './index';
import { foosballEngine as engine, foosballRules, gameWinner, totalGoals, type FoosballState } from './foosball';
import { computeStandings } from './standings';

const ctxOf = (config: Record<string, unknown>): MatchContext => ({ matchId: 'm', teams: [{ id: 'A', name: 'Alpha' }, { id: 'B', name: 'Beta' }], config });
const goal = (side: 'a' | 'b'): SportEvent => ({ type: 'goal', payload: { side } });
const goals = (side: 'a' | 'b', n: number) => Array.from({ length: n }, () => goal(side));

function play(ctx: MatchContext, events: SportEvent[]) {
  const log: LoggedEvent[] = [];
  for (const e of events) {
    const d = decide(engine, ctx, log, e);
    if (!d.ok) throw new Error(`rejected ${e.type}: ${d.error}`);
    log.push({ seq: log.length + 1, ...d.value.event });
  }
  return { state: replay(engine, ctx, log) as FoosballState, log };
}

describe('rules', () => {
  it('fills defaults and ignores nonsense', () => {
    expect(foosballRules({})).toEqual({ firstTo: 10, bestOf: 3, winBy: 1 });
    expect(foosballRules({ firstTo: 7, bestOf: 5, winBy: 2 })).toEqual({ firstTo: 7, bestOf: 5, winBy: 2 });
    expect(foosballRules({ firstTo: 0, bestOf: 4, winBy: 9 })).toEqual({ firstTo: 10, bestOf: 3, winBy: 1 });
    expect(foosballRules(null)).toEqual({ firstTo: 10, bestOf: 3, winBy: 1 });
  });
  it('a game needs the target and the lead', () => {
    expect(gameWinner({ a: 10, b: 9 }, 10, 1)).toBe('a');
    expect(gameWinner({ a: 10, b: 9 }, 10, 2)).toBeNull();
    expect(gameWinner({ a: 11, b: 9 }, 10, 2)).toBe('a');
    expect(gameWinner({ a: 9, b: 10 }, 10, 1)).toBe('b');
    expect(gameWinner({ a: 9, b: 9 }, 10, 1)).toBeNull();
  });
});

describe('a best-of-3 match to 5', () => {
  const ctx = ctxOf({ firstTo: 5, bestOf: 3 });
  it('starts game 1 at 0–0', () => {
    const { state } = play(ctx, []);
    expect(state.games).toEqual([{ a: 0, b: 0, done: false, winner: null }]);
    expect(engine.summary(state, ctx).status).toBe('Best of 3 · first to 5');
  });
  it('moves to the next game when one is won, and ends at two games', () => {
    const one = play(ctx, goals('a', 5));
    expect(one.state.gamesWon).toEqual({ a: 1, b: 0 });
    expect(one.state.games).toHaveLength(2);
    expect(one.state.result).toBeNull();
    const full = play(ctx, [...goals('a', 5), ...goals('b', 5), ...goals('a', 5)]);
    expect(full.state.result).toEqual({ winnerTeamId: 'A', text: 'Alpha won 2–1' });
    expect(full.state.games.map((g) => `${g.a}-${g.b}`)).toEqual(['5-0', '0-5', '5-0']);
    expect(engine.summary(full.state, ctx).status).toBe('Alpha won 2–1 · 5–0, 0–5, 5–0');
    expect(engine.summary(full.state, ctx).sides.map((x) => x.score)).toEqual(['2', '1']);
  });
  it('rejects goals once the match is over, and bad events', () => {
    const { log } = play(ctx, [...goals('a', 5), ...goals('a', 5)]);
    expect(decide(engine, ctx, log, goal('a')).ok).toBe(false);
    expect(decide(engine, ctx, [], { type: 'goal', payload: { side: 'c' } }).ok).toBe(false);
    expect(decide(engine, ctx, [], { type: 'nope', payload: {} }).ok).toBe(false);
  });
  it('undo takes a goal back, even the one that won a game', () => {
    const { log } = play(ctx, goals('a', 5));
    const u = decide(engine, ctx, log, { type: 'undo', payload: {} });
    expect(u.ok && (u.value.state as FoosballState).games).toEqual([{ a: 4, b: 0, done: false, winner: null }]);
    expect(u.ok && (u.value.state as FoosballState).gamesWon).toEqual({ a: 0, b: 0 });
  });
  it('shows the live score in the summary', () => {
    const { state } = play(ctx, [...goals('a', 5), ...goals('b', 2), goal('a')]);
    expect(engine.summary(state, ctx)).toEqual({ sides: [{ name: 'Alpha', score: '1 (1)' }, { name: 'Beta', score: '0 (2)' }], status: 'Game 2 of 3 · 1–2 · games 1–0' });
  });
});

describe('win by two and a single game', () => {
  it('keeps playing past the target until the lead is two', () => {
    const ctx = ctxOf({ firstTo: 3, bestOf: 1, winBy: 2 });
    const { state } = play(ctx, [...goals('a', 2), ...goals('b', 2), goal('a'), goal('b'), goal('a')]);
    expect(state.result).toBeNull();
    expect(state.games[0]).toMatchObject({ a: 4, b: 3 });
    const end = play(ctx, [...goals('a', 2), ...goals('b', 2), goal('a'), goal('b'), goal('a'), goal('a')]);
    expect(end.state.result).toEqual({ winnerTeamId: 'A', text: 'Alpha won 5–3' });
    expect(engine.summary(end.state, ctx).sides.map((x) => x.score)).toEqual(['5', '3']);
  });
});

describe('finishing by hand', () => {
  const ctx = ctxOf({ firstTo: 5, bestOf: 3 });
  it('records a winner or no result and then locks', () => {
    expect(play(ctx, [goal('a'), { type: 'finish', payload: { outcome: 'win', winnerTeamId: 'B' } }]).state.result).toEqual({ winnerTeamId: 'B', text: 'Beta won' });
    expect(play(ctx, [{ type: 'finish', payload: { outcome: 'no_result' } }]).state.result).toEqual({ winnerTeamId: null, text: 'No result' });
    const { log } = play(ctx, [{ type: 'finish', payload: { outcome: 'no_result' } }]);
    expect(decide(engine, ctx, log, goal('a')).ok).toBe(false);
    expect(decide(engine, ctx, [], { type: 'finish', payload: { outcome: 'win', winnerTeamId: 'Z' } }).ok).toBe(false);
  });
});

describe('standings with goals', () => {
  it('ranks by points, then goal difference', () => {
    const ctx = ctxOf({ firstTo: 5, bestOf: 1 });
    const m1 = play(ctx, [...goals('a', 5)]).state;      // Alpha 5-0 Beta
    const g1 = totalGoals(m1);
    const rows = computeStandings(['A', 'B', 'C'], [
      { teamAId: 'A', teamBId: 'B', winnerTeamId: 'A', outcome: 'win', goals: { A: { for: g1.a, against: g1.b }, B: { for: g1.b, against: g1.a } } },
      { teamAId: 'C', teamBId: 'B', winnerTeamId: 'C', outcome: 'win', goals: { C: { for: 5, against: 4 }, B: { for: 4, against: 5 } } },
    ], { win: 1, tie: 0, noResult: 0 }, 'DIFFERENCE');
    expect(rows.map((r) => [r.teamId, r.points, r.diff])).toEqual([['A', 1, 5], ['C', 1, 1], ['B', 0, -6]]);
  });
});
