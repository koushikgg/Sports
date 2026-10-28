'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { and, eq, getDb, teamMembers, teams } from '@sports/db';
import { audit, requireRole } from '@/lib/guard';

const teamSchema = z.object({
  sportId: z.string().uuid(),
  name: z.string().trim().min(1),
  shortName: z.string().trim().max(5).optional(),
});

export async function createTeam(formData: FormData) {
  const user = await requireRole('admin');
  const d = teamSchema.parse(Object.fromEntries(formData));
  const [row] = await getDb()
    .insert(teams)
    .values({ sportId: d.sportId, name: d.name, shortName: d.shortName || null })
    .returning({ id: teams.id });
  await audit(user.id, 'create', 'team', row?.id);
  redirect(`/admin/teams/${row!.id}`);
}

export async function deleteTeam(formData: FormData) {
  const user = await requireRole('admin');
  const id = String(formData.get('id'));
  await getDb().delete(teams).where(eq(teams.id, id));
  await audit(user.id, 'delete', 'team', id);
  redirect('/admin/teams');
}

export async function addMember(formData: FormData) {
  const user = await requireRole('admin');
  const teamId = String(formData.get('teamId'));
  const playerId = String(formData.get('playerId'));
  await getDb().insert(teamMembers).values({ teamId, playerId }).onConflictDoNothing();
  await audit(user.id, 'add_member', 'team', teamId, { playerId });
  revalidatePath(`/admin/teams/${teamId}`);
}

export async function removeMember(formData: FormData) {
  const user = await requireRole('admin');
  const teamId = String(formData.get('teamId'));
  const playerId = String(formData.get('playerId'));
  await getDb().delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.playerId, playerId)));
  await audit(user.id, 'remove_member', 'team', teamId, { playerId });
  revalidatePath(`/admin/teams/${teamId}`);
}

export async function setCaptain(formData: FormData) {
  const user = await requireRole('admin');
  const teamId = String(formData.get('teamId'));
  const playerId = String(formData.get('playerId'));
  const db = getDb();
  await db.update(teamMembers).set({ isCaptain: false }).where(eq(teamMembers.teamId, teamId));
  await db
    .update(teamMembers)
    .set({ isCaptain: true })
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.playerId, playerId)));
  await audit(user.id, 'set_captain', 'team', teamId, { playerId });
  revalidatePath(`/admin/teams/${teamId}`);
}
