import { describe, expect, it } from 'vitest';
import { decide, replay, type LoggedEvent, type MatchContext, type SportEvent } from './index';
import { foosballEngine as engine, foosballRules, gameWinner, playerGoals, totalGoals, type FoosballState } from './foosball';
import { computeFoosballBoards } from './foosball-leaders';
import { computeStandings } from './standings';

const ctxOf = (config: Record<string, unknown>): MatchContext => ({ matchId: 'm', teams: [{ id: 'A', name: 'Alpha' }, { id: 'B', name: 'Beta' }], config: { requirePlayers: false, ...config } });
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
    expect(state.games).toEqual([{ a: 0, b: 0, done: false, winner: null, scorers: [] }]);
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
    expect(u.ok && (u.value.state as FoosballState).games).toEqual([{ a: 4, b: 0, done: false, winner: null, scorers: [{ side: 'a', playerId: null, own: false }, { side: 'a', playerId: null, own: false }, { side: 'a', playerId: null, own: false }, { side: 'a', playerId: null, own: false }] }]);
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

describe('goals by player', () => {
  const ctxP: MatchContext = { matchId: 'm', teams: [{ id: 'A', name: 'Alpha' }, { id: 'B', name: 'Beta' }], players: { A: [{ id: 'a1', name: 'Asha' }, { id: 'a2', name: 'Arun' }], B: [{ id: 'b1', name: 'Bela' }] }, config: { firstTo: 3, bestOf: 1 } };
  const g = (side: 'a' | 'b', playerId?: string, own?: boolean): SportEvent => ({ type: 'goal', payload: { side, ...(playerId ? { playerId } : {}), ...(own ? { own } : {}) } });

  it('credits a goal to its scorer and counts unnamed goals', () => {
    const { state } = play(ctxP, [g('a', 'a1'), g('a', 'a1'), g('b', 'b1'), g('a')]);
    expect(state.games[0]!.scorers).toEqual([{ side: 'a', playerId: 'a1', own: false }, { side: 'a', playerId: 'a1', own: false }, { side: 'b', playerId: 'b1', own: false }, { side: 'a', playerId: null, own: false }]);
    expect(playerGoals(state)).toEqual({ a1: { goals: 2, own: 0 }, b1: { goals: 1, own: 0 } });
    expect(state.result?.winnerTeamId).toBe('A');
  });
  it('an own goal scores for the other side and is credited against the player', () => {
    const { state } = play(ctxP, [g('a', 'b1', true)]);
    expect(state.games[0]).toMatchObject({ a: 1, b: 0 });
    expect(playerGoals(state)).toEqual({ b1: { goals: 0, own: 1 } });
  });
  it('rejects a scorer who is not in the right team, and an own goal with nobody named', () => {
    const { log } = play(ctxP, []);
    expect(decide(engine, ctxP, log, g('a', 'b1')).ok).toBe(false);
    expect(decide(engine, ctxP, log, g('b', 'a1')).ok).toBe(false);
    expect(decide(engine, ctxP, log, g('a', 'a1', true)).ok).toBe(false);
    expect(decide(engine, ctxP, log, g('a', undefined, true)).ok).toBe(false);
    expect(decide(engine, ctxP, log, g('a', 'ghost')).ok).toBe(false);
    expect(decide(engine, ctxP, log, g('a', 'a2')).ok).toBe(true);
  });
  it('undo removes the scorer with the goal and goals stay with their game', () => {
    const { log } = play(ctxP, [g('a', 'a1'), g('a', 'a1')]);
    const u = decide(engine, ctxP, log, { type: 'undo', payload: {} });
    expect(u.ok && playerGoals(u.value.state as FoosballState)).toEqual({ a1: { goals: 1, own: 0 } });
    const two = play({ ...ctxP, config: { firstTo: 2, bestOf: 3 } }, [g('a', 'a1'), g('a', 'a2'), g('b', 'b1')]).state;
    expect(two.games.map((x) => x.scorers.length)).toEqual([2, 1]);
  });
});

describe('foosball leaderboards', () => {
  it('ranks scorers and shares a place when level', () => {
    const mk = (events: SportEvent[]) => play({ matchId: 'm', teams: [{ id: 'A', name: 'Alpha' }, { id: 'B', name: 'Beta' }], players: { A: [{ id: 'a1', name: 'x' }, { id: 'a2', name: 'y' }], B: [{ id: 'b1', name: 'z' }] }, config: { firstTo: 3, bestOf: 1 } }, events).state;
    const goal2 = (side: 'a' | 'b', playerId: string): SportEvent => ({ type: 'goal', payload: { side, playerId } });
    const boards = computeFoosballBoards([
      { state: mk([goal2('a', 'a1'), goal2('a', 'a1'), goal2('b', 'b1'), goal2('a', 'a2')]), completed: true },
      { state: mk([goal2('a', 'a1'), goal2('b', 'b1'), goal2('b', 'b1')]), completed: false },
    ]);
    const goals = boards.find((b) => b.key === 'goals')!;
    expect(goals.rows.map((r) => [r.playerId, r.value, r.rank])).toEqual([['a1', '3', 1], ['b1', '3', 1], ['a2', '1', 3]]);
    expect(boards.find((b) => b.key === 'best')!.rows[0]).toMatchObject({ playerId: 'a1', value: '2' });
  });
});

