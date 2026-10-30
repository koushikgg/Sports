import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['admin', 'scorer']);
export const matchStatusEnum = pgEnum('match_status', [
  'scheduled',
  'live',
  'paused',
  'completed',
  'abandoned',
]);
export const tournamentFormatEnum = pgEnum('tournament_format', [
  'round_robin',
  'knockout',
  'league_knockout',
  'friendly',
]);

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('scorer'),
  /** Profile photo as a small data URL (the profile page crops it to 256px). */
  avatarUrl: text('avatar_url'),
  avatarUpdatedAt: timestamp('avatar_updated_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const sports = pgTable('sports', {
  id: id(),
  key: text('key').notNull().unique(), // 'cricket' | 'foosball'
  name: text('name').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
});

export const venues = pgTable('venues', {
  id: id(),
  name: text('name').notNull().unique(),
  createdAt: createdAt(),
});

export const teams = pgTable('teams', {
  id: id(),
  sportId: uuid('sport_id').notNull().references(() => sports.id),
  name: text('name').notNull(),
  shortName: text('short_name'),
  /** Team logo as a small data URL (cropped to a square in the browser). */
  logoUrl: text('logo_url'),
  logoUpdatedAt: timestamp('logo_updated_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const players = pgTable('players', {
  id: id(),
  name: text('name').notNull(),
  email: text('email'),
  employeeId: text('employee_id'),
  avatarUrl: text('avatar_url'),
  /** The account this player signs in with, when they are also a user. */
  userId: uuid('user_id').unique().references(() => users.id, { onDelete: 'set null' }),
  /** Playing role shown in squad pickers: BAT, BOWL, AR or WK. */
  role: text('role'),
  createdAt: createdAt(),
});

export const teamMembers = pgTable(
  'team_members',
  {
    teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
    isCaptain: boolean('is_captain').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.playerId] })],
);

/** Users who may manage a team's people. The captain is the roster's captain player, linked through players.user_id. */
export const teamManagers = pgTable(
  'team_managers',
  {
    teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] })],
);

export const tournaments = pgTable('tournaments', {
  id: id(),
  sportId: uuid('sport_id').notNull().references(() => sports.id),
  name: text('name').notNull(),
  /** public: everyone sees it. private: only admins and the tournament's managers see it and its matches. */
  visibility: text('visibility').notNull().default('public'),
  format: tournamentFormatEnum('format').notNull().default('friendly'),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  /** Everything the create wizard collected (format, rules, points, teams, schedule...). See TournamentMeta. */
  meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
});

/** Users an admin made managers of a tournament: they score its matches and edit match data. Everyone else is a viewer. */
export const tournamentManagers = pgTable(
  'tournament_managers',
  {
    tournamentId: uuid('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.tournamentId, t.userId] })],
);

export const matches = pgTable('matches', {
  id: id(),
  sportId: uuid('sport_id').notNull().references(() => sports.id),
  tournamentId: uuid('tournament_id').references(() => tournaments.id),
  teamAId: uuid('team_a_id').notNull().references(() => teams.id),
  teamBId: uuid('team_b_id').notNull().references(() => teams.id),
  status: matchStatusEnum('status').notNull().default('scheduled'),
  venue: text('venue'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  /** Sport-specific setup, e.g. { overs: 5 } or { firstTo: 10 }. */
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  result: jsonb('result').$type<Record<string, unknown> | null>(),
  /** Highest event seq written; bumped inside the scoring transaction. */
  lastSeq: integer('last_seq').notNull().default(0),
  /** Scorer who holds the scoring lock right now (set on the first event). */
  scorerId: uuid('scorer_id').references(() => users.id),
  /** Scorer assigned by the organiser. If set, only this scorer (or an admin) may score. */
  assignedScorerId: uuid('assigned_scorer_id').references(() => users.id),
  /** public: listed for everyone. link: not listed, reachable by URL. private: signed-in members only. */
  visibility: text('visibility').notNull().default('public'),
  /** Umpires and anything else the match wizard collected. */
  meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
},
(t) => [
  // an imported fixture number becomes at most one match, even if two page views advance the bracket at once
  uniqueIndex('matches_fixture_no_idx').on(t.tournamentId, sql`(${t.meta}->>'fixtureNo')`).where(sql`${t.meta}->>'fixtureNo' is not null`),
]);

/** Who plays for which side in a given match (lineup, keeper, captain). */
export const matchLineups = pgTable(
  'match_lineups',
  {
    matchId: uuid('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id').notNull().references(() => teams.id),
    playerId: uuid('player_id').notNull().references(() => players.id),
    position: integer('position'),
    isCaptain: boolean('is_captain').notNull().default(false),
    isKeeper: boolean('is_keeper').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.playerId] })],
);

/** Append-only scoring log. State is always derivable by replaying this. */
export const matchEvents = pgTable(
  'match_events',
  {
    id: id(),
    matchId: uuid('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('match_events_match_seq_idx').on(t.matchId, t.seq)],
);

/** Cached reduction of matchEvents at `seq`, for fast reads. */
export const matchStates = pgTable('match_states', {
  matchId: uuid('match_id').primaryKey().references(() => matches.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull().default(0),
  state: jsonb('state').$type<unknown>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable('audit_logs', {
  id: id(),
  userId: uuid('user_id').references(() => users.id),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  meta: jsonb('meta').$type<Record<string, unknown>>(),
  createdAt: createdAt(),
});

export const matchesRelations = relations(matches, ({ one, many }) => ({
  sport: one(sports, { fields: [matches.sportId], references: [sports.id] }),
  teamA: one(teams, { fields: [matches.teamAId], references: [teams.id], relationName: 'teamA' }),
  teamB: one(teams, { fields: [matches.teamBId], references: [teams.id], relationName: 'teamB' }),
  events: many(matchEvents),
}));
