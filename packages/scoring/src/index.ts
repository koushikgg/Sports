import {
  alias,
  and,
  asc,
  eq,
  getDb,
  getTxDb,
  inArray,
  matchEvents,
  matches,
  matchStates,
  players,
  sql,
  sports,
  teamMembers,
  teams,
  type Reader,
} from '@sports/db';
import type { Ack, MatchSnapshot, MatchUpdate, Role, ScoreEventInput, ScoreSummary, SportKey } from '@sports/shared';
import { formatOvers, type CricketState } from '@sports/sports-engine/src/cricket';
import {
  decide,
  getEngine,
  replay,
  type LoggedEvent,
  type MatchContext,
  type SportEngine,
} from '@sports/sports-engine';

type MatchRow = typeof matches.$inferSelect;

const CLOSED = ['completed', 'abandoned'];

async function loadContext(db: Reader, match: MatchRow): Promise<{ engine: SportEngine; ctx: MatchContext; sportKey: SportKey }> {
  const [sport] = await db.select().from(sports).where(eq(sports.id, match.sportId)).limit(1);
  if (!sport) throw new Error('Sport missing');
  const teamRows = await db.select().from(teams).where(inArray(teams.id, [match.teamAId, match.teamBId]));
  const byId = new Map(teamRows.map((t) => [t.id, t.name]));
  const memberRows = await db
    .select({ teamId: teamMembers.teamId, id: players.id, name: players.name })
    .from(teamMembers)
    .innerJoin(players, eq(players.id, teamMembers.playerId))
    .where(inArray(teamMembers.teamId, [match.teamAId, match.teamBId]))
    .orderBy(asc(players.name));
  const squads: Record<string, { id: string; name: string }[]> = {
    [match.teamAId]: [],
    [match.teamBId]: [],
  };
  for (const m of memberRows) squads[m.teamId]?.push({ id: m.id, name: m.name });

  const ctx: MatchContext = {
    matchId: match.id,
    teams: [match.teamAId, match.teamBId].map((id) => ({ id, name: byId.get(id) ?? '?' })),
    players: squads,
    config: match.config,
  };
  const key = sport.key as SportKey;
  return { engine: getEngine(key), ctx, sportKey: key };
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

/** Current state of a match. Uses the cached state row, falling back to a replay. */
export async function getSnapshot(matchId: string): Promise<MatchSnapshot | null> {
  const db = getDb();
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match) return null;
  const { engine, ctx } = await loadContext(db, match);

  const [cached] = await db.select().from(matchStates).where(eq(matchStates.matchId, matchId)).limit(1);
  const state =
    cached && cached.seq === match.lastSeq
      ? cached.state
      : replay(engine, ctx, await loadHistory(db, matchId));
  return snapshotOf(match, engine, ctx, state);
}

export interface Actor {
  sub: string;
  role: Role;
}

export type SubmitResult = { ok: true; update: MatchUpdate; statusChanged: boolean } | Extract<Ack, { ok: false }>;

/**
 * The single write path for scoring. One transaction: lock the match row, check the
 * caller's view is current (`expectedSeq`), let the engine decide, append the event.
 */
export async function submitScoreEvent(actor: Actor, input: ScoreEventInput): Promise<SubmitResult> {
  if (actor.role !== 'admin' && actor.role !== 'scorer') {
    return { ok: false, code: 'forbidden', message: 'Not allowed to score' };
  }

  return getTxDb().transaction(async (tx): Promise<SubmitResult> => {
    const [match] = await tx
      .select()
      .from(matches)
      .where(eq(matches.id, input.matchId))
      .for('update')
      .limit(1);
    if (!match) return { ok: false, code: 'not_found', message: 'Match not found' };
    if (CLOSED.includes(match.status) && input.type !== 'undo') {
      return { ok: false, code: 'closed', message: `Match is ${match.status}` };
    }
    if (match.scorerId && match.scorerId !== actor.sub && actor.role !== 'admin') {
      return { ok: false, code: 'locked', message: 'Another scorer is scoring this match' };
    }

    const { engine, ctx } = await loadContext(tx, match);
    const history = await loadHistory(tx, match.id);

    if (input.expectedSeq !== match.lastSeq) {
      const state = replay(engine, ctx, history);
      return {
        ok: false,
        code: 'conflict',
        message: 'Your view is out of date',
        snapshot: snapshotOf(match, engine, ctx, state),
      };
    }

    const decision = decide(engine, ctx, history, { type: input.type, payload: input.payload });
    if (!decision.ok) return { ok: false, code: 'invalid', message: decision.error };

    const { state, event } = decision.value;
    const seq = match.lastSeq + 1;
    const outcome = engine.outcome?.(state);

    let status = match.status;
    if (outcome?.complete) status = 'completed';
    else if (status === 'scheduled' || status === 'paused' || status === 'completed') status = 'live';

    await tx.insert(matchEvents).values({
      matchId: match.id,
      seq,
      type: event.type,
      payload: event.payload,
      createdBy: actor.sub,
    });
    await tx
      .insert(matchStates)
      .values({ matchId: match.id, seq, state })
      .onConflictDoUpdate({ target: matchStates.matchId, set: { seq, state, updatedAt: new Date() } });
    await tx
      .update(matches)
      .set({
        lastSeq: seq,
        status,
        scorerId: match.scorerId ?? actor.sub,
        result: outcome?.complete ? (outcome.result ?? {}) : null,
      })
      .where(eq(matches.id, match.id));

    const updated: MatchRow = { ...match, status, lastSeq: seq };
    return {
      ok: true,
      statusChanged: status !== match.status,
      update: { ...snapshotOf(updated, engine, ctx, state, seq), event },
    };
  });
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
  summary: ScoreSummary;
}

export interface MatchCardQuery {
  sportKey?: string;
  statuses?: MatchRow['status'][];
  matchId?: string;
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

  const rows = await db
    .select({
      match: matches,
      sportKey: sports.key,
      sportName: sports.name,
      teamA: a.name,
      teamB: b.name,
      state: matchStates.state,
      stateSeq: matchStates.seq,
    })
    .from(matches)
    .innerJoin(sports, eq(sports.id, matches.sportId))
    .innerJoin(a, eq(a.id, matches.teamAId))
    .innerJoin(b, eq(b.id, matches.teamBId))
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
      summary: engine.summary(state, ctx),
    };
  });
}

export async function getMatchCard(matchId: string): Promise<MatchCardData | null> {
  return (await listMatchCards({ matchId, limit: 1 }))[0] ?? null;
}

export interface Leader {
  playerId: string;
  name: string;
  value: number;
  /** Secondary line, e.g. "42 balls" or "11.0 overs". */
  detail: string;
}

/** Top run-scorers and wicket-takers across all cricket matches. */
export async function getCricketLeaders(limit = 5): Promise<{ runs: Leader[]; wickets: Leader[] }> {
  const rows = await getDb()
    .select({ state: matchStates.state })
    .from(matchStates)
    .innerJoin(matches, eq(matches.id, matchStates.matchId))
    .innerJoin(sports, eq(sports.id, matches.sportId))
    .where(and(eq(sports.key, 'cricket'), eq(sports.enabled, true)));

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
    runs: topBat.map(([id, v]) => ({ playerId: id, name: names.get(id) ?? '?', value: v.runs, detail: `${v.balls} balls` })),
    wickets: topBowl.map(([id, v]) => ({
      playerId: id,
      name: names.get(id) ?? '?',
      value: v.wickets,
      detail: `${formatOvers(v.balls)} ov · ${v.runs} runs`,
    })),
  };
}
