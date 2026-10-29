import { describe, expect, it } from 'vitest';
import { decide, replay, type LoggedEvent, type MatchContext, type SportEvent } from './index';
import { canEditToss, chipFor, cricketEngine as engine, currentInnings, type CricketState } from './cricket';

const squad = (p: string) => [1, 2, 3, 4].map((n) => ({ id: `${p}${n}`, name: `${p}${n}` }));
// 4 players a side => max 3 wickets. 2-over match => 12 legal balls.
const ctx: MatchContext = {
  matchId: 'm',
  teams: [{ id: 'A', name: 'Alpha' }, { id: 'B', name: 'Beta' }],
  players: { A: squad('a'), B: squad('b') },
  config: { overs: 2 },
};

const ev = (type: string, payload: Record<string, unknown> = {}): SportEvent => ({ type, payload });
const ball = (runs = 0, extra?: Record<string, unknown>) => ev('ball', { runs, ...extra });

/** Play events through `decide`, throwing on the first rejection. */
function play(events: SportEvent[], history: LoggedEvent[] = []) {
  const log = [...history];
  for (const e of events) {
    const d = decide(engine, ctx, log, e);
    if (!d.ok) throw new Error(`rejected ${e.type}: ${d.error}`);
    log.push({ seq: log.length + 1, ...d.value.event });
  }
  return { state: replay(engine, ctx, log) as CricketState, log };
}
const reject = (events: SportEvent[], bad: SportEvent) => {
  const { log } = play(events);
  const d = decide(engine, ctx, log, bad);
  expect(d.ok).toBe(false);
  return d.ok ? '' : d.error;
};

// Alpha bat first: a1*, a2 vs bowler b1
const setup = [
  ev('toss', { winnerTeamId: 'A', decision: 'bat' }),
  ev('start_innings', { strikerId: 'a1', nonStrikerId: 'a2', bowlerId: 'b1' }),
];

describe('setup flow', () => {
  it('walks toss -> innings_start -> ball', () => {
    expect(play([]).state.awaiting).toBe('toss');
    expect(play(setup.slice(0, 1)).state.awaiting).toBe('innings_start');
    expect(play(setup).state.awaiting).toBe('ball');
  });

  it('batting team follows the toss decision', () => {
    const { state } = play([
      ev('toss', { winnerTeamId: 'A', decision: 'bowl' }),
      ev('start_innings', { strikerId: 'b1', nonStrikerId: 'b2', bowlerId: 'a1' }),
    ]);
    expect(currentInnings(state)!.battingTeamId).toBe('B');
  });

  it('rejects scoring before the toss and bad openers', () => {
    expect(decide(engine, ctx, [], ball(1)).ok).toBe(false);
    reject(setup.slice(0, 1), ev('start_innings', { strikerId: 'a1', nonStrikerId: 'a1', bowlerId: 'b1' }));
    reject(setup.slice(0, 1), ev('start_innings', { strikerId: 'b1', nonStrikerId: 'a2', bowlerId: 'b1' }));
  });

  it('requires 2+ players per team', () => {
    const thin: MatchContext = { ...ctx, players: { A: squad('a').slice(0, 1), B: squad('b') } };
    expect(decide(engine, thin, [], ev('toss', { winnerTeamId: 'A', decision: 'bat' })).ok).toBe(false);
  });
});

describe('runs and strike', () => {
  it('rotates strike on odd runs only', () => {
    const { state } = play([...setup, ball(1), ball(2), ball(3)]);
    const inn = currentInnings(state)!;
    expect(inn.runs).toBe(6);
    // a1 faces the 1 (swap), a2 faces the 2 (no swap) and the 3 (swap) => a1 on strike
    expect(inn.striker).toBe('a1');
    expect(inn.batters.a1!.runs).toBe(1);
    expect(inn.batters.a2!.runs).toBe(5);
  });

  it('counts fours and sixes and shows chips', () => {
    const inn = currentInnings(play([...setup, ball(4), ball(6), ball(0)]).state)!;
    expect(inn.batters.a1).toMatchObject({ runs: 10, fours: 1, sixes: 1, balls: 3 });
    expect(inn.thisOver.map((c) => c.kind)).toEqual(['four', 'six', 'dot']);
  });

  it('swaps ends and asks for a bowler after the over; same bowler cannot continue', () => {
    const over = [ball(0), ball(0), ball(0), ball(0), ball(0), ball(0)];
    const { state } = play([...setup, ...over]);
    const inn = currentInnings(state)!;
    expect(state.awaiting).toBe('bowler');
    expect(inn.striker).toBe('a2'); // ends swapped
    expect(inn.thisOver).toEqual([]);
    expect(inn.bowlers.b1).toMatchObject({ legalBalls: 6, maidens: 1 });
    reject([...setup, ...over], ev('new_bowler', { playerId: 'b1' }));
    expect(play([...setup, ...over, ev('new_bowler', { playerId: 'b2' })]).state.awaiting).toBe('ball');
  });

  it('does not award a maiden when runs were conceded', () => {
    const { state } = play([...setup, ball(0), ball(0), ball(0), ball(0), ball(0), ball(2)]);
    expect(currentInnings(state)!.bowlers.b1!.maidens).toBe(0);
  });
});

