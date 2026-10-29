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
  players: { id: string; name: string; isCaptain?: boolean; isKeeper?: boolean }[];
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

// ---------------------------------------------------------------------------
// Tournaments and matches created through the wizard
// ---------------------------------------------------------------------------

export const FORMAT_KEYS = ['league', 'lk', 'ko', 'groups'] as const;
export type FormatKey = (typeof FORMAT_KEYS)[number];

/** Wizard format -> the coarse enum stored in the `format` column. The exact key lives in `meta.formatKey`. */
export const FORMATS: Record<FormatKey, { label: string; description: string; column: 'round_robin' | 'league_knockout' | 'knockout' }> = {
  league: { label: 'League', description: 'Everyone plays everyone once. Top of the table wins.', column: 'round_robin' },
  lk: { label: 'League + knockouts', description: 'Round robin, then the top teams play semi-finals and a final.', column: 'league_knockout' },
  ko: { label: 'Knockout', description: 'Single elimination. Lose once and you are out.', column: 'knockout' },
  groups: { label: 'Groups + knockouts', description: 'Two groups play round robin, group winners advance.', column: 'league_knockout' },
};

/** Fewest teams a format can run with. */
export const minTeamsFor = (formatKey: FormatKey) => (formatKey === 'league' ? 2 : 4);

export const TIEBREAKS = ['NRR', 'DIFFERENCE', 'HEAD TO HEAD', 'WINS'] as const;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date');
const time = z.string().regex(/^\d{2}:\d{2}$/, 'Use a time');
const uuid = z.string().uuid();

export const tournamentInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Give the tournament a name.').max(80),
    sportId: uuid,
    startDate: date,
    endDate: date,
    venueIds: z.array(uuid).min(1, 'Pick at least one venue.'),
    formatKey: z.enum(FORMAT_KEYS),
    /** Cricket only. */
    overs: z.number().int().min(1).max(50).optional(),
    points: z.object({
      win: z.number().int().min(0).max(5),
      tie: z.number().int().min(0).max(5),
      noResult: z.number().int().min(0).max(5),
    }),
    qualify: z.union([z.literal(2), z.literal(4)]),
    tiebreak: z.enum(TIEBREAKS),
    teamIds: z.array(uuid).min(2),
    schedule: z.object({ perDay: z.number().int().min(1).max(4), firstMatchTime: time, restDay: z.boolean() }),
    /** Browser timezone offset in minutes (Date#getTimezoneOffset), so dates mean the organiser's local day. */
    tzOffset: z.number().int().min(-840).max(840),
  })
  .refine((v) => v.endDate >= v.startDate, { message: 'End date is before the start date.', path: ['endDate'] })
  .refine((v) => v.formatKey === 'league' || v.teamIds.length >= 4, { message: 'Add at least 4 teams for this format.', path: ['teamIds'] });
export type TournamentInput = z.infer<typeof tournamentInputSchema>;

/** What is stored in `tournaments.meta`. */
export interface TournamentMeta {
  version: 1;
  formatKey: FormatKey;
  overs?: number;
  venues: { id: string; name: string }[];
  points: { win: number; tie: number; noResult: number };
  qualify: 2 | 4;
  tiebreak: (typeof TIEBREAKS)[number];
  teams: { id: string; name: string }[];
  schedule: { perDay: number; firstMatchTime: string; restDay: boolean; startDate: string; endDate: string };
  /** Counts the wizard computed. Fixtures themselves are not created yet. */
  plan: { leagueMatches: number; knockoutMatches: number; totalMatches: number; matchDays: number; lastMatchDate: string };
  fixturesGenerated: boolean;
}

export const VISIBILITIES = ['public', 'link', 'private'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

const lineup = z.object({
  playerIds: z.array(uuid),
  captainId: uuid.nullable(),
  keeperId: uuid.nullable(),
});

export const matchInputSchema = z
  .object({
    tournamentId: uuid.nullable(),
    teamAId: uuid,
    teamBId: uuid,
    venueId: uuid.nullable(),
    date,
    time,
    tzOffset: z.number().int().min(-840).max(840),
    rules: z.object({
      overs: z.number().int().min(1).max(50),
      powerplay: z.number().int().min(0).max(50),
      playersPerSide: z.number().int().min(2).max(15),
      freeHit: z.boolean(),
      wideReball: z.boolean(),
      superOver: z.boolean(),
      dls: z.boolean(),
    }),
    lineups: z.object({ a: lineup, b: lineup }),
    scorerId: uuid,
    umpires: z.array(z.string().trim().max(60)).max(2),
    visibility: z.enum(VISIBILITIES),
  })
  .refine((v) => v.teamAId !== v.teamBId, { message: 'Home and away must be different teams.', path: ['teamBId'] })
  .refine((v) => v.rules.powerplay <= v.rules.overs, { message: 'Powerplay cannot be longer than the match.', path: ['rules'] })
  .superRefine((v, ctx) => {
    for (const side of ['a', 'b'] as const) {
      const l = v.lineups[side];
      if (l.playerIds.length !== v.rules.playersPerSide) {
        ctx.addIssue({ code: 'custom', message: `Each side needs exactly ${v.rules.playersPerSide} players.`, path: ['lineups', side] });
      }
      if (new Set(l.playerIds).size !== l.playerIds.length) ctx.addIssue({ code: 'custom', message: 'A player is listed twice.', path: ['lineups', side] });
      if (!l.captainId || !l.playerIds.includes(l.captainId)) ctx.addIssue({ code: 'custom', message: 'Choose a captain from the XI.', path: ['lineups', side, 'captainId'] });
      if (l.keeperId && !l.playerIds.includes(l.keeperId)) ctx.addIssue({ code: 'custom', message: 'The keeper must be in the XI.', path: ['lineups', side, 'keeperId'] });
    }
  });
export type MatchInput = z.infer<typeof matchInputSchema>;

export * from './access';
