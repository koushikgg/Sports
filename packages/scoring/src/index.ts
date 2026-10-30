import {
  alias,
  and,
  asc,
  count,
  desc,
  eq,
  getDb,
  inArray,
  matchEvents,
  matchLineups,
  matches,
  matchStates,
  players,
  sql,
  sports,
  teamMembers,
  teams,
  tournamentManagers,
  tournaments,
  users,
  type Reader,
} from '@sports/db';
import { FORMATS, type Ack, type BracketFixture, type FixtureSlot, type FormatKey, type MatchSnapshot, type MatchUpdate, type Role, type ScoreEventInput, type ScoreSummary, type SportKey, type TournamentMeta } from '@sports/shared';
import { formatOvers, type CricketState } from '@sports/sports-engine/src/cricket';
import { matchTeamStats } from '@sports/sports-engine/src/cricket-view';
import { fitMatchesPerTeam } from '@sports/shared';
import { gapMinutesFor, generateTableFixtures } from '@sports/sports-engine/src/table-fixtures';
import { isMatchRef, slotKey, slotLabel } from '@sports/sports-engine/src/fixture-import';
import { computeCricketBoards, type Board, type BoardRow, type LeaderMatch } from '@sports/sports-engine/src/leaders';
import { foosballRules, totalGoals, type FoosballState } from '@sports/sports-engine/src/foosball';
import { computeStandings, type FinishedMatch, type Standing } from '@sports/sports-engine/src/standings';
import { projectKnockout, projectLeagueKnockout, toInstant, type BracketRound } from '@sports/sports-engine/src/tournament-plan';
import {
  decide,
  decideOnState,
  getEngine,
  replay,
  type LoggedEvent,
  type MatchContext,
  type SportEngine,
} from '@sports/sports-engine';

type MatchRow = typeof matches.$inferSelect;

const CLOSED = ['completed', 'abandoned'];

type Loaded = { engine: SportEngine; ctx: MatchContext; sportKey: SportKey };

async function loadContext(db: Reader, match: MatchRow): Promise<Loaded> {
  // Independent reads: run them together so it costs one round trip.
  const [sportRows, teamRows, memberRows, lineupRows] = await Promise.all([
    db.select().from(sports).where(eq(sports.id, match.sportId)).limit(1),
    db.select().from(teams).where(inArray(teams.id, [match.teamAId, match.teamBId])),
    db
      .select({ teamId: teamMembers.teamId, id: players.id, name: players.name })
      .from(teamMembers)
      .innerJoin(players, eq(players.id, teamMembers.playerId))
      .where(inArray(teamMembers.teamId, [match.teamAId, match.teamBId]))
      .orderBy(asc(players.name)),
    db
      .select({ teamId: matchLineups.teamId, id: players.id, name: players.name, position: matchLineups.position, isCaptain: matchLineups.isCaptain, isKeeper: matchLineups.isKeeper })
      .from(matchLineups)
      .innerJoin(players, eq(players.id, matchLineups.playerId))
      .where(eq(matchLineups.matchId, match.id))
      .orderBy(asc(matchLineups.position), asc(players.name)),
  ]);
  const sport = sportRows[0];
  if (!sport) throw new Error('Sport missing');
  const byId = new Map(teamRows.map((t) => [t.id, t.name]));
  const squads: Record<string, { id: string; name: string; isCaptain?: boolean; isKeeper?: boolean }[]> = {
    [match.teamAId]: [],
    [match.teamBId]: [],
  };
  // If the organiser picked a playing XI for a side, that is the squad; otherwise the whole roster.
  const hasXi = new Set(lineupRows.map((l) => l.teamId));
  for (const m of memberRows) if (!hasXi.has(m.teamId)) squads[m.teamId]?.push({ id: m.id, name: m.name });
  for (const l of lineupRows) squads[l.teamId]?.push({ id: l.id, name: l.name, isCaptain: l.isCaptain, isKeeper: l.isKeeper });

  const ctx: MatchContext = {
    matchId: match.id,
    teams: [match.teamAId, match.teamBId].map((id) => ({ id, name: byId.get(id) ?? '?' })),
    players: squads,
    config: match.config,
  };
  const key = sport.key as SportKey;
  return { engine: getEngine(key), ctx, sportKey: key };
}

/**
 * Teams and squads barely change during a match, but every ball needs them. Cache briefly so
 * scoring does not pay three queries per ball. A roster edit shows up within the TTL.
 */
const CONTEXT_TTL_MS = 15_000;
const contextCache = new Map<string, { at: number; value: Loaded }>();

async function getContext(db: Reader, match: MatchRow): Promise<Loaded> {
  const hit = contextCache.get(match.id);
  // before the first event the organiser may still be changing the rules (overs), so do not trust the cache
  if (hit && match.lastSeq > 0 && Date.now() - hit.at < CONTEXT_TTL_MS) return hit.value;
  const value = await loadContext(db, match);
  contextCache.set(match.id, { at: Date.now(), value });
  if (contextCache.size > 200) contextCache.delete(contextCache.keys().next().value!);
  return value;
}

async function loadHistory(db: Reader, matchId: string): Promise<LoggedEvent[]> {
  return db
    .select({ seq: matchEvents.seq, type: matchEvents.type, payload: matchEvents.payload })
    .from(matchEvents)
    .where(eq(matchEvents.matchId, matchId))
    .orderBy(asc(matchEvents.seq));
}

function snapshotOf(match: MatchRow, engine: SportEngine, ctx: MatchContext, state: unknown, seq = match.lastSeq): MatchSnapshot {
  return {
    matchId: match.id,
    sportKey: engine.key,
    roster: ctx.teams.map((t) => ({ ...t, players: ctx.players?.[t.id] ?? [] })),
    seq,
    status: match.status,
    state,
    summary: engine.summary(state, ctx),
  };
}

/** Match row plus its cached state in a single round trip. */
async function loadMatchWithState(db: Reader, matchId: string) {
  const [row] = await db
    .select({ match: matches, state: matchStates.state, stateSeq: matchStates.seq })
    .from(matches)
    .leftJoin(matchStates, eq(matchStates.matchId, matches.id))
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!row) return null;
  // The cached state is only trustworthy when it matches the match's last event.
  const fresh = row.state != null && row.stateSeq === row.match.lastSeq;
  return { match: row.match, cachedState: fresh ? row.state : undefined };
}

