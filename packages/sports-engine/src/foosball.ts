import { z } from 'zod';
import { BEST_OF_OPTIONS, FIRST_TO_OPTIONS, FOOSBALL_DEFAULTS, WIN_BY_OPTIONS, type FoosballRules } from '@sports/shared';
import type { MatchContext, SportEngine, SportEvent } from './index';

export { BEST_OF_OPTIONS, FIRST_TO_OPTIONS, FOOSBALL_DEFAULTS, WIN_BY_OPTIONS };

/**
 * Foosball: a match is best of `bestOf` games; a game is first to `firstTo` goals, and the winner must lead by `winBy`
 * (1 = first to the target, 2 = must win by two). The match goes to whoever wins most games. Pure, so it replays from the log.
 */


export type Side = 'a' | 'b';

export interface FoosGame { a: number; b: number; done: boolean; winner: Side | null }

export interface FoosballResult { winnerTeamId: string | null; text: string }

export interface FoosballState {
  kind: 'foosball';
  firstTo: number;
  bestOf: number;
  winBy: number;
  /** teams[0] is side a, teams[1] is side b */
  teams: { id: string; name: string }[];
  games: FoosGame[];
  gamesWon: { a: number; b: number };
  result: FoosballResult | null;
  /** The most recent event still in force, so the UI can say what Undo would remove. */
  lastAction: { type: string; label: string; side?: Side } | null;
}

export type FoosballConfig = FoosballRules;

/** The rules a match uses, read from its config with the defaults filled in. Values that make no sense fall back. */
export function foosballRules(cfg: Record<string, unknown> | null | undefined): FoosballConfig {
  const pick = <T extends number>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(Number(v) as T) ? (Number(v) as T) : fallback);
  const firstTo = Number.isInteger(Number(cfg?.firstTo)) && Number(cfg?.firstTo) >= 1 && Number(cfg?.firstTo) <= 50 ? Number(cfg?.firstTo) : FOOSBALL_DEFAULTS.firstTo;
  return { firstTo, bestOf: pick(cfg?.bestOf, BEST_OF_OPTIONS, FOOSBALL_DEFAULTS.bestOf), winBy: pick(cfg?.winBy, WIN_BY_OPTIONS, FOOSBALL_DEFAULTS.winBy) };
}

export const gamesToWin = (bestOf: number) => Math.floor(bestOf / 2) + 1;
export const currentGame = (s: FoosballState): FoosGame => s.games.at(-1)!;
export const sideOf = (s: FoosballState, teamId: string): Side | null => (s.teams[0]!.id === teamId ? 'a' : s.teams[1]!.id === teamId ? 'b' : null);

/** Goals a side has scored over the whole match, and against. Used for goal difference. */
export const totalGoals = (s: FoosballState) => s.games.reduce((t, g) => ({ a: t.a + g.a, b: t.b + g.b }), { a: 0, b: 0 });

const schemas = {
  goal: z.object({ side: z.enum(['a', 'b']) }),
  /** Closes the match by hand: a forfeit, an agreed result or no result. */
  finish: z.object({ outcome: z.enum(['no_result', 'win']), winnerTeamId: z.string().min(1).optional() }),
} as const;
type EventType = keyof typeof schemas;
const isEventType = (t: string): t is EventType => t in schemas;

function initialState(ctx: MatchContext): FoosballState {
  const r = foosballRules(ctx.config);
  return {
    kind: 'foosball', ...r,
    teams: ctx.teams.slice(0, 2),
    games: [{ a: 0, b: 0, done: false, winner: null }],
    gamesWon: { a: 0, b: 0 },
    result: null,
    lastAction: null,
  };
}

/** A game ends when a side has reached the target and leads by enough. */
export function gameWinner(g: { a: number; b: number }, firstTo: number, winBy: number): Side | null {
  if (g.a >= firstTo && g.a - g.b >= winBy) return 'a';
  if (g.b >= firstTo && g.b - g.a >= winBy) return 'b';
  return null;
}