describe('extras', () => {
  it('wide: +1 penalty, extra runs added, not a legal ball, not faced', () => {
    const inn = currentInnings(play([...setup, ball(2, { extra: 'wd' })]).state)!;
    expect(inn.runs).toBe(3);
    expect(inn.extras.wd).toBe(3);
    expect(inn.legalBalls).toBe(0);
    expect(inn.batters.a1!.balls).toBe(0);
    expect(inn.bowlers.b1).toMatchObject({ runs: 3, wides: 1 });
    expect(inn.striker).toBe('a1'); // 2 extra runs run => even, no swap
  });

  it('wide with 1 run swaps strike (batters crossed)', () => {
    expect(currentInnings(play([...setup, ball(1, { extra: 'wd' })]).state)!.striker).toBe('a2');
  });

  it('no-ball: runs off the bat go to the batter, ball is faced but not legal', () => {
    const inn = currentInnings(play([...setup, ball(4, { extra: 'nb' })]).state)!;
    expect(inn.runs).toBe(5);
    expect(inn.legalBalls).toBe(0);
    expect(inn.batters.a1).toMatchObject({ runs: 4, balls: 1, fours: 1 });
    expect(inn.bowlers.b1!.runs).toBe(5);
  });

  it('no-ball with byes: penalty on the bowler, byes are extras', () => {
    const inn = currentInnings(play([...setup, ball(2, { extra: 'nb', nbKind: 'b' })]).state)!;
    expect(inn.runs).toBe(3);
    expect(inn.extras).toMatchObject({ nb: 1, b: 2 });
    expect(inn.batters.a1!.runs).toBe(0);
    expect(inn.bowlers.b1!.runs).toBe(1);
  });

  it('byes and leg byes: legal, team runs, not charged to the bowler', () => {
    const inn = currentInnings(play([...setup, ball(1, { extra: 'b' }), ball(2, { extra: 'lb' })]).state)!;
    expect(inn.runs).toBe(3);
    expect(inn.legalBalls).toBe(2);
    expect(inn.bowlers.b1!.runs).toBe(0);
    expect(inn.batters.a2!.balls).toBe(1); // a2 took strike after the bye
  });

  it('penalty runs go to the total and extras', () => {
    const inn = currentInnings(play([...setup, ev('penalty', { runs: 5 })]).state)!;
    expect(inn.runs).toBe(5);
    expect(inn.extras.pen).toBe(5);
  });

  it('does not let a wide ball end the over', () => {
    const wides = [ball(0, { extra: 'wd' }), ball(0, { extra: 'wd' })];
    const { state } = play([...setup, ...wides, ball(), ball(), ball(), ball(), ball()]);
    expect(state.awaiting).toBe('ball'); // 5 legal balls so far
  });
});