/** Current state of a match. Uses the cached state row, falling back to a replay. */
export async function getSnapshot(matchId: string): Promise<MatchSnapshot | null> {
  const db = getDb();
  const row = await loadMatchWithState(db, matchId);
  if (!row) return null;
  const { engine, ctx } = await getContext(db, row.match);
  const state =
    row.cachedState !== undefined
      ? row.cachedState
      : row.match.lastSeq === 0
        ? engine.initialState(ctx)
        : replay(engine, ctx, await loadHistory(db, matchId));
  return snapshotOf(row.match, engine, ctx, state);
}

export interface Actor {
  sub: string;
  role: Role;
}

export type SubmitResult = { ok: true; update: MatchUpdate; statusChanged: boolean } | Extract<Ack, { ok: false }>;

/**
 * The single write path for scoring: one read, one atomic write.
 *
 * The write is a single SQL statement that bumps `last_seq` only if it still equals what we
 * read (`expectedSeq`), and appends the event and saves the state in the same statement. Two
 * scorers racing on the same ball cannot both win: the loser updates zero rows and gets a
 * conflict. No interactive transaction is needed, so each ball costs two round trips.
 */
/** Managers change rarely and a ball is scored every few seconds, so the answer is remembered for a short while. */
const managerCache = new Map<string, { at: number; yes: boolean }>();
async function isTournamentManager(db: Reader, tournamentId: string, userId: string): Promise<boolean> {
  const key = `${tournamentId}:${userId}`;
  const hit = managerCache.get(key);
  if (hit && Date.now() - hit.at < 15_000) return hit.yes;
  const [row] = await db.select({ u: tournamentManagers.userId }).from(tournamentManagers).where(and(eq(tournamentManagers.tournamentId, tournamentId), eq(tournamentManagers.userId, userId))).limit(1);
  managerCache.set(key, { at: Date.now(), yes: !!row });
  return !!row;
}

export async function submitScoreEvent(actor: Actor, input: ScoreEventInput): Promise<SubmitResult> {
  if (actor.role !== 'admin' && actor.role !== 'scorer') {
    return { ok: false, code: 'forbidden', message: 'Not allowed to score' };
  }

  const db = getDb();
  const row = await loadMatchWithState(db, input.matchId);
  if (!row) return { ok: false, code: 'not_found', message: 'Match not found' };
  const { match } = row;

  if (CLOSED.includes(match.status) && input.type !== 'undo') {
    return { ok: false, code: 'closed', message: `Match is ${match.status}` };
  }
  // Admins and the tournament's managers run its matches; in a tournament everyone else scores only a match assigned to them.
  const privileged = actor.role === 'admin' || (!!match.tournamentId && (await isTournamentManager(db, match.tournamentId, actor.sub)));
  if (match.tournamentId && !privileged && match.assignedScorerId !== actor.sub) {
    return { ok: false, code: 'forbidden', message: 'Only this tournament’s managers can score its matches' };
  }
  if (match.scorerId && match.scorerId !== actor.sub && !privileged) {
    return { ok: false, code: 'locked', message: 'Another scorer is scoring this match' };
  }

  if (match.assignedScorerId && match.assignedScorerId !== actor.sub && !privileged) {
    return { ok: false, code: 'forbidden', message: 'This match is assigned to another scorer' };
  }

  const { engine, ctx } = await getContext(db, match);
  // A replay is only needed for undo, or when there is no usable cached state yet.
  const history = (): Promise<LoggedEvent[]> =>
    match.lastSeq === 0 ? Promise.resolve([]) : loadHistory(db, match.id);

  const conflict = async (): Promise<SubmitResult> => {
    const fresh = await loadMatchWithState(db, match.id);
    const current = fresh?.match ?? match;
    const state = fresh?.cachedState !== undefined ? fresh.cachedState : replay(engine, ctx, await history());
    return { ok: false, code: 'conflict', message: 'Your view is out of date', snapshot: snapshotOf(current, engine, ctx, state) };
  };

  if (input.expectedSeq !== match.lastSeq) return conflict();

  const event = { type: input.type, payload: input.payload };
  const decision =
    event.type !== 'undo' && row.cachedState !== undefined
      ? decideOnState(engine, row.cachedState, event)
      : decide(engine, ctx, await history(), event);
  if (!decision.ok) return { ok: false, code: 'invalid', message: decision.error };

  const { state, event: recorded } = decision.value;
  const seq = match.lastSeq + 1;
  const outcome = engine.outcome?.(state);

  let status = match.status;
  if (outcome?.complete) status = 'completed';
  else if (status === 'scheduled' || status === 'paused' || status === 'completed') status = 'live';

  const result = outcome?.complete ? JSON.stringify(outcome.result ?? {}) : null;
  const written = await db.execute(sql`
    WITH upd AS (
      UPDATE matches
         SET last_seq = ${seq}::int,
             status = ${status}::match_status,
             scorer_id = COALESCE(scorer_id, ${actor.sub}::uuid),
             result = ${result}::jsonb
       WHERE id = ${match.id}::uuid AND last_seq = ${match.lastSeq}::int
       RETURNING id
    ), ev AS (
      INSERT INTO match_events (match_id, seq, type, payload, created_by)
      SELECT id, ${seq}::int, ${recorded.type}::text, ${JSON.stringify(recorded.payload)}::jsonb, ${actor.sub}::uuid FROM upd
    ), st AS (
      INSERT INTO match_states (match_id, seq, state, updated_at)
      SELECT id, ${seq}::int, ${JSON.stringify(state)}::jsonb, now() FROM upd
      ON CONFLICT (match_id) DO UPDATE
        SET seq = EXCLUDED.seq, state = EXCLUDED.state, updated_at = EXCLUDED.updated_at
    )
    SELECT count(*)::int AS n FROM upd
  `);
  if (Number((written.rows[0] as { n?: number } | undefined)?.n ?? 0) !== 1) return conflict();

  const updated: MatchRow = { ...match, status, lastSeq: seq };
  return {
    ok: true,
    statusChanged: status !== match.status,
    update: { ...snapshotOf(updated, engine, ctx, state, seq), event: recorded },
  };
}

