'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { eq, getDb, matches, sports, teams } from '@sports/db';
import { MATCH_STATUSES } from '@sports/shared';
import { audit, requireRole } from '@/lib/guard';

const schema = z.object({
  sportId: z.string().uuid(),
  teamAId: z.string().uuid(),
  teamBId: z.string().uuid(),
  tournamentId: z.string().uuid().optional().or(z.literal('')),
  venue: z.string().trim().optional(),
  scheduledAt: z.string().optional(),
  overs: z.coerce.number().int().min(1).max(50).optional(),
  firstTo: z.coerce.number().int().min(1).max(50).optional(),
});

export async function createMatch(formData: FormData) {
  const user = await requireRole('admin');
  const d = schema.parse(Object.fromEntries(formData));
  if (d.teamAId === d.teamBId) throw new Error('Pick two different teams');

  const db = getDb();
  const [sport] = await db.select().from(sports).where(eq(sports.id, d.sportId)).limit(1);
  const sideTeams = await Promise.all(
    [d.teamAId, d.teamBId].map((id) => db.select().from(teams).where(eq(teams.id, id)).limit(1)),
  );
  if (!sport || sideTeams.some((r) => r[0]?.sportId !== d.sportId)) {
    throw new Error('Teams must belong to the selected sport');
  }

  const config: Record<string, unknown> =
    sport.key === 'cricket'
      ? { overs: d.overs ?? (sport.config.defaultOvers as number) ?? 5, ballsPerOver: 6 }
      : { firstTo: d.firstTo ?? (sport.config.firstTo as number) ?? 10 };

  const [row] = await db
    .insert(matches)
    .values({
      sportId: d.sportId,
      teamAId: d.teamAId,
      teamBId: d.teamBId,
      tournamentId: d.tournamentId || null,
      venue: d.venue || null,
      scheduledAt: d.scheduledAt ? new Date(d.scheduledAt) : null,
      config,
    })
    .returning({ id: matches.id });
  await audit(user.id, 'create', 'match', row?.id);
  redirect(`/admin/matches/${row!.id}`);
}

export async function setMatchStatus(formData: FormData) {
  const user = await requireRole('admin', 'scorer');
  const id = String(formData.get('id'));
  const status = z.enum(MATCH_STATUSES).parse(formData.get('status'));
  await getDb().update(matches).set({ status }).where(eq(matches.id, id));
  await audit(user.id, 'status', 'match', id, { status });
  revalidatePath(`/admin/matches/${id}`);
  revalidatePath('/admin/matches');
}

export async function deleteMatch(formData: FormData) {
  const user = await requireRole('admin');
  const id = String(formData.get('id'));
  await getDb().delete(matches).where(eq(matches.id, id));
  await audit(user.id, 'delete', 'match', id);
  redirect('/admin/matches');
}