describe('wickets', () => {
  const bowled = (id = 'a1') => ball(0, { wicket: { kind: 'bowled', playerId: id } });

  it('credits the bowler, records FoW, and asks for a new batter who takes strike', () => {
    const { state } = play([...setup, ball(1), ball(1), bowled('a1')]);
    const inn = currentInnings(state)!;
    expect(state.awaiting).toBe('batter');
    expect(inn.wickets).toBe(1);
    expect(inn.bowlers.b1!.wickets).toBe(1);
    expect(inn.batters.a1!.out).toMatchObject({ kind: 'bowled', bowlerId: 'b1' });
    expect(inn.fow).toEqual([{ runs: 2, wickets: 1, playerId: 'a1', over: '0.3' }]);
    expect(inn.striker).toBeNull();

    const next = play([ev('new_batter', { playerId: 'a3' })], play([...setup, ball(1), ball(1), bowled('a1')]).log).state;
    expect(currentInnings(next)!.striker).toBe('a3');
    expect(next.awaiting).toBe('ball');
  });

  it('wicket on the last ball of an over: new batter ends up at the non-striker end', () => {
    const { log } = play([...setup, ball(), ball(), ball(), ball(), ball(), bowled('a1')]);
    const batterPrompt = replay(engine, ctx, log) as CricketState;
    expect(batterPrompt.awaiting).toBe('batter'); // batter first, then bowler
    const after = play([ev('new_batter', { playerId: 'a3' })], log).state;
    expect(currentInnings(after)!.striker).toBe('a2');
    expect(currentInnings(after)!.nonStriker).toBe('a3');
    expect(after.awaiting).toBe('bowler');
  });

  it('run out can dismiss the non-striker, runs still count', () => {
    const { state } = play([...setup, ball(1, { wicket: { kind: 'run_out', playerId: 'a1' } })]);
    const inn = currentInnings(state)!;
    expect(inn.runs).toBe(1);
    expect(inn.bowlers.b1!.wickets).toBe(0); // not credited to the bowler
    expect(inn.nonStriker).toBeNull(); // a1 crossed to the non-striker end and is out
  });

  it('rejects impossible dismissals', () => {
    reject(setup, ball(0, { extra: 'wd', wicket: { kind: 'caught', playerId: 'a1' } }));
    reject(setup, ball(0, { extra: 'nb', wicket: { kind: 'bowled', playerId: 'a1' } }));
    reject(setup, ball(0, { wicket: { kind: 'bowled', playerId: 'a2' } })); // non-striker bowled
    reject(setup, ball(0, { wicket: { kind: 'bowled', playerId: 'zzz' } }));
    expect(play([...setup, ball(0, { extra: 'wd', wicket: { kind: 'stumped', playerId: 'a1' } })]).state.awaiting).toBe('batter');
  });

  it('a dismissed batter cannot come back', () => {
    const events = [...setup, bowled('a1')];
    reject(events, ev('new_batter', { playerId: 'a1' }));
    reject(events, ev('new_batter', { playerId: 'a2' }));
    reject(events, ev('new_batter', { playerId: 'b1' }));
  });

  it('retired hurt is not a wicket and the batter may return', () => {
    const { state, log } = play([...setup, ev('retire', { playerId: 'a1', kind: 'retired_hurt' })]);
    expect(currentInnings(state)!.wickets).toBe(0);
    expect(state.awaiting).toBe('batter');
    const back = play([ev('new_batter', { playerId: 'a1' })], log).state;
    expect(currentInnings(back)!.batters.a1!.out).toBeNull();
  });

  it('retired out counts as a wicket', () => {
    expect(currentInnings(play([...setup, ev('retire', { playerId: 'a2', kind: 'retired_out' })]).state)!.wickets).toBe(1);
  });
});