/** Free the scorer lock so another scorer can take over. */
export async function releaseMatch(actor: Actor, matchId: string): Promise<boolean> {
  const db = getDb();
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  const privileged = actor.role === 'admin' || (!!match?.tournamentId && (await isTournamentManager(getDb(), match.tournamentId, actor.sub)));
  if (!match || (match.scorerId !== actor.sub && !privileged)) return false;
  await db.update(matches).set({ scorerId: null }).where(eq(matches.id, matchId));
  return true;
}

// ---------------------------------------------------------------------------
// Read models for the public site
// ---------------------------------------------------------------------------

export interface MatchCardData {
  id: string;
  sportKey: SportKey;
  sportName: string;
  status: MatchRow['status'];
  venue: string | null;
  /** ISO string so it can cross the server/client boundary. */
  scheduledAt: string | null;
  seq: number;
  teamA: string;
  teamB: string;
  teamAShort: string | null;
  teamBShort: string | null;
  /** Tournament name, if the match belongs to one. */
  competition: string | null;
  /** Who won a finished match; null for a tie, no result or an unfinished match. */
  winner: 'a' | 'b' | null;
  tournamentId: string | null;
  /** The scorer the organiser assigned, if any. */
  assignedScorerId: string | null;
  visibility: 'public' | 'link' | 'private';
  /** Round label from an imported fixture, e.g. "Match 3" or "Group A · Match 1". */
  round: string | null;
  /** The fixture number it was made from (imported fixtures), to order matches that start together. */
  fixtureNo: number | null;
  /** Overs per innings (cricket), as set for this match. */
  overs: number | null;
  summary: ScoreSummary;
}

/** Who is asking, so a query can leave out what they may not see. A bare `true` means a signed-in member. */
export interface Viewer {
  signedIn: boolean;
  admin?: boolean;
  /** Tournaments they manage. */
  managed?: string[];
}
type ViewerArg = boolean | Viewer | null | undefined;
const asViewer = (v: ViewerArg): Viewer => (v && typeof v === 'object' ? v : { signedIn: !!v });

/** Matches of a private tournament are for admins and that tournament's managers only. */
function tournamentGate(v: Viewer) {
  if (v.admin) return sql`true`;
  const managed = v.managed?.length ? sql` and tt.id not in (${sql.join(v.managed.map((m) => sql`${m}::uuid`), sql`, `)})` : sql``;
  return sql`(${matches.tournamentId} is null or not exists (select 1 from tournaments tt where tt.id = ${matches.tournamentId} and tt.visibility = 'private'${managed}))`;
}

/** Tournaments a viewer may see: public ones, plus private ones they manage (admins see all). */
function tournamentVisible(v: Viewer) {
  if (v.admin) return sql`true`;
  return v.managed?.length ? sql`(${tournaments.visibility} = 'public' or ${inArray(tournaments.id, v.managed)})` : sql`${tournaments.visibility} = 'public'`;
}

export interface MatchCardQuery {
  sportKey?: string;
  statuses?: MatchRow['status'][];
  matchId?: string;
  tournamentId?: string;
  /** Whether the viewer is signed in: members-only matches are hidden from everyone else. */
  signedIn?: boolean;
  /** Who is asking. Takes the place of `signedIn` and also hides private tournaments from anyone who does not manage them. */
  viewer?: Viewer;
  limit?: number;
  /** `upcoming` = soonest first; `recent` (default) = newest first. */
  order?: 'upcoming' | 'recent';
}

/** Matches of enabled sports, each with a score summary from its cached state. */
export async function listMatchCards(q: MatchCardQuery = {}): Promise<MatchCardData[]> {
  const db = getDb();
  const a = alias(teams, 'a');
  const b = alias(teams, 'b');

  const filters = [eq(sports.enabled, true)];
  if (q.sportKey) filters.push(eq(sports.key, q.sportKey));
  if (q.statuses) filters.push(inArray(matches.status, q.statuses));
  if (q.matchId) filters.push(eq(matches.id, q.matchId));
  if (q.tournamentId) filters.push(eq(matches.tournamentId, q.tournamentId));
  // public: listed for all. link: reachable by URL only, never listed. private: signed-in members only.
  // A match in a private tournament is also hidden from everyone but admins and that tournament's managers.
  const viewer = q.viewer ?? asViewer(q.signedIn);
  filters.push(
    q.matchId
      ? viewer.signedIn ? sql`true` : sql`${matches.visibility} <> 'private'`
      : viewer.signedIn ? sql`${matches.visibility} in ('public', 'private')` : sql`${matches.visibility} = 'public'`,
    tournamentGate(viewer),
  );

  const rows = await db
    .select({
      match: matches,
      sportKey: sports.key,
      sportName: sports.name,
      teamA: a.name,
      teamB: b.name,
      teamAShort: a.shortName,
      teamBShort: b.shortName,
      competition: tournaments.name,
      state: matchStates.state,
      stateSeq: matchStates.seq,
    })
    .from(matches)
    .innerJoin(sports, eq(sports.id, matches.sportId))
    .innerJoin(a, eq(a.id, matches.teamAId))
    .innerJoin(b, eq(b.id, matches.teamBId))
    .leftJoin(tournaments, eq(tournaments.id, matches.tournamentId))
    .leftJoin(matchStates, eq(matchStates.matchId, matches.id))
    .where(and(...filters))
    .orderBy(
      q.order === 'upcoming'
        ? sql`${matches.scheduledAt} asc nulls last`
        : sql`coalesce(${matches.scheduledAt}, ${matches.createdAt}) desc`,
    )
    .limit(q.limit ?? 50);

  return rows.map((r): MatchCardData => {
    const key = r.sportKey as SportKey;
    const engine = getEngine(key);
    const ctx: MatchContext = {
      matchId: r.match.id,
      teams: [
        { id: r.match.teamAId, name: r.teamA },
        { id: r.match.teamBId, name: r.teamB },
      ],
      config: r.match.config,
    };
    // The cached state is only trustworthy when it matches the match's last event.
    const state = r.state && r.stateSeq === r.match.lastSeq ? r.state : engine.initialState(ctx);
    return {
      id: r.match.id,
      sportKey: key,
      sportName: r.sportName,
      status: r.match.status,
      venue: r.match.venue,
      scheduledAt: r.match.scheduledAt?.toISOString() ?? null,
      seq: r.match.lastSeq,
      teamA: r.teamA,
      teamB: r.teamB,
      teamAShort: r.teamAShort,
      teamBShort: r.teamBShort,
      competition: r.competition,
      winner:
        r.match.result?.winnerTeamId === r.match.teamAId ? 'a'
        : r.match.result?.winnerTeamId === r.match.teamBId ? 'b'
        : null,
      tournamentId: r.match.tournamentId,
      assignedScorerId: r.match.assignedScorerId,
      visibility: r.match.visibility as MatchCardData['visibility'],
      round: ((r.match.meta as { round?: unknown } | null)?.round as string | undefined) ?? null,
      fixtureNo: Number.isInteger((r.match.meta as { fixtureNo?: unknown } | null)?.fixtureNo) ? ((r.match.meta as { fixtureNo: number }).fixtureNo) : null,
      overs: Number.isInteger((r.match.config as { overs?: unknown } | null)?.overs) ? Number((r.match.config as { overs: number }).overs) : null,
      summary: engine.summary(state, ctx),
    };
  });
}

export async function getMatchCard(matchId: string, viewer: ViewerArg = false): Promise<MatchCardData | null> {
  return (await listMatchCards({ matchId, viewer: asViewer(viewer), limit: 1 }))[0] ?? null;
}

export interface LeaderboardRow extends BoardRow { name: string }
export interface Leaderboard extends Omit<Board, 'rows'> { rows: LeaderboardRow[] }

/** The tournament's cricket leaderboards (runs, wickets, wins, catches, averages, records, economy). */
export async function getTournamentLeaderboards(tournamentId: string): Promise<Leaderboard[]> {
  const db = getDb();
  const rows = await db
    .select({ state: matchStates.state, status: matches.status, result: matches.result })
    .from(matchStates)
    .innerJoin(matches, eq(matches.id, matchStates.matchId))
    .where(eq(matches.tournamentId, tournamentId));
  const input: LeaderMatch[] = rows
    .filter((r) => (r.state as CricketState | null)?.kind === 'cricket')
    .map((r) => ({ state: r.state as CricketState, completed: r.status === 'completed', winnerTeamId: ((r.result as { winnerTeamId?: string | null } | null)?.winnerTeamId ?? null) }));

  const ids = new Set<string>();
  for (const m of input) {
    for (const squad of Object.values(m.state.squads ?? {})) squad.forEach((id) => ids.add(id));
    for (const inn of m.state.innings) { Object.keys(inn.batters).forEach((id) => ids.add(id)); Object.keys(inn.bowlers).forEach((id) => ids.add(id)); }
  }
  const nameRows = ids.size ? await db.select({ id: players.id, name: players.name }).from(players).where(inArray(players.id, [...ids])) : [];
  const names = Object.fromEntries(nameRows.map((p) => [p.id, p.name]));
  return computeCricketBoards(input, names).map((b) => ({ ...b, rows: b.rows.map((r) => ({ ...r, name: names[r.playerId] ?? '?' })) }));
}

export interface Leader {
  playerId: string;
  name: string;
  value: number;
  /** Secondary line, e.g. "42 balls" or "11.0 overs". */
  detail: string;
}

/** Top run-scorers and wicket-takers across all cricket matches. */
export async function getCricketLeaders(limit = 5, tournamentId?: string): Promise<{ runs: Leader[]; wickets: Leader[] }> {
  const rows = await getDb()
    .select({ state: matchStates.state })
    .from(matchStates)
    .innerJoin(matches, eq(matches.id, matchStates.matchId))
    .innerJoin(sports, eq(sports.id, matches.sportId))
    .where(and(eq(sports.key, 'cricket'), eq(sports.enabled, true), ...(tournamentId ? [eq(matches.tournamentId, tournamentId)] : [])));

  const bat = new Map<string, { runs: number; balls: number }>();
  const bowl = new Map<string, { wickets: number; runs: number; balls: number }>();
  for (const { state } of rows) {
    const s = state as CricketState;
    if (s?.kind !== 'cricket') continue;
    for (const inn of s.innings) {
      for (const b of Object.values(inn.batters)) {
        const t = bat.get(b.id) ?? { runs: 0, balls: 0 };
        bat.set(b.id, { runs: t.runs + b.runs, balls: t.balls + b.balls });
      }
      for (const b of Object.values(inn.bowlers)) {
        const t = bowl.get(b.id) ?? { wickets: 0, runs: 0, balls: 0 };
        bowl.set(b.id, { wickets: t.wickets + b.wickets, runs: t.runs + b.runs, balls: t.balls + b.legalBalls });
      }
    }
  }

  const topBat = [...bat].filter(([, v]) => v.runs > 0).sort((x, y) => y[1].runs - x[1].runs).slice(0, limit);
  const topBowl = [...bowl]
    .filter(([, v]) => v.wickets > 0)
    .sort((x, y) => y[1].wickets - x[1].wickets || x[1].runs - y[1].runs)
    .slice(0, limit);

  const ids = [...new Set([...topBat, ...topBowl].map(([id]) => id))];
  const nameRows = ids.length
    ? await getDb().select({ id: players.id, name: players.name }).from(players).where(inArray(players.id, ids))
    : [];
  const names = new Map(nameRows.map((p) => [p.id, p.name]));

  return {
    runs: topBat.map(([id, v]) => ({ playerId: id, name: names.get(id) ?? '?', value: v.runs, detail: `${v.balls} ball${v.balls === 1 ? '' : 's'}` })),
    wickets: topBowl.map(([id, v]) => ({
      playerId: id,
      name: names.get(id) ?? '?',
      value: v.wickets,
      detail: `${formatOvers(v.balls)} ov · ${v.runs} runs`,
    })),
  };
}

// ---------------------------------------------------------------------------
// Tournaments
// ---------------------------------------------------------------------------

export interface TournamentSummary {
  id: string;
  name: string;
  /** private: only admins and the tournament's managers can see it. */
  visibility: 'public' | 'private';
  sportKey: SportKey;
  sportName: string;
  formatKey: FormatKey;
  formatLabel: string;
  startsAt: string | null;
  endsAt: string | null;
  venues: string[];
  teamCount: number;
  /** Matches finished / matches the tournament has or is planned to have. */
  played: number;
  total: number;
  status: 'live' | 'up' | 'done';
}

export interface StandingRow extends Standing {
  name: string;
  short: string | null;
}

/** An imported fixture that is not a match yet: a knockout slot waiting on a result, or a sport that has no scoring yet. */
export interface PendingFixture {
  no: number;
  round: string | null;
  date: string;
  time: string;
  venue: string | null;
  labelA: string;
  labelB: string;
  /** Which sides are still "Winner of Match N". */
  openA: boolean;
  openB: boolean;
}

/** Sports whose matches can be created and scored. Others keep their imported fixtures as a schedule only. */
const SCORED_SPORTS = new Set(['cricket', 'foosball']);

const slotText = (s: FixtureSlot) => slotLabel(s);

/** Fixture numbers of the knockout stage (any side that is not a plain team). Their results do not count in the league table. */
const knockoutNos = (meta: TournamentMeta | null | undefined) => new Set((meta?.bracket ?? []).filter((f) => !f.group && (f.a.kind !== 'team' || f.b.kind !== 'team')).map((f) => f.no));

/** Completed matches as the standings maths wants them. */
function toFinished(rows: { match: { teamAId: string; teamBId: string; result: unknown }; state: unknown }[]): FinishedMatch[] {
  return rows.map(({ match, state }) => {
    const result = match.result as { winnerTeamId?: string; text?: string } | null;
    const winner = result?.winnerTeamId ?? null;
    const cs = state as CricketState | null;
    const fs = state as FoosballState | null;
    const tg = fs?.kind === 'foosball' ? totalGoals(fs) : null;
    return {
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      winnerTeamId: winner,
      outcome: winner ? 'win' : /tie/i.test(String(result?.text ?? '')) ? 'tie' : 'no_result',
      stats: cs?.kind === 'cricket' ? (matchTeamStats(cs) ?? undefined) : undefined,
      goals: tg && fs ? { [fs.teams[0]!.id]: { for: tg.a, against: tg.b }, [fs.teams[1]!.id]: { for: tg.b, against: tg.a } } : undefined,
    };
  });
}

/**
 * Turns imported bracket fixtures into real matches once both of their teams are known: a slot with a team is known
 * at once, "Winner of Match N" once that match has a winner. Safe to call any time and from several places; a
 * fixture number can only become one match. Returns how many matches it created.
 */
export async function advanceBracket(tournamentId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ t: tournaments, sportId: sports.id, sportKey: sports.key })
    .from(tournaments)
    .innerJoin(sports, eq(sports.id, tournaments.sportId))
    .where(eq(tournaments.id, tournamentId))
    .limit(1);
  const meta = row?.t.meta as unknown as TournamentMeta | undefined;
  if (!row || !meta?.bracket?.length || !SCORED_SPORTS.has(row.sportKey)) return 0;

  const bracket = meta.bracket;
  const open = bracket.filter((f) => !f.matchId);
  if (open.length === 0) return 0;

  const made = bracket.filter((f) => f.matchId).map((f) => f.matchId!);
  const results = made.length ? await db.select({ id: matches.id, status: matches.status, a: matches.teamAId, b: matches.teamBId, result: matches.result }).from(matches).where(inArray(matches.id, made)) : [];
  const outcome = new Map<number, { winner: string; loser: string }>();
  for (const f of bracket) {
    const m = f.matchId ? results.find((x) => x.id === f.matchId) : undefined;
    const winner = (m?.result as { winnerTeamId?: string | null } | null)?.winnerTeamId;
    if (m && m.status === 'completed' && winner) outcome.set(f.no, { winner, loser: winner === m.a ? m.b : m.a });
  }
  // Table positions are known once every league match is done. The knockout stage does not count in the table.
  const leagueFixtures = bracket.filter((f) => f.a.kind === 'team' && f.b.kind === 'team');
  const leagueDone = leagueFixtures.length > 0 && leagueFixtures.every((f) => f.matchId && results.find((x) => x.id === f.matchId)?.status === 'completed');
  let table: string[] | null = null;
  const groupTables = new Map<string, string[]>();
  const groupMembers = new Map<string, string[]>();
  const wantsRank = open.some((f) => f.a.kind === 'rank' || f.b.kind === 'rank');
  if (wantsRank && (leagueDone || meta.groups?.length)) {
    const ko = knockoutNos(meta);
    const rows = await db
      .select({ match: matches, state: matchStates.state })
      .from(matches)
      .leftJoin(matchStates, eq(matchStates.matchId, matches.id))
      .where(and(eq(matches.tournamentId, tournamentId), eq(matches.status, 'completed')));
    const league = rows.filter(({ match }) => !ko.has(Number((match.meta as { fixtureNo?: unknown } | null)?.fixtureNo)));
    if (meta.groups?.length) {
      // Each group has its own table, known once every match of that group is done. A later-stage group is made of places
      // in earlier groups, so groups are taken in order and its members are known once those places are.
      const place = (x: FixtureSlot): string | null => (x.kind === 'team' ? x.id : x.kind === 'rank' ? (groupTables.get(x.group ?? '')?.[x.pos - 1] ?? null) : null);
      for (const g of meta.groups) {
        let ids: string[] | null = g.teamIds;
        if (g.from) { const r = g.from.map(place); ids = r.every((x): x is string => !!x) ? r : null; }
        if (!ids || ids.length === 0) continue;
        groupMembers.set(g.name, ids);
        const mine = bracket.filter((f) => f.group === g.name);
        if (mine.length === 0 || !mine.every((f) => f.matchId && results.find((x) => x.id === f.matchId)?.status === 'completed')) continue;
        const inGroup = league.filter(({ match }) => (match.meta as { group?: unknown } | null)?.group === g.name);
        groupTables.set(g.name, computeStandings(ids, toFinished(inGroup), meta.points ?? DEFAULT_POINTS, meta.tiebreak ?? 'NRR').map((x) => x.teamId));
      }
    } else {
      table = computeStandings(meta.teams.map((t) => t.id), toFinished(league), meta.points ?? DEFAULT_POINTS, meta.tiebreak ?? 'NRR').map((x) => x.teamId);
    }
  }
  const teamOf = (s: FixtureSlot): string | null =>
    s.kind === 'team' ? s.id : s.kind === 'rank' ? ((s.group ? groupTables.get(s.group) : table)?.[s.pos - 1] ?? null) : (outcome.get(s.match)?.[s.kind] ?? null);

  const overs = meta.overs ?? 20;
  let created = 0;
  const next: BracketFixture[] = bracket.map((f) => ({ ...f }));
  for (const f of next) {
    if (f.matchId) continue;
    const a = teamOf(f.a), b = teamOf(f.b);
    if (!a || !b || a === b) continue;
    const [m] = await db
      .insert(matches)
      .values({
        sportId: row.sportId, tournamentId, teamAId: a, teamBId: b, venue: f.venue, scheduledAt: toInstant(f.date, f.time, f.tz),
        config: row.sportKey === 'foosball'
          ? { ...foosballRules(meta.rules) }
          : { overs, ballsPerOver: 6, powerplayOvers: Math.min(6, overs), playersPerSide: 11, maxOversPerBowler: Math.ceil(overs / 5), freeHit: true, wideReball: true, superOver: true, dls: false },
        visibility: 'public', meta: { ...(f.round ? { round: f.round } : {}), ...(f.group ? { group: f.group } : {}), fixtureNo: f.no, source: meta.formatKey === 'lk' ? 'table' : 'fixture-import' },
      })
      .onConflictDoNothing()
      .returning({ id: matches.id });
    if (m) { f.matchId = m.id; created++; continue; }
    // another request made it first: link to that one
    const [have] = await db.select({ id: matches.id }).from(matches).where(and(eq(matches.tournamentId, tournamentId), sql`${matches.meta}->>'fixtureNo' = ${String(f.no)}`)).limit(1);
    if (have) f.matchId = have.id;
  }
  const settled = (meta.groups ?? []).filter((g) => g.from && g.teamIds.length === 0 && groupMembers.has(g.name));
  if (settled.length || next.some((f, i) => f.matchId !== bracket[i]!.matchId)) {
    // merge by fixture number into the freshest copy, so two writers never undo each other
    const [fresh] = await db.select({ meta: tournaments.meta }).from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
    const cur = fresh!.meta as unknown as TournamentMeta;
    const merged = (cur.bracket ?? []).map((f) => ({ ...f, matchId: f.matchId ?? next.find((n) => n.no === f.no)?.matchId ?? null }));
    // a later-stage group remembers who its members are once they are known
    const groups = (cur.groups ?? []).map((g) => (g.from && g.teamIds.length === 0 && groupMembers.has(g.name) ? { ...g, teamIds: groupMembers.get(g.name)! } : g));
    await db.update(tournaments).set({ meta: { ...cur, bracket: merged, ...(groups.length ? { groups } : {}) } as unknown as Record<string, unknown> }).where(eq(tournaments.id, tournamentId));
  }
  return created;
}

