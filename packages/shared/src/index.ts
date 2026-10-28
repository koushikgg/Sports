import { z } from 'zod';

export const ROLES = ['admin', 'scorer'] as const;
export type Role = (typeof ROLES)[number];

export const MATCH_STATUSES = ['scheduled', 'live', 'paused', 'completed', 'abandoned'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const SPORT_KEYS = ['cricket', 'foosball'] as const;
export type SportKey = (typeof SPORT_KEYS)[number];

/** Socket room names — single source of truth for web + realtime. */
export const rooms = {
  match: (id: string) => `match:${id}`,
  sport: (key: string) => `sport:${key}`,
  live: 'global:live',
} as const;

/** Client -> server socket events. */
export const ClientEvents = {
  joinMatch: 'match:join',
  leaveMatch: 'match:leave',
  joinSport: 'sport:join',
  joinLive: 'live:join',
  scoreEvent: 'score:event',
  releaseMatch: 'match:release',
} as const;

/** Server -> client socket events. */
export const ServerEvents = {
  matchUpdate: 'match:update',
  matchSnapshot: 'match:snapshot',
  liveChanged: 'live:changed',
  error: 'error:message',
} as const;

export const joinMatchSchema = z.object({ matchId: z.string().uuid() });

export const scoreEventSchema = z.object({
  matchId: z.string().uuid(),
  /** Sport-specific event; validated by the sport engine. */
  type: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
  /** Client's last known seq, used for optimistic concurrency. */
  expectedSeq: z.number().int().nonnegative(),
});
export type ScoreEventInput = z.infer<typeof scoreEventSchema>;

export interface ScoreSummary {
  /** One entry per side, e.g. { name: 'Team A', score: '32/0 (2.4)' }. */
  sides: { name: string; score: string }[];
  /** e.g. "Needs 12 off 8" or "Team A leads". */
  status: string;
}

export interface RosterTeam {
  id: string;
  name: string;
  players: { id: string; name: string }[];
}

export interface MatchSnapshot<S = unknown> {
  matchId: string;
  sportKey: SportKey;
  /** Both sides with their squads, so clients can resolve player ids to names. */
  roster: RosterTeam[];
  seq: number;
  status: MatchStatus;
  state: S;
  summary: ScoreSummary;
}

export interface MatchUpdate<S = unknown> extends MatchSnapshot<S> {
  event: { type: string; payload: Record<string, unknown> };
}

/** Ack payloads for socket requests. */
export type Ack<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; code: 'forbidden' | 'locked' | 'conflict' | 'invalid' | 'closed' | 'not_found' | 'error'; message: string; snapshot?: MatchSnapshot };

export interface SocketTokenClaims {
  sub: string;
  role: Role;
}

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };
