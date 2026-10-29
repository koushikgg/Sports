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
  tournaments,
  type Reader,
} from '@sports/db';
import { FORMATS, type Ack, type FormatKey, type MatchSnapshot, type MatchUpdate, type Role, type ScoreEventInput, type ScoreSummary, type SportKey, type TournamentMeta } from '@sports/shared';
import { formatOvers, type CricketState } from '@sports/sports-engine/src/cricket';
import { matchTeamStats } from '@sports/sports-engine/src/cricket-view';
import { computeCricketBoards, type Board, type BoardRow, type LeaderMatch } from '@sports/sports-engine/src/leaders';
import { computeStandings, type FinishedMatch, type Standing } from '@sports/sports-engine/src/standings';
import { projectKnockout, projectLeagueKnockout, type BracketRound } from '@sports/sports-engine/src/tournament-plan';
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
  if (hit && Date.now() - hit.at < CONTEXT_TTL_MS) return hit.value;
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
  if (match.scorerId && match.scorerId !== actor.sub && actor.role !== 'admin') {
    return { ok: false, code: 'locked', message: 'Another scorer is scoring this match' };
  }

  if (match.assignedScorerId && match.assignedScorerId !== actor.sub && actor.role !== 'admin') {
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
  if (!match || (match.scorerId !== actor.sub && actor.role !== 'admin')) return false;
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
  summary: ScoreSummary;
}

export interface MatchCardQuery {
  sportKey?: string;
  statuses?: MatchRow['status'][];
  matchId?: string;
  tournamentId?: string;
  /** Whether the viewer is signed in: members-only matches are hidden from everyone else. */
  signedIn?: boolean;
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
  filters.push(
    q.matchId
      ? q.signedIn ? sql`true` : sql`${matches.visibility} <> 'private'`
      : q.signedIn ? sql`${matches.visibility} in ('public', 'private')` : sql`${matches.visibility} = 'public'`,
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
      summary: engine.summary(state, ctx),
    };
  });
}

export async function getMatchCard(matchId: string, signedIn = false): Promise<MatchCardData | null> {
  return (await listMatchCards({ matchId, signedIn, limit: 1 }))[0] ?? null;
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

export interface TournamentDetail extends TournamentSummary {
  meta: TournamentMeta | null;
  standings: StandingRow[];
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

function visibilityFilter(signedIn: boolean) {
  return signedIn ? sql`${matches.visibility} in ('public', 'private')` : sql`${matches.visibility} = 'public'`;
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

export async function listTournaments(signedIn = false): Promise<TournamentSummary[]> {
  const db = getDb();
  const rows = await db
    .select({ t: tournaments, sportKey: sports.key, sportName: sports.name })
    .from(tournaments)
    .innerJoin(sports, eq(sports.id, tournaments.sportId))
    .where(eq(sports.enabled, true))
    .orderBy(desc(tournaments.startsAt), desc(tournaments.createdAt));
  if (rows.length === 0) return [];

  const counted = await db
    .select({ tournamentId: matches.tournamentId, status: matches.status, n: count() })
    .from(matches)
    .where(and(inArray(matches.tournamentId, rows.map((r) => r.t.id)), visibilityFilter(signedIn)))
    .groupBy(matches.tournamentId, matches.status);

  return rows.map((r) => summarise(r, counted.filter((c) => c.tournamentId === r.t.id).map((c) => ({ status: c.status, n: Number(c.n) }))));
}

export async function getTournamentDetail(id: string, signedIn = false): Promise<TournamentDetail | null> {
  const db = getDb();
  const [row] = await db
    .select({ t: tournaments, sportKey: sports.key, sportName: sports.name })
    .from(tournaments)
    .innerJoin(sports, eq(sports.id, tournaments.sportId))
    .where(and(eq(tournaments.id, id), eq(sports.enabled, true)))
    .limit(1);
  if (!row) return null;

  const meta = (row.t.meta as unknown as TournamentMeta) ?? null;
  const teamIds = (meta?.teams ?? []).map((t) => t.id);

  const [cards, teamRows, finishedRows] = await Promise.all([
    listMatchCards({ tournamentId: id, signedIn, limit: 500 }),
    teamIds.length ? db.select({ id: teams.id, name: teams.name, shortName: teams.shortName }).from(teams).where(inArray(teams.id, teamIds)) : Promise.resolve([]),
    db
      .select({ match: matches, state: matchStates.state })
      .from(matches)
      .leftJoin(matchStates, eq(matchStates.matchId, matches.id))
      .where(and(eq(matches.tournamentId, id), eq(matches.status, 'completed'), visibilityFilter(signedIn)))
      .orderBy(asc(matches.scheduledAt), asc(matches.createdAt)),
  ]);

  const finished: FinishedMatch[] = finishedRows.map(({ match, state }) => {
    const winner = (match.result?.winnerTeamId as string | undefined) ?? null;
    const text = String(match.result?.text ?? '');
    const cs = state as CricketState | null;
    return {
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      winnerTeamId: winner,
      outcome: winner ? 'win' : /tie/i.test(text) ? 'tie' : 'no_result',
      stats: cs?.kind === 'cricket' ? (matchTeamStats(cs) ?? undefined) : undefined,
    };
  });

  const points = meta?.points ?? DEFAULT_POINTS;
  const tiebreak = meta?.tiebreak ?? 'NRR';
  const names = new Map(teamRows.map((t) => [t.id, t]));
  const standings: StandingRow[] = computeStandings(teamIds, finished, points, tiebreak).map((s) => ({
    ...s,
    name: names.get(s.teamId)?.name ?? meta?.teams.find((t) => t.id === s.teamId)?.name ?? '?',
    short: names.get(s.teamId)?.shortName ?? null,
  }));

  const counts = Object.entries(cards.reduce<Record<string, number>>((m, c) => ((m[c.status] = (m[c.status] ?? 0) + 1), m), {})).map(([status, n]) => ({ status, n }));
  const summary = summarise(row, counts);

  // Seeds: current standings once matches are played, otherwise the order teams were entered.
  const seeds = (summary.played > 0 ? standings.map((s) => s.name) : (meta?.teams ?? []).map((t) => names.get(t.id)?.name ?? t.name));
  const qualify = meta?.qualify ?? 4;
  const rounds =
    summary.formatKey === 'ko' ? projectKnockout(seeds.length)
    : summary.formatKey === 'league' ? []
    : projectLeagueKnockout(qualify);

  return {
    ...summary,
    meta,
    standings,
    matches: cards,
    boards: row.sportKey === 'cricket' ? await getTournamentLeaderboards(id) : null,
    bracket: rounds.length ? { rounds, seeds, projected: summary.played === 0 || summary.formatKey !== 'ko' } : null,
    qualify,
    tiebreak,
    hasFixtures: cards.length > 0,
  };
}
