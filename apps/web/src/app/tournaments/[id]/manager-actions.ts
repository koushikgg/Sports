'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq, getDb, tournamentManagers, tournaments, users } from '@sports/db';
import { audit, requireRole } from '@/lib/guard';

const ids = z.object({ tournamentId: z.string().uuid(), userId: z.string().uuid() });

/** Admin only. A manager can score the tournament's matches and edit their time and venue. */
export async function addTournamentManager(raw: unknown): Promise<{ error?: string; manager?: { id: string; name: string } }> {
  const admin = await requireRole('admin');
  const p = ids.safeParse(raw);
  if (!p.success) return { error: 'Choose a person from the search results.' };
  const db = getDb();
  const [[t], [u]] = await Promise.all([
    db.select({ id: tournaments.id }).from(tournaments).where(eq(tournaments.id, p.data.tournamentId)).limit(1),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, p.data.userId)).limit(1),
  ]);
  if (!t) return { error: 'Tournament not found.' };
  if (!u) return { error: 'That person no longer has an account.' };
  await db.insert(tournamentManagers).values({ tournamentId: t.id, userId: u.id }).onConflictDoNothing();
  await audit(admin.id, 'add_tournament_manager', 'tournament', t.id, { userId: u.id });
  revalidatePath(`/tournaments/${t.id}`);
  return { manager: u };
}

/** Admin only. */
export async function removeTournamentManager(raw: unknown): Promise<{ error?: string }> {
  const admin = await requireRole('admin');
  const p = ids.safeParse(raw);
  if (!p.success) return { error: 'Unknown manager.' };
  await getDb().delete(tournamentManagers).where(and(eq(tournamentManagers.tournamentId, p.data.tournamentId), eq(tournamentManagers.userId, p.data.userId)));
  await audit(admin.id, 'remove_tournament_manager', 'tournament', p.data.tournamentId, { userId: p.data.userId });
  revalidatePath(`/tournaments/${p.data.tournamentId}`);
  return {};
}
