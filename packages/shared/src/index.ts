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

/**
 * What a tournament is made of. New tournaments are one of two types: `lk` is the Table type (round robin, then the top 2
 * or top 4 play on) and `custom` is a fixture list you build or paste in. `league`, `ko` and `groups` are kept for
 * tournaments made before there were two types.
 */
export const FORMAT_KEYS = ['league', 'lk', 'ko', 'groups', 'custom'] as const;
/** The types the create wizard and the editor offer. */
export const FIXTURE_TYPES = ['lk', 'custom'] as const;
export type FormatKey = (typeof FORMAT_KEYS)[number];

/** Wizard format -> the coarse enum stored in the `format` column. The exact key lives in `meta.formatKey`. */
export const FORMATS: Record<FormatKey, { label: string; description: string; column: 'round_robin' | 'league_knockout' | 'knockout' }> = {
  league: { label: 'League', description: 'Everyone plays everyone once. Top of the table wins.', column: 'round_robin' },
  lk: { label: 'Table', description: 'Round robin: everyone plays everyone once and the fixtures are made for you. The top 4 then play semi-finals and a final, or the top 2 play the final.', column: 'league_knockout' },
  ko: { label: 'Knockout', description: 'Single elimination. Lose once and you are out.', column: 'knockout' },
  groups: { label: 'Groups + knockouts', description: 'Two groups play round robin, group winners advance.', column: 'league_knockout' },
  custom: { label: 'Custom', description: 'You decide the fixtures: build them or paste them in from another tool. Any mix of league matches and knockout rounds, with byes.', column: 'knockout' },
};

/**
 * How many matches each team can play in a Table: from 1 up to everyone else (teams - 1). Every match has two teams, so
 * teams x matches must be even; with an odd number of teams only even values work.
 */
export const matchesPerTeamOptions = (teams: number): number[] => Array.from({ length: Math.max(0, teams - 1) }, (_, i) => i + 1).filter((k) => (teams * k) % 2 === 0);

/**
 * The value to use for a team count: undefined means everyone plays everyone. A wanted value that is too big or does not fit
 * the team count drops to the nearest value that does.
 */
export function fitMatchesPerTeam(teams: number, wanted?: number | null): number | undefined {
  if (wanted == null || teams < 2 || wanted >= teams - 1) return undefined;
  const opts = matchesPerTeamOptions(teams);
  const k = [...opts].reverse().find((o) => o <= wanted) ?? opts[0];
  return k === undefined || k >= teams - 1 ? undefined : k;
}

/** Fewest teams a format can run with. A Table that sends 2 teams on needs 3 (so the final is not the whole tournament). */
export const minTeamsFor = (formatKey: FormatKey, qualify?: 2 | 4) => (formatKey === 'league' || formatKey === 'custom' ? 2 : formatKey === 'lk' && qualify === 2 ? 3 : 4);

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
    /** Optional: a tournament can be made without a venue and matches can name one later. */
    venueIds: z.array(uuid).max(50).default([]),
    formatKey: z.enum(FORMAT_KEYS),
    /** Cricket only. */
    overs: z.number().int().min(1).max(50).optional(),
    points: z.object({
      win: z.number().int().min(0).max(5),
      tie: z.number().int().min(0).max(5),
      noResult: z.number().int().min(0).max(5),
    }),
    qualify: z.union([z.literal(2), z.literal(4)]),
    /** Table only: matches each team plays. Left out means everyone plays everyone. */
    matchesPerTeam: z.number().int().min(1).max(60).optional(),
    tiebreak: z.enum(TIEBREAKS),
    teamIds: z.array(uuid).min(2),
    schedule: z.object({ perDay: z.number().int().min(1).max(4), firstMatchTime: time, restDay: z.boolean() }),
    /** Browser timezone offset in minutes (Date#getTimezoneOffset), so dates mean the organiser's local day. */
    tzOffset: z.number().int().min(-840).max(840),
  })
  .refine((v) => v.endDate >= v.startDate, { message: 'End date is before the start date.', path: ['endDate'] })
  .refine((v) => v.teamIds.length >= minTeamsFor(v.formatKey, v.qualify), { message: 'Add more teams for this format.', path: ['teamIds'] })
  .refine((v) => v.formatKey !== 'lk' || v.matchesPerTeam === undefined || matchesPerTeamOptions(v.teamIds.length).includes(v.matchesPerTeam), { message: 'That number of matches per team does not fit this many teams.', path: ['matchesPerTeam'] });
export type TournamentInput = z.infer<typeof tournamentInputSchema>;

/** Editing a saved tournament: the same settings the wizard collected, except the sport and the teams (the Teams tab handles those). */
export const tournamentEditSchema = z
  .object({
    tournamentId: uuid,
    name: z.string().trim().min(1, 'Give the tournament a name.').max(80),
    startDate: date,
    endDate: date,
    venueIds: z.array(uuid).max(50).default([]),
    formatKey: z.enum(FORMAT_KEYS),
    overs: z.number().int().min(1).max(50).optional(),
    points: z.object({
      win: z.number().int().min(0).max(5),
      tie: z.number().int().min(0).max(5),
      noResult: z.number().int().min(0).max(5),
    }),
    qualify: z.union([z.literal(2), z.literal(4)]),
    matchesPerTeam: z.number().int().min(1).max(60).optional(),
    tiebreak: z.enum(TIEBREAKS),
    schedule: z.object({ perDay: z.number().int().min(1).max(4), firstMatchTime: time, restDay: z.boolean() }),
    tzOffset: z.number().int().min(-840).max(840),
  })
  .refine((v) => v.endDate >= v.startDate, { message: 'End date is before the start date.', path: ['endDate'] });
export type TournamentEdit = z.infer<typeof tournamentEditSchema>;

/** What is stored in `tournaments.meta`. */
/** One side of an imported fixture: a team, or the winner/loser of an earlier fixture. */
export type FixtureSlot =
  | { kind: 'team'; id: string; name: string }
  | { kind: 'winner' | 'loser'; match: number }
  /** Whoever is in this place of the league table when the league matches are done (1 = top). */
  | { kind: 'rank'; pos: number };

/** A fixture from the JSON import. It becomes a real match (`matchId`) once both teams are known and the sport can be scored. */
export interface BracketFixture {
  no: number;
  round: string | null;
  date: string;
  time: string;
  /** The browser's getTimezoneOffset() when it was imported, to turn date and time into an instant later. */
  tz: number;
  venue: string | null;
  a: FixtureSlot;
  b: FixtureSlot;
  matchId: string | null;
}

export interface TournamentMeta {
  version: 1;
  formatKey: FormatKey;
  overs?: number;
  venues: { id: string; name: string }[];
  points: { win: number; tie: number; noResult: number };
  qualify: 2 | 4;
  /** Table only: matches each team plays. Missing means everyone plays everyone. */
  matchesPerTeam?: number;
  tiebreak: (typeof TIEBREAKS)[number];
  teams: { id: string; name: string }[];
  schedule: { perDay: number; firstMatchTime: string; restDay: boolean; startDate: string; endDate: string };
  /** Counts the wizard computed. Fixtures themselves are not created yet. */
  plan: { leagueMatches: number; knockoutMatches: number; totalMatches: number; matchDays: number; lastMatchDate: string };
  fixturesGenerated: boolean;
  /** The organiser's browser timezone offset (getTimezoneOffset) when the tournament was last saved, for fixtures made later. */
  tz?: number;
  /** Imported fixtures, including knockout rounds whose teams are not known yet. */
  bracket?: BracketFixture[];
  /** Teams that skip the first round of the imported bracket. */
  byes?: { id: string; name: string }[];
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
