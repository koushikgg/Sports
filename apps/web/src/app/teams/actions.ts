'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { and, eq, getDb, players, teamManagers, teamMembers, teams, users } from '@sports/db';
import { audit, requireRole } from '@/lib/guard';
import { requireTeamManager } from '@/lib/team-access';

const uuid = z.string().uuid();

const teamSchema = z.object({
  sportId: z.string().uuid(),
  name: z.string().trim().min(1),
  shortName: z.string().trim().max(5).optional(),
});

/** Admin only. */
export async function createTeam(formData: FormData) {
  const user = await requireRole('admin');
  const d = teamSchema.parse(Object.fromEntries(formData));
  const [row] = await getDb()
    .insert(teams)
    .values({ sportId: d.sportId, name: d.name, shortName: d.shortName || null })
    .returning({ id: teams.id });
  await audit(user.id, 'create', 'team', row?.id);
  redirect(`/teams/${row!.id}`);
}

/** Admin only. */
export async function deleteTeam(formData: FormData) {
  const user = await requireRole('admin');
  const id = uuid.parse(formData.get('id'));
  await getDb().delete(teams).where(eq(teams.id, id));
  await audit(user.id, 'delete', 'team', id);
  redirect('/teams');
}
const refresh = (teamId: string) => {
  revalidatePath(`/teams/${teamId}`);
  revalidatePath('/teams');
};

/** Adds someone from the player directory to the roster. */
export async function addPlayerToTeam(formData: FormData) {
  const teamId = uuid.parse(formData.get('teamId'));
  const playerId = uuid.parse(formData.get('playerId'));
  const me = await requireTeamManager(teamId);
  await getDb().insert(teamMembers).values({ teamId, playerId }).onConflictDoNothing();
  await audit(me.id, 'add_member', 'team', teamId, { playerId });
  refresh(teamId);
}

/** Adds a signed-in user to the roster as a player, creating (or linking) their player profile. */
export async function addUserAsPlayer(formData: FormData) {
  const teamId = uuid.parse(formData.get('teamId'));
  const userId = uuid.parse(formData.get('userId'));
  const me = await requireTeamManager(teamId);
  const db = getDb();
  const [u] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw new Error('User not found');

  let [player] = await db.select({ id: players.id }).from(players).where(eq(players.userId, u.id)).limit(1);
  if (!player) {
    // a directory player with the same email is the same person: link instead of duplicating
    const [byEmail] = await db.select({ id: players.id, userId: players.userId }).from(players).where(eq(players.email, u.email)).limit(1);
    if (byEmail && !byEmail.userId) {
      await db.update(players).set({ userId: u.id }).where(eq(players.id, byEmail.id));
      player = { id: byEmail.id };
    } else {
      [player] = await db.insert(players).values({ name: u.name, email: u.email, userId: u.id }).returning({ id: players.id });
    }
  }
  await db.insert(teamMembers).values({ teamId, playerId: player!.id }).onConflictDoNothing();
  await audit(me.id, 'add_user_as_player', 'team', teamId, { userId: u.id, playerId: player!.id });
  refresh(teamId);
}

export async function removeFromTeam(formData: FormData) {
  const teamId = uuid.parse(formData.get('teamId'));
  const playerId = uuid.parse(formData.get('playerId'));
  const me = await requireTeamManager(teamId);
  await getDb().delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.playerId, playerId)));
  await audit(me.id, 'remove_member', 'team', teamId, { playerId });
  refresh(teamId);
}

/** Admin only: the captain (a roster player with an account) can manage the team's people. */
export async function makeCaptain(formData: FormData) {
  const admin = await requireRole('admin');
  const teamId = uuid.parse(formData.get('teamId'));
  const playerId = uuid.parse(formData.get('playerId'));
  const db = getDb();
  await db.update(teamMembers).set({ isCaptain: false }).where(eq(teamMembers.teamId, teamId));
  await db.update(teamMembers).set({ isCaptain: true }).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.playerId, playerId)));
  await audit(admin.id, 'set_captain', 'team', teamId, { playerId });
  refresh(teamId);
}

/** Admin only: a manager can add and remove the team's people without being a player. */
export async function addManager(formData: FormData) {
  const admin = await requireRole('admin');
  const teamId = uuid.parse(formData.get('teamId'));
  const userId = uuid.parse(formData.get('userId'));
  await getDb().insert(teamManagers).values({ teamId, userId }).onConflictDoNothing();
  await audit(admin.id, 'add_team_manager', 'team', teamId, { userId });
  refresh(teamId);
}

export async function removeManager(formData: FormData) {
  const admin = await requireRole('admin');
  const teamId = uuid.parse(formData.get('teamId'));
  const userId = uuid.parse(formData.get('userId'));
  await getDb().delete(teamManagers).where(and(eq(teamManagers.teamId, teamId), eq(teamManagers.userId, userId)));
  await audit(admin.id, 'remove_team_manager', 'team', teamId, { userId });
  refresh(teamId);
}
