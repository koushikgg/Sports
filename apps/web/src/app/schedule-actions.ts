'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq, getDb, inArray, matches, sql, teams, tournaments } from '@sports/db';
import type { BracketFixture, TournamentMeta } from '@sports/shared';
import { toInstant } from '@sports/sports-engine/src/tournament-plan';
import { audit, requireRole } from '@/lib/guard';

const when = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date.'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Choose a time.'),
  venue: z.string().trim().max(80, 'Keep the venue under 80 characters.').optional(),
  tzOffset: z.number().int().min(-840).max(840),
});
const validDate = (s: string) => { const [y, m, d] = s.split('-').map(Number) as [number, number, number]; const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };

const STARTED = 'The match has started, so its time and venue are locked.';

/** A knockout match must be played after the matches that feed it, and before the ones it feeds. */
function orderError(bracket: BracketFixture[], no: number, date: string, time: string): string | null {
  const at = `${date} ${time}`;
  const me = bracket.find((f) => f.no === no);
  for (const s of [me?.a, me?.b]) {
    if (s && (s.kind === 'winner' || s.kind === 'loser')) {
      const src = bracket.find((f) => f.no === s.match);
      if (src && `${src.date} ${src.time}` >= at) return `It is fed by Match ${src.no}, played ${src.date} ${src.time}, so it has to come after that.`;
    }
  }
  for (const f of bracket) {
    for (const s of [f.a, f.b]) {
      if ((s.kind === 'winner' || s.kind === 'loser') && s.match === no && `${f.date} ${f.time}` <= at) return `Match ${f.no} depends on it and is played ${f.date} ${f.time}, so it has to come before that.`;
    }
  }
  return null;
}

/** Admin only. Changes when and where a match that has not started is played. */
export async function updateMatchSchedule(raw: unknown): Promise<{ error?: string }> {
  const admin = await requireRole('admin');
  const p = z.object({ matchId: z.string().uuid() }).and(when).safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? 'Check the form.' };
  const { matchId, date, time, tzOffset } = p.data;
  const venue = p.data.venue?.trim() || null;
  if (!validDate(date)) return { error: 'Choose a real date.' };

  const db = getDb();
  const [m] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!m) return { error: 'Match not found.' };
  if (m.status !== 'scheduled' || m.lastSeq > 0) return { error: STARTED };

  const at = toInstant(date, time, tzOffset);
  const [clash] = await db
    .select({ a: matches.teamAId, b: matches.teamBId })
    .from(matches)
    .where(and(sql`${matches.id} <> ${matchId}`, eq(matches.scheduledAt, at), sql`${matches.status} <> 'abandoned'`, sql`(${matches.teamAId} in (${m.teamAId}, ${m.teamBId}) or ${matches.teamBId} in (${m.teamAId}, ${m.teamBId}))`))
    .limit(1);
  if (clash) {
    const [t] = await db.select({ name: teams.name }).from(teams).where(inArray(teams.id, [clash.a, clash.b].filter((x) => x === m.teamAId || x === m.teamBId))).limit(1);
    return { error: `${t?.name ?? 'A team'} already plays another match at that time.` };
  }

  // an imported or generated fixture also lives in the tournament's bracket; keep the two in step
  const fixtureNo = Number((m.meta as { fixtureNo?: unknown } | null)?.fixtureNo);
  let meta: TournamentMeta | undefined;
  if (m.tournamentId && Number.isInteger(fixtureNo)) {
    const [t] = await db.select({ meta: tournaments.meta }).from(tournaments).where(eq(tournaments.id, m.tournamentId)).limit(1);
    meta = t?.meta as unknown as TournamentMeta | undefined;
    const bad = meta?.bracket ? orderError(meta.bracket, fixtureNo, date, time) : null;
    if (bad) return { error: bad };
  }

  await db.update(matches).set({ scheduledAt: at, venue }).where(eq(matches.id, matchId));
  if (m.tournamentId && meta?.bracket) {
    const bracket = meta.bracket.map((f) => (f.no === fixtureNo ? { ...f, date, time, venue, tz: tzOffset } : f));
    await db.update(tournaments).set({ meta: { ...meta, bracket } as unknown as Record<string, unknown> }).where(eq(tournaments.id, m.tournamentId));
  }
  await audit(admin.id, 'reschedule', 'match', matchId, { date, time, venue });
  if (m.tournamentId) { revalidatePath(`/tournaments/${m.tournamentId}`); revalidatePath(`/tournaments/${m.tournamentId}/matches/${matchId}`); }
  revalidatePath('/matches');
  return {};
}

/** Admin only. Changes when and where a fixture that is not a match yet (a knockout waiting on results) will be played. */
export async function updatePendingFixture(raw: unknown): Promise<{ error?: string }> {
  const admin = await requireRole('admin');
  const p = z.object({ tournamentId: z.string().uuid(), no: z.number().int().min(1) }).and(when).safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? 'Check the form.' };
  const { tournamentId, no, date, time, tzOffset } = p.data;
  const venue = p.data.venue?.trim() || null;
  if (!validDate(date)) return { error: 'Choose a real date.' };

  const db = getDb();
  const [t] = await db.select({ meta: tournaments.meta }).from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
  const meta = t?.meta as unknown as TournamentMeta | undefined;
  const entry = meta?.bracket?.find((f) => f.no === no);
  if (!meta || !entry) return { error: 'Fixture not found.' };
  if (entry.matchId) return { error: 'This fixture is a match now. Edit the match itself.' };
  const bad = orderError(meta.bracket!, no, date, time);
  if (bad) return { error: bad };

  const bracket = meta.bracket!.map((f) => (f.no === no ? { ...f, date, time, venue, tz: tzOffset } : f));
  await db.update(tournaments).set({ meta: { ...meta, bracket } as unknown as Record<string, unknown> }).where(eq(tournaments.id, tournamentId));
  await audit(admin.id, 'reschedule_fixture', 'tournament', tournamentId, { no, date, time, venue });
  revalidatePath(`/tournaments/${tournamentId}`);
  return {};
}
