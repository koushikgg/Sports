import { describe, expect, it } from 'vitest';
import { decide, replay, activeEvents, type LoggedEvent, type MatchContext, type SportEngine } from './index';

type S = { a: number; b: number };

const ctx: MatchContext = { matchId: 'm', teams: [{ id: '1', name: 'A' }, { id: '2', name: 'B' }], config: { firstTo: 3 } };

const engine: SportEngine<S> = {
  key: 'foosball',
  initialState: () => ({ a: 0, b: 0 }),
  validate: (_s, e) =>
    e.type === 'goal' && (e.payload.side === 'a' || e.payload.side === 'b')
      ? { ok: true, value: undefined }
      : { ok: false, error: 'bad event' },
  apply: (s, e) => (e.payload.side === 'a' ? { ...s, a: s.a + 1 } : { ...s, b: s.b + 1 }),
  summary: (s) => ({ sides: [{ name: 'A', score: String(s.a) }, { name: 'B', score: String(s.b) }], status: '' }),
  outcome: (s) => ({ complete: s.a >= 3 || s.b >= 3 }),
};

const goal = (seq: number, side: 'a' | 'b'): LoggedEvent => ({ seq, type: 'goal', payload: { side } });

describe('replay / undo', () => {
  it('replays events in order', () => {
    expect(replay(engine, ctx, [goal(1, 'a'), goal(2, 'b'), goal(3, 'a')])).toEqual({ a: 2, b: 1 });
  });

  it('skips events cancelled by undo markers', () => {
    const history: LoggedEvent[] = [goal(1, 'a'), goal(2, 'b'), { seq: 3, type: 'undo', payload: { targetSeq: 2 } }];
    expect(activeEvents(history).map((e) => e.seq)).toEqual([1]);
    expect(replay(engine, ctx, history)).toEqual({ a: 1, b: 0 });
  });
});

describe('decide', () => {
  it('applies a valid event', () => {
    const d = decide(engine, ctx, [goal(1, 'a')], { type: 'goal', payload: { side: 'b' } });
    expect(d.ok && d.value.state).toEqual({ a: 1, b: 1 });
  });

  it('rejects an invalid event', () => {
    expect(decide(engine, ctx, [], { type: 'nope', payload: {} }).ok).toBe(false);
  });

  it('undo targets the latest active event and can be repeated', () => {
    const history: LoggedEvent[] = [goal(1, 'a'), goal(2, 'b')];
    const first = decide(engine, ctx, history, { type: 'undo', payload: {} });
    expect(first.ok && first.value.event.payload).toEqual({ targetSeq: 2 });
    expect(first.ok && first.value.state).toEqual({ a: 1, b: 0 });

    const withUndo: LoggedEvent[] = [...history, { seq: 3, type: 'undo', payload: { targetSeq: 2 } }];
    const second = decide(engine, ctx, withUndo, { type: 'undo', payload: {} });
    expect(second.ok && second.value.event.payload).toEqual({ targetSeq: 1 });
    expect(second.ok && second.value.state).toEqual({ a: 0, b: 0 });
  });

  it('refuses to undo an empty log', () => {
    expect(decide(engine, ctx, [], { type: 'undo', payload: {} }).ok).toBe(false);
  });

  it('refuses events once the engine says the match is complete, but allows undo', () => {
    const history = [goal(1, 'a'), goal(2, 'a'), goal(3, 'a')];
    expect(decide(engine, ctx, history, { type: 'goal', payload: { side: 'b' } }).ok).toBe(false);
    expect(decide(engine, ctx, history, { type: 'undo', payload: {} }).ok).toBe(true);
  });
});
