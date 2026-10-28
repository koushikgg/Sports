import type { Result, ScoreSummary, SportKey } from '@sports/shared';

export type { Result } from '@sports/shared';

export interface MatchContext {
  matchId: string;
  teams: { id: string; name: string }[];
  /** Squad per team id (the team roster). */
  players?: Record<string, { id: string; name: string; isCaptain?: boolean; isKeeper?: boolean }[]>;
  config: Record<string, unknown>;
}

export interface SportEvent {
  type: string;
  payload: Record<string, unknown>;
}

export interface LoggedEvent extends SportEvent {
  seq: number;
}

/**
 * A sport is a plugin: pure functions turning an append-only event log into state.
 * Keep implementations free of I/O so they can be unit-tested and replayed.
 * Undo is NOT the engine's concern — see `decide`.
 */
export interface SportEngine<State = unknown> {
  key: SportKey;
  initialState(ctx: MatchContext): State;
  validate(state: State, event: SportEvent): Result;
  apply(state: State, event: SportEvent): State;
  summary(state: State, ctx: MatchContext): ScoreSummary;
  /** Lets the server auto-complete a match and store a result. */
  outcome?(state: State): { complete: boolean; result?: Record<string, unknown> };
}

const registry = new Map<SportKey, SportEngine<any>>();

export function registerEngine(engine: SportEngine<any>) {
  registry.set(engine.key, engine);
}

export function getEngine(key: SportKey): SportEngine<any> {
  const engine = registry.get(key);
  if (!engine) throw new Error(`No engine registered for sport "${key}"`);
  return engine;
}

export const UNDO = 'undo';

/** Drop `undo` markers and the events they cancel. */
export function activeEvents(history: LoggedEvent[]): LoggedEvent[] {
  const undone = new Set<number>();
  for (const e of history) if (e.type === UNDO) undone.add(Number(e.payload.targetSeq));
  return history.filter((e) => e.type !== UNDO && !undone.has(e.seq));
}

export function replay<S>(engine: SportEngine<S>, ctx: MatchContext, history: LoggedEvent[]): S {
  return activeEvents(history).reduce((s, e) => engine.apply(s, e), engine.initialState(ctx));
}

export type Decision<S> = Result<{ state: S; event: SportEvent }>;

/**
 * Decide a normal (non-undo) event on top of an already-computed state. This is the fast path:
 * callers that hold the cached state skip replaying the whole log.
 */
export function decideOnState<S>(engine: SportEngine<S>, state: S, input: SportEvent): Decision<S> {
  if (engine.outcome?.(state).complete) return { ok: false, error: 'Match is already complete' };
  const check = engine.validate(state, input);
  if (!check.ok) return check;
  return { ok: true, value: { state: engine.apply(state, input), event: input } };
}

/**
 * Decide what happens when `input` arrives on top of `history`.
 * `undo` cancels the most recent active event; anything else is validated by the engine.
 */
export function decide<S>(
  engine: SportEngine<S>,
  ctx: MatchContext,
  history: LoggedEvent[],
  input: SportEvent,
): Decision<S> {
  const active = activeEvents(history);

  if (input.type === UNDO) {
    const target = active.at(-1);
    if (!target) return { ok: false, error: 'Nothing to undo' };
    const state = active
      .filter((e) => e.seq !== target.seq)
      .reduce((s, e) => engine.apply(s, e), engine.initialState(ctx));
    return { ok: true, value: { state, event: { type: UNDO, payload: { targetSeq: target.seq } } } };
  }

  const current = active.reduce((s, e) => engine.apply(s, e), engine.initialState(ctx));
  return decideOnState(engine, current, input);
}