/**
 * Makes the fixtures of a Table tournament from its teams and settings, replacing whatever fixtures it had.
 * Other types just have their fixtures cleared (the organiser builds or pastes them). Nothing happens once the
 * tournament has started. Returns how many fixtures were removed and how many matches were made right away.
 */
export async function rebuildFixtures(tournamentId: string): Promise<{ removed: number; generated: number; locked: boolean }> {
  if (await tournamentStarted(tournamentId)) return { removed: 0, generated: 0, locked: true };
  const removed = await clearFixtures(tournamentId);
  const db = getDb();
  const [row] = await db
    .select({ t: tournaments, sportKey: sports.key })
    .from(tournaments)
    .innerJoin(sports, eq(sports.id, tournaments.sportId))
    .where(eq(tournaments.id, tournamentId))
    .limit(1);
  const meta = row?.t.meta as unknown as TournamentMeta | undefined;
  if (!row || !meta?.teams?.length || meta.formatKey !== 'lk') return { removed, generated: 0, locked: false };

  const bracket = generateTableFixtures({
    teams: meta.teams, qualify: meta.qualify, matchesPerTeam: fitMatchesPerTeam(meta.teams.length, meta.matchesPerTeam), startDate: meta.schedule.startDate, perDay: meta.schedule.perDay, firstMatchTime: meta.schedule.firstMatchTime,
    restDay: meta.schedule.restDay, gapMinutes: gapMinutesFor(row.sportKey, meta.overs), venues: (meta.venues ?? []).map((v) => v.name), tz: meta.tz ?? 0,
  });
  await db.update(tournaments).set({ meta: { ...meta, bracket, fixturesGenerated: bracket.length > 0 } as unknown as Record<string, unknown> }).where(eq(tournaments.id, tournamentId));
  return { removed, generated: await advanceBracket(tournamentId), locked: false };
}

/** A tournament has started once any of its matches is live or finished, or has a ball scored. */
export async function tournamentStarted(tournamentId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(matches)
    .where(and(eq(matches.tournamentId, tournamentId), sql`(${matches.status} <> 'scheduled' or ${matches.lastSeq} > 0)`));
  return Number(row?.n ?? 0) > 0;
}

/**
 * Removes every fixture of a tournament that has not started: its scheduled matches and the imported bracket (with the
 * byes). Teams, venues and rules stay. Callers check `tournamentStarted` first. Returns how many fixtures went.
 */