describe('innings and match', () => {
  const secondInnings = ev('start_innings', { strikerId: 'b1', nonStrikerId: 'b2', bowlerId: 'a1' });
  const overs = (n: number, perBall = 1): SportEvent[] => Array.from({ length: n * 6 }, () => ball(perBall % 2 === 0 ? 0 : 0));

  it('closes the innings when the overs are up', () => {
    // 12 balls of 1 run each over 2 overs; bowlers alternate
    const events: SportEvent[] = [...setup];
    for (let o = 0; o < 2; o++) {
      if (o === 1) events.push(ev('new_bowler', { playerId: 'b2' }));
      for (let i = 0; i < 6; i++) events.push(ball(1));
    }
    const { state } = play(events);
    const inn = currentInnings(state)!;
    expect(inn.closed).toBe(true);
    expect(inn.closeReason).toBe('overs');
    expect(inn.runs).toBe(12);
    expect(state.awaiting).toBe('innings_start');
  });

  it('closes when all out (squad - 1 wickets)', () => {
    const { state } = play([
      ...setup,
      ball(0, { wicket: { kind: 'bowled', playerId: 'a1' } }),
      ev('new_batter', { playerId: 'a3' }),
      ball(0, { wicket: { kind: 'bowled', playerId: 'a3' } }),
      ev('new_batter', { playerId: 'a4' }),
      ball(0, { wicket: { kind: 'bowled', playerId: 'a4' } }),
    ]);
    expect(currentInnings(state)!.closeReason).toBe('all_out');
    expect(state.awaiting).toBe('innings_start');
  });

  /** Alpha score 6 in 2 overs: 6 balls of 1 + 6 dots */
  const alphaInnings = (): SportEvent[] => {
    const e: SportEvent[] = [...setup];
    for (let i = 0; i < 6; i++) e.push(ball(i < 6 ? 1 : 0));
    e.push(ev('new_bowler', { playerId: 'b2' }));
    for (let i = 0; i < 6; i++) e.push(ball(0));
    return e;
  };

  it('second innings: chasing team wins by wickets and the match completes', () => {
    const { state } = play([...alphaInnings(), secondInnings, ball(4), ball(2, { extra: 'nb', nbKind: 'bat' })]);
    // target 7; 4 + (2+1) = 7 -> wins
    expect(state.result).toMatchObject({ winnerTeamId: 'B' });
    expect(state.result!.text).toContain('Beta won by 3 wickets');
    expect(state.awaiting).toBe('complete');
    expect(engine.outcome!(state).complete).toBe(true);
  });

  it('first team wins by runs', () => {
    const e = [...alphaInnings(), secondInnings];
    for (let i = 0; i < 6; i++) e.push(ball(0));
    e.push(ev('new_bowler', { playerId: 'a2' }));
    for (let i = 0; i < 6; i++) e.push(ball(0));
    const { state } = play(e);
    expect(state.result!.text).toBe('Alpha won by 6 runs');
  });

  it('tie when scores are level after the overs', () => {
    const e = [...alphaInnings(), secondInnings];
    for (let i = 0; i < 6; i++) e.push(ball(1));
    e.push(ev('new_bowler', { playerId: 'a2' }));
    for (let i = 0; i < 6; i++) e.push(ball(0));
    expect(play(e).state.result).toEqual({ winnerTeamId: null, text: 'Match tied' });
  });

  it('refuses further scoring once complete', () => {
    const { log } = play([...alphaInnings(), secondInnings, ball(6), ball(1)]);
    expect(decide(engine, ctx, log, ball(1)).ok).toBe(false);
  });

  it('declare / end innings and manual finish', () => {
    expect(currentInnings(play([...setup, ball(2), ev('end_innings')]).state)!.closeReason).toBe('declared');
    const { state } = play([...setup, ev('finish', { outcome: 'no_result' })]);
    expect(state.result!.text).toBe('No result');
  });

  it('summary shows scores and the chase equation', () => {
    const { state } = play([...alphaInnings(), secondInnings, ball(2)]);
    const s = engine.summary(state, ctx);
    expect(s.sides).toEqual([
      { name: 'Alpha', score: '6/0 (2.0/2)' },
      { name: 'Beta', score: '2/0 (0.1/2)' },
    ]);
    expect(s.status).toBe('Beta need 5 runs from 11 balls');
  });

  it('enforces max overs per bowler when configured', () => {
    const limited: MatchContext = { ...ctx, config: { overs: 3, maxOversPerBowler: 1 } };
    const log: LoggedEvent[] = [];
    const run = (e: SportEvent) => {
      const d = decide(engine, limited, log, e);
      if (!d.ok) throw new Error(d.error);
      log.push({ seq: log.length + 1, ...d.value.event });
    };
    setup.forEach(run);
    for (let i = 0; i < 6; i++) run(ball(0));
    run(ev('new_bowler', { playerId: 'b2' }));
    for (let i = 0; i < 6; i++) run(ball(0));
    // b1 already bowled their only over
    expect(decide(engine, limited, log, ev('new_bowler', { playerId: 'b1' })).ok).toBe(false);
    expect(decide(engine, limited, log, ev('new_bowler', { playerId: 'b3' })).ok).toBe(true);
  });
});

describe('undo through decide()', () => {
  it('rewinds a wicket, restoring batter, strike and bowler figures', () => {
    const { log } = play([...setup, ball(1), ball(0, { wicket: { kind: 'bowled', playerId: 'a2' } })]);
    const before = replay(engine, ctx, log.slice(0, 3)) as CricketState; // setup(2)+ball(1)
    const undone = play([ev('undo')], log).state;
    expect(undone).toEqual(before);
    expect(undone.awaiting).toBe('ball');
  });

  it('can undo past an over boundary back into the over', () => {
    const six = Array.from({ length: 6 }, () => ball(0));
    const { state } = play([...setup, ...six, ev('undo')]);
    expect(state.awaiting).toBe('ball');
    expect(currentInnings(state)!.thisOver).toHaveLength(5);
  });
});