describe('a state saved before the squads were known', () => {
  it('syncContext puts the current team players in, so named goals are accepted', () => {
    const ctxP: MatchContext = { matchId: 'm', teams: [{ id: 'A', name: 'Alpha' }, { id: 'B', name: 'Beta' }], players: { A: [{ id: 'a1', name: 'Asha' }], B: [{ id: 'b1', name: 'Bela' }] }, config: { firstTo: 5, bestOf: 1 } };
    const { state } = play(ctxP, [{ type: 'goal', payload: { side: 'a' } }]);
    const old = { ...state, squads: undefined } as unknown as FoosballState;        // as saved by an older version
    const goalA1: SportEvent = { type: 'goal', payload: { side: 'a', playerId: 'a1' } };
    expect(engine.validate(old, goalA1).ok).toBe(false);
    const fresh = engine.syncContext!(old, ctxP);
    expect(engine.validate(fresh, goalA1).ok).toBe(true);
    // a player added to the team after the match began can score too
    const later = engine.syncContext!(state, { ...ctxP, players: { ...ctxP.players!, A: [...ctxP.players!.A!, { id: 'a9', name: 'New' }] } });
    expect(engine.validate(later, { type: 'goal', payload: { side: 'a', playerId: 'a9' } }).ok).toBe(true);
    expect(engine.apply(fresh, goalA1).games[0]!.scorers.at(-1)).toEqual({ side: 'a', playerId: 'a1', own: false });
  });
});

describe('needing players before the first goal', () => {
  const base: MatchContext = { matchId: 'm', teams: [{ id: 'A', name: 'Alpha' }, { id: 'B', name: 'Beta' }], config: { firstTo: 3, bestOf: 1, requirePlayers: true } };
  const g = (side: 'a' | 'b'): SportEvent => ({ type: 'goal', payload: { side } });
  it('refuses the first goal while a team has nobody, and says which', () => {
    const ctx = { ...base, players: { A: [{ id: 'a1', name: 'x' }], B: [] } };
    const d = decide(engine, ctx, [], g('a'));
    expect(!d.ok && d.error).toBe('Add at least one player to Beta before starting');
  });
  it('allows play once each team has a player, and does not re-check later', () => {
    const ctx = { ...base, players: { A: [{ id: 'a1', name: 'x' }], B: [{ id: 'b1', name: 'y' }] } };
    const { state } = play(ctx, [g('a')]);
    expect(state.games[0]!.a).toBe(1);
    const gone = engine.syncContext!(state, { ...ctx, players: { A: [{ id: 'a1', name: 'x' }], B: [] } });
    expect(engine.validate(gone, g('b')).ok).toBe(true);
  });
  it('is the rule for every match unless it is switched off', () => {
    const none = { ...base, config: { firstTo: 3, bestOf: 1 }, players: { A: [], B: [] } };
    expect(decide(engine, none, [], g('a')).ok).toBe(false);
    expect(decide(engine, { ...none, config: { firstTo: 3, bestOf: 1, requirePlayers: false } }, [], g('a')).ok).toBe(true);
  });
});

describe('singles and doubles', () => {
  const mk = (pps: number | undefined, a: number, b: number): MatchContext => ({
    matchId: 'm', teams: [{ id: 'A', name: 'Alpha' }, { id: 'B', name: 'Beta' }], config: { firstTo: 3, bestOf: 1, ...(pps ? { playersPerSide: pps } : {}) },
    players: { A: Array.from({ length: a }, (_, i) => ({ id: `a${i}`, name: `a${i}` })), B: Array.from({ length: b }, (_, i) => ({ id: `b${i}`, name: `b${i}` })) },
  });
  const g: SportEvent = { type: 'goal', payload: { side: 'a' } };
  it('reads the setting from the match', () => {
    expect(foosballRules({ playersPerSide: 2 }).playersPerSide).toBe(2);
    expect(foosballRules({ playersPerSide: 1 }).playersPerSide).toBe(1);
    expect(foosballRules({ playersPerSide: 5 }).playersPerSide).toBeUndefined();
    expect(foosballRules({}).playersPerSide).toBeUndefined();
    expect(engine.initialState(mk(2, 2, 2)).playersPerSide).toBe(2);
    expect(engine.initialState(mk(undefined, 2, 2)).playersPerSide).toBeNull();
  });
  it('a doubles match needs two players in each team', () => {
    const d = decide(engine, mk(2, 2, 1), [], g);
    expect(!d.ok && d.error).toBe('Beta needs 2 players for a doubles match and has 1');
    expect(decide(engine, mk(2, 0, 2), [], g).ok).toBe(false);
    expect(decide(engine, mk(2, 2, 2), [], g).ok).toBe(true);
    expect(decide(engine, mk(2, 3, 5), [], g).ok).toBe(true);
  });
  it('a singles match needs one', () => {
    expect(decide(engine, mk(1, 1, 1), [], g).ok).toBe(true);
    const d = decide(engine, mk(1, 1, 0), [], g);
    expect(!d.ok && d.error).toBe('Add at least one player to Beta before starting');
  });
  it('a match made before the setting existed needs one, as before', () => {
    expect(decide(engine, mk(undefined, 1, 1), [], g).ok).toBe(true);
    expect(decide(engine, mk(undefined, 1, 0), [], g).ok).toBe(false);
  });
});