export async function clearFixtures(tournamentId: string): Promise<number> {
  const db = getDb();
  const deleted = await db
    .delete(matches)
    .where(and(eq(matches.tournamentId, tournamentId), eq(matches.status, 'scheduled'), eq(matches.lastSeq, 0)))
    .returning({ id: matches.id });
  const [row] = await db.select({ meta: tournaments.meta }).from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
  const meta = row?.meta as unknown as TournamentMeta | undefined;
  const waiting = (meta?.bracket ?? []).filter((f) => !f.matchId).length;
  if (meta && (meta.bracket || meta.byes || meta.groups || meta.fixturesGenerated)) {
    const { bracket: _b, byes: _y, groups: _g, ...rest } = meta;
    await db.update(tournaments).set({ meta: { ...rest, fixturesGenerated: false } as unknown as Record<string, unknown> }).where(eq(tournaments.id, tournamentId));
  }
  return deleted.length + waiting;
}

export interface TournamentDetail extends TournamentSummary {
  /** People who score the tournament's matches and edit their data. Names only: this page is public. */
  managers: { id: string; name: string }[];
  /** Fixtures right now: scheduled matches plus imported ones waiting on a result. */
  fixtureCount: number;
  /** Once true, fixtures and teams are locked in. */
  started: boolean;
  /** Imported fixtures that are not matches yet, in the order played. */
  pending: PendingFixture[];
  /** Teams that skip the first round. */
  byes: string[];
  meta: TournamentMeta | null;
  standings: StandingRow[];
  /** Group tournaments: one points table per group, and how many of each go through to the knockouts. */
  groupStandings: { name: string; qualify: number; rows: StandingRow[] }[];
  /** The tournament's matches (fixtures made through the match wizard), with scores. */
  matches: MatchCardData[];
  /** Cricket leaderboards; null for other sports. */
  boards: Leaderboard[] | null;
  /** A projection from the standings (or seeding), not fixtures. */
  bracket: { rounds: BracketRound[]; seeds: string[]; projected: boolean } | null;
  qualify: number;
  tiebreak: string;
  hasFixtures: boolean;
}

const DEFAULT_POINTS = { win: 2, tie: 1, noResult: 1 };

function visibilityFilter(v: Viewer) {
  return and(v.signedIn ? sql`${matches.visibility} in ('public', 'private')` : sql`${matches.visibility} = 'public'`, tournamentGate(v))!;
}

/** Why a viewer cannot open a match, so the page can say so instead of pretending it does not exist. */
export async function matchAccess(matchId: string, who: ViewerArg): Promise<'ok' | 'private-tournament' | 'members-only' | 'missing'> {
  const v = asViewer(who);
  const [row] = await getDb()
    .select({ visibility: matches.visibility, tournamentId: matches.tournamentId, tVisibility: tournaments.visibility })
    .from(matches)
    .leftJoin(tournaments, eq(tournaments.id, matches.tournamentId))
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!row) return 'missing';
  if (row.tournamentId && row.tVisibility === 'private' && !v.admin && !v.managed?.includes(row.tournamentId)) return 'private-tournament';
  if (row.visibility === 'private' && !v.signedIn) return 'members-only';
  return 'ok';
}

/** The same for a tournament page. */
export async function tournamentAccess(id: string, who: ViewerArg): Promise<'ok' | 'private' | 'missing'> {
  const v = asViewer(who);
  const [row] = await getDb().select({ visibility: tournaments.visibility }).from(tournaments).where(eq(tournaments.id, id)).limit(1);
  if (!row) return 'missing';
  return row.visibility === 'private' && !v.admin && !v.managed?.includes(id) ? 'private' : 'ok';
}

/** A signed-in person as a Viewer, for the live-score server, which only knows their id and role. */
export async function viewerForUser(userId: string, role: string): Promise<Viewer> {
  const mine = await getDb().select({ t: tournamentManagers.tournamentId }).from(tournamentManagers).where(eq(tournamentManagers.userId, userId));
  return { signedIn: true, admin: role === 'admin', managed: mine.map((m) => m.t) };
}

function statusOf(t: { startsAt: Date | null; endsAt: Date | null }, c: { created: number; played: number; open: number; active: boolean }, total: number): TournamentSummary['status'] {
  const now = Date.now();
  if (total > 0 && c.played >= total) return 'done';
  if (t.endsAt && t.endsAt.getTime() + 86_400_000 < now && c.open === 0) return 'done';
  if (c.active || (t.startsAt && t.startsAt.getTime() <= now)) return 'live';
  return 'up';
}

function summarise(
  row: { t: typeof tournaments.$inferSelect; sportKey: string; sportName: string },
  counts: { status: string; n: number }[],
): TournamentSummary {
  const meta = row.t.meta as unknown as TournamentMeta;
  const n = (statuses: string[]) => counts.filter((c) => statuses.includes(c.status)).reduce((a, c) => a + c.n, 0);
  const created = counts.reduce((a, c) => a + c.n, 0);
  const played = n(['completed']);
  const total = Math.max(created, meta.plan?.totalMatches ?? 0);
  const formatKey = (meta.formatKey ?? 'league') as FormatKey;
  return {
    id: row.t.id,
    name: row.t.name,
    visibility: row.t.visibility === 'private' ? 'private' : 'public',
    sportKey: row.sportKey as SportKey,
    sportName: row.sportName,
    formatKey,
    formatLabel: FORMATS[formatKey]?.label ?? 'League',
    startsAt: row.t.startsAt?.toISOString() ?? null,
    endsAt: row.t.endsAt?.toISOString() ?? null,
    venues: (meta.venues ?? []).map((v) => v.name),
    teamCount: meta.teams?.length ?? 0,
    played,
    total,
    status: statusOf(row.t, { created, played, open: n(['scheduled', 'live', 'paused']), active: n(['live', 'paused', 'completed']) > 0 }, total),
  };
}

export async function listTournaments(who: ViewerArg = false): Promise<TournamentSummary[]> {
  const v = asViewer(who);
  const db = getDb();
  const rows = await db
    .select({ t: tournaments, sportKey: sports.key, sportName: sports.name })
    .from(tournaments)
    .innerJoin(sports, eq(sports.id, tournaments.sportId))
    .where(and(eq(sports.enabled, true), tournamentVisible(v)))
    .orderBy(desc(tournaments.startsAt), desc(tournaments.createdAt));
  if (rows.length === 0) return [];

  const counted = await db
    .select({ tournamentId: matches.tournamentId, status: matches.status, n: count() })
    .from(matches)
    .where(and(inArray(matches.tournamentId, rows.map((r) => r.t.id)), visibilityFilter(v)))
    .groupBy(matches.tournamentId, matches.status);

  return rows.map((r) => summarise(r, counted.filter((c) => c.tournamentId === r.t.id).map((c) => ({ status: c.status, n: Number(c.n) }))));
}