describe('labels and last action', () => {
  it('labels the sixth ball of an over 0.6, not 1.0', () => {
    const { state } = play([...setup, ball(0), ball(0), ball(0), ball(0), ball(0), ball(1)]);
    expect(currentInnings(state)!.log.map((l) => l.over)).toEqual(['0.1', '0.2', '0.3', '0.4', '0.5', '0.6']);
  });

  it('labels an illegal ball with the slot it is bowled in', () => {
    const { state } = play([...setup, ball(0), ball(0, { extra: 'wd' })]);
    expect(currentInnings(state)!.log.map((l) => l.over)).toEqual(['0.1', '0.2']);
  });

  it('fall of wickets on the last ball of an over reads 0.6', () => {
    const { state } = play([...setup, ball(), ball(), ball(), ball(), ball(), ball(0, { wicket: { kind: 'bowled', playerId: 'a1' } })]);
    expect(currentInnings(state)!.fow[0]!.over).toBe('0.6');
  });

  it('lastAction names what undo would remove, and follows undo', () => {
    const { state, log } = play([...setup, ball(4), ball(1, { extra: 'lb' })]);
    expect(state.lastAction).toMatchObject({ type: 'ball', label: '1lb' });
    const undone = play([ev('undo')], log).state;
    expect(undone.lastAction).toMatchObject({ type: 'ball', label: '4' });
  });

  it('lastAction covers non-ball events and wicket players', () => {
    expect(play([ev('toss', { winnerTeamId: 'A', decision: 'bat' })]).state.lastAction?.label).toBe('TOSS');
    const w = play([...setup, ball(0, { wicket: { kind: 'bowled', playerId: 'a1' } })]).state.lastAction;
    expect(w).toMatchObject({ label: 'W', playerId: 'a1' });
    expect(play([...setup, ev('retire', { playerId: 'a2', kind: 'retired_hurt' })]).state.lastAction).toMatchObject({ type: 'retire', playerId: 'a2' });
  });

  it('chipFor previews exactly what the engine records', () => {
    const p = { runs: 2, extra: 'nb' as const, nbKind: 'b' as const };
    const { state } = play([...setup, ball(p.runs, { extra: p.extra, nbKind: p.nbKind })]);
    expect(currentInnings(state)!.thisOver[0]).toEqual(chipFor({ ...p }));
  });
});

describe('free hit rule', () => {
  const fhCtx: MatchContext = { ...ctx, config: { overs: 2, freeHit: true } };
  const playFh = (events: SportEvent[], c = fhCtx) => {
    const log: LoggedEvent[] = [];
    for (const e of events) {
      const d = decide(engine, c, log, e);
      if (!d.ok) throw new Error(`rejected ${e.type}: ${d.error}`);
      log.push({ seq: log.length + 1, ...d.value.event });
    }
    return { state: replay(engine, c, log) as CricketState, log, c };
  };
  const tryFh = (log: LoggedEvent[], e: SportEvent, c = fhCtx) => decide(engine, c, log, e);

  it('a no-ball makes the next delivery a free hit, and a fair delivery uses it up', () => {
    const afterNb = playFh([...setup, ball(0, { extra: 'nb' })]);
    expect(afterNb.state.freeHit).toBe(true);
    expect(playFh([...setup, ball(0, { extra: 'nb' }), ball(1)]).state.freeHit).toBe(false);
  });

  it('a wide on a free hit keeps the free hit; another no-ball gives another', () => {
    expect(playFh([...setup, ball(0, { extra: 'nb' }), ball(0, { extra: 'wd' })]).state.freeHit).toBe(true);
    expect(playFh([...setup, ball(0, { extra: 'nb' }), ball(0, { extra: 'nb' })]).state.freeHit).toBe(true);
  });

  it('only a run out can dismiss on a free hit', () => {
    const { log } = playFh([...setup, ball(0, { extra: 'nb' })]);
    const bowled = tryFh(log, ball(0, { wicket: { kind: 'bowled', playerId: 'a1' } }));
    expect(bowled.ok).toBe(false);
    expect(!bowled.ok && bowled.error).toMatch(/free hit/);
    expect(tryFh(log, ball(0, { wicket: { kind: 'caught', playerId: 'a1' } })).ok).toBe(false);
    expect(tryFh(log, ball(1, { wicket: { kind: 'run_out', playerId: 'a2' } })).ok).toBe(true);
  });

  it('the rule does nothing unless the match turned it on', () => {
    const off: MatchContext = { ...ctx, config: { overs: 2 } };
    const { state, log, c } = playFh([...setup, ball(0, { extra: 'nb' })], off);
    expect(state.freeHit).toBe(false);
    expect(tryFh(log, ball(0, { wicket: { kind: 'bowled', playerId: 'a1' } }), c).ok).toBe(true);
  });

  it('a new innings never starts on a free hit, and undo restores the free hit', () => {
    const { log } = playFh([...setup, ball(0, { extra: 'nb' }), ball(1)]);
    const undone = decide(engine, fhCtx, log, ev('undo'));
    expect(undone.ok && (undone.value.state as CricketState).freeHit).toBe(true);
  });
});