function validate(s: FoosballState, event: SportEvent) {
  if (!isEventType(event.type)) return { ok: false as const, error: `Unknown foosball event "${event.type}"` };
  const parsed = schemas[event.type].safeParse(event.payload);
  if (!parsed.success) return { ok: false as const, error: `Invalid ${event.type}: ${parsed.error.issues[0]?.message ?? 'bad payload'}` };
  if (s.result) return { ok: false as const, error: 'Match already finished' };
  if (event.type === 'finish') {
    const p = parsed.data as z.infer<typeof schemas.finish>;
    if (p.outcome === 'win' && !s.teams.some((t) => t.id === p.winnerTeamId)) return { ok: false as const, error: 'Pick the winning team' };
  }
  return { ok: true as const, value: undefined };
}

function apply(prev: FoosballState, event: SportEvent): FoosballState {
  const s = structuredClone(prev);
  const name = (id?: string) => s.teams.find((t) => t.id === id)?.name ?? '';
  switch (event.type as EventType) {
    case 'goal': {
      const { side } = schemas.goal.parse(event.payload);
      const g = currentGame(s);
      g[side] += 1;
      s.lastAction = { type: 'goal', label: `GOAL ${name(s.teams[side === 'a' ? 0 : 1]!.id).toUpperCase()}`, side };
      const w = gameWinner(g, s.firstTo, s.winBy);
      if (w) {
        g.done = true; g.winner = w;
        s.gamesWon[w] += 1;
        if (s.gamesWon[w] >= gamesToWin(s.bestOf)) {
          const winner = s.teams[w === 'a' ? 0 : 1]!;
          const score = s.gamesWon.a + s.gamesWon.b > 1 ? `${s.gamesWon[w]}–${s.gamesWon[w === 'a' ? 'b' : 'a']}` : '';
          s.result = { winnerTeamId: winner.id, text: `${winner.name} won${score ? ` ${score}` : ` ${g[w]}–${g[w === 'a' ? 'b' : 'a']}`}` };
        } else {
          s.games.push({ a: 0, b: 0, done: false, winner: null });
        }
      }
      break;
    }
    case 'finish': {
      const p = schemas.finish.parse(event.payload);
      s.result = p.outcome === 'win' ? { winnerTeamId: p.winnerTeamId!, text: `${name(p.winnerTeamId)} won` } : { winnerTeamId: null, text: 'No result' };
      s.lastAction = { type: 'finish', label: 'RESULT' };
      break;
    }
  }
  return s;
}

/** Read-only helpers for the UI. */
export function gameLine(s: FoosballState): string {
  return s.games.filter((g) => g.done || g.a + g.b > 0).map((g) => `${g.a}–${g.b}`).join(', ');
}

function summary(s: FoosballState) {
  const multi = s.bestOf > 1;
  const g = currentGame(s);
  const live = !s.result;
  const sides = s.teams.map((t, i) => {
    const k: Side = i === 0 ? 'a' : 'b';
    // in a best-of match the headline number is games won; a single game shows its goals
    return { name: t.name, score: multi ? `${s.gamesWon[k]}${live ? ` (${g[k]})` : ''}` : String(g[k]) };
  });
  let status: string;
  if (s.result) status = `${s.result.text}${multi ? ` · ${gameLine(s)}` : ''}`;
  else if (g.a + g.b === 0 && s.games.length === 1) status = `Best of ${s.bestOf} · first to ${s.firstTo}${s.winBy > 1 ? ', win by 2' : ''}`;
  else status = `Game ${s.games.length}${multi ? ` of ${s.bestOf}` : ''} · ${g.a}–${g.b}${multi && (s.gamesWon.a || s.gamesWon.b) ? ` · games ${s.gamesWon.a}–${s.gamesWon.b}` : ''}`;
  return { sides, status };
}

export const foosballEngine: SportEngine<FoosballState> = {
  key: 'foosball',
  initialState,
  validate,
  apply,
  summary,
  outcome: (s) => ({ complete: !!s.result, result: s.result ? { ...s.result } : undefined }),
};