export async function getTournamentDetail(id: string, who: ViewerArg = false): Promise<TournamentDetail | null> {
  const v = asViewer(who);
  const db = getDb();
  const [row] = await db
    .select({ t: tournaments, sportKey: sports.key, sportName: sports.name })
    .from(tournaments)
    .innerJoin(sports, eq(sports.id, tournaments.sportId))
    .where(and(eq(tournaments.id, id), eq(sports.enabled, true), tournamentVisible(v)))
    .limit(1);
  if (!row) return null;

  let meta = (row.t.meta as unknown as TournamentMeta) ?? null;
  // winners decided since the last visit open the next knockout matches
  // (read it again either way: a request running at the same moment may have made the match first)
  if (meta?.bracket?.some((f) => !f.matchId) && SCORED_SPORTS.has(row.sportKey)) {
    await advanceBracket(id);
    const [again] = await db.select({ meta: tournaments.meta }).from(tournaments).where(eq(tournaments.id, id)).limit(1);
    meta = (again?.meta as unknown as TournamentMeta) ?? meta;
  }
  const teamIds = (meta?.teams ?? []).map((t) => t.id);

  const [cards, teamRows, finishedRows] = await Promise.all([
    listMatchCards({ tournamentId: id, viewer: v, limit: 500 }),
    teamIds.length ? db.select({ id: teams.id, name: teams.name, shortName: teams.shortName }).from(teams).where(inArray(teams.id, teamIds)) : Promise.resolve([]),
    db
      .select({ match: matches, state: matchStates.state })
      .from(matches)
      .leftJoin(matchStates, eq(matchStates.matchId, matches.id))
      .where(and(eq(matches.tournamentId, id), eq(matches.status, 'completed'), visibilityFilter(v)))
      .orderBy(asc(matches.scheduledAt), asc(matches.createdAt)),
  ]);

  const ko = knockoutNos(meta);
  const finished = toFinished(finishedRows.filter(({ match }) => !ko.has(Number((match.meta as { fixtureNo?: unknown } | null)?.fixtureNo))));

  const points = meta?.points ?? DEFAULT_POINTS;
  const tiebreak = meta?.tiebreak ?? 'NRR';
  const names = new Map(teamRows.map((t) => [t.id, t]));
  const standings: StandingRow[] = computeStandings(teamIds, finished, points, tiebreak).map((s) => ({
    ...s,
    name: names.get(s.teamId)?.name ?? meta?.teams.find((t) => t.id === s.teamId)?.name ?? '?',
    short: names.get(s.teamId)?.shortName ?? null,
  }));

  const groupStandings = (meta?.groups ?? []).map((g) => {
    const wanted = (meta?.bracket ?? []).flatMap((f) => [f.a, f.b]).filter((x) => x.kind === 'rank' && x.group === g.name).map((x) => (x as { pos: number }).pos);
    const base = { name: g.name, qualify: Math.min(wanted.length ? Math.max(...wanted) : 2, g.from ? g.from.length : g.teamIds.length) };
    // a later-stage group whose members are not known yet lists the places it is waiting for
    if (g.from && g.teamIds.length === 0) {
      return { ...base, rows: g.from.map((x): StandingRow => ({ teamId: slotKey(x), played: 0, won: 0, lost: 0, tied: 0, noResult: 0, points: 0, diff: 0, form: [], name: slotLabel(x), short: null })) };
    }
    const mine = finishedRows.filter(({ match }) => (match.meta as { group?: unknown } | null)?.group === g.name);
    const rows = computeStandings(g.teamIds, toFinished(mine), points, tiebreak).map((s) => ({
      ...s,
      name: names.get(s.teamId)?.name ?? meta?.teams.find((t) => t.id === s.teamId)?.name ?? '?',
      short: names.get(s.teamId)?.shortName ?? null,
    }));
    return { ...base, rows };
  });

  const counts = Object.entries(cards.reduce<Record<string, number>>((m, c) => ((m[c.status] = (m[c.status] ?? 0) + 1), m), {})).map(([status, n]) => ({ status, n }));
  const summary = summarise(row, counts);

  // Seeds: current standings once matches are played, otherwise the order teams were entered.
  const seeds = (summary.played > 0 ? standings.map((s) => s.name) : (meta?.teams ?? []).map((t) => names.get(t.id)?.name ?? t.name));
  const qualify = meta?.qualify ?? 4;
  const rounds =
    summary.formatKey === 'ko' ? projectKnockout(seeds.length)
    : summary.formatKey === 'league' ? []
    : projectLeagueKnockout(qualify);

  const pending: PendingFixture[] = (meta?.bracket ?? [])
    .filter((f) => !f.matchId)
    .sort((x, y) => `${x.date} ${x.time}`.localeCompare(`${y.date} ${y.time}`) || x.no - y.no)
    .map((f) => ({ no: f.no, round: f.round, date: f.date, time: f.time, venue: f.venue, labelA: slotText(f.a), labelB: slotText(f.b), openA: f.a.kind !== 'team', openB: f.b.kind !== 'team' }));

  return {
    ...summary,
    meta,
    pending,
    managers: await db.select({ id: users.id, name: users.name }).from(tournamentManagers).innerJoin(users, eq(users.id, tournamentManagers.userId)).where(eq(tournamentManagers.tournamentId, id)).orderBy(asc(users.name)),
    fixtureCount: cards.length + pending.length,
    started: await tournamentStarted(id),
    byes: (meta?.byes ?? []).map((b) => b.name),
    standings,
    groupStandings,
    matches: cards,
    boards: row.sportKey === 'cricket' ? await getTournamentLeaderboards(id) : null,
    bracket: rounds.length && !groupStandings.length ? { rounds, seeds, projected: summary.played === 0 || summary.formatKey !== 'ko' } : null,
    qualify,
    tiebreak,
    hasFixtures: cards.length > 0,
  };
}