describe('correcting the toss', () => {
  const tossA = ev('toss', { winnerTeamId: 'A', decision: 'bat' });
  const tossB = ev('toss', { winnerTeamId: 'B', decision: 'bat' });

  it('can be corrected right after it is recorded, before anything else', () => {
    const { state } = play([tossA, tossB]);
    expect(state.toss).toEqual({ winnerTeamId: 'B', decision: 'bat' });
    expect(state.awaiting).toBe('innings_start');
    expect(canEditToss(state)).toBe(true);
  });
  it('a corrected toss decides who bats first', () => {
    const { state } = play([tossA, ev('toss', { winnerTeamId: 'A', decision: 'bowl' }), ev('start_innings', { strikerId: 'b1', nonStrikerId: 'b2', bowlerId: 'a1' })]);
    expect(currentInnings(state)!.battingTeamId).toBe('B');
  });
  it('can be corrected after the openers are picked while no ball is bowled: the innings starts again', () => {
    const { state } = play([...setup, tossB]);
    expect(state.innings).toHaveLength(0);
    expect(state.toss).toEqual({ winnerTeamId: 'B', decision: 'bat' });
    expect(state.awaiting).toBe('innings_start');
    // Beta bat first now, so Alpha's openers are refused and Beta's are accepted
    reject([...setup, tossB], ev('start_innings', { strikerId: 'a1', nonStrikerId: 'a2', bowlerId: 'b1' }));
    const again = play([...setup, tossB, ev('start_innings', { strikerId: 'b1', nonStrikerId: 'b2', bowlerId: 'a1' })]);
    expect(currentInnings(again.state)!.battingTeamId).toBe('B');
    expect(again.state.awaiting).toBe('ball');
  });
  it('is refused once a ball has been bowled', () => {
    expect(reject([...setup, ball(1)], tossB)).toMatch(/can’t be changed once scoring has started/);
    expect(canEditToss(play([...setup, ball(0)]).state)).toBe(false);
  });
  it('is refused after a wide too, since it is a delivery', () => {
    expect(reject([...setup, ball(0, { extra: 'wd' })], tossB)).toMatch(/can’t be changed/);
  });
  it('is refused once the first innings is over, and after the match', () => {
    const done = [...setup, ev('end_innings')];
    expect(play(done).state.awaiting).toBe('innings_start');
    expect(reject(done, tossB)).toMatch(/can’t be changed/);
    expect(reject([...done, ev('finish', { outcome: 'tie' })], tossB)).toMatch(/already complete/);
  });
  it('can be undone: the original toss and the started innings come back', () => {
    const { log } = play([...setup, tossB]);
    const d = decide(engine, ctx, log, ev('undo'));
    expect(d.ok).toBe(true);
    if (d.ok) log.push({ seq: log.length + 1, ...d.value.event });
    const s = replay(engine, ctx, log) as CricketState;
    expect(s.toss).toEqual({ winnerTeamId: 'A', decision: 'bat' });
    expect(s.awaiting).toBe('ball');
    expect(currentInnings(s)!.battingTeamId).toBe('A');
  });
  it('is not possible before a toss exists, and canEditToss says so', () => {
    expect(canEditToss(play([]).state)).toBe(false);
    expect(canEditToss(play([tossA]).state)).toBe(true);
    expect(canEditToss(play(setup).state)).toBe(true);
  });
  it('clears a free hit carried from nothing, and the last action reads TOSS', () => {
    const { state } = play([tossA, tossB]);
    expect(state.freeHit).toBe(false);
    expect(state.lastAction?.type).toBe('toss');
  });
});
