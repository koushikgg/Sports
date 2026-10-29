import { and, eq, getDb, players, teamManagers, teamMembers } from '@sports/db';
import { auth } from '@/auth';

/** Admins, a team's managers, and the team's captain (the captain player linked to their account) may manage its people. */
export async function canManageTeam(user: { id: string; role: string } | null | undefined, teamId: string): Promise<boolean> {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const db = getDb();
  const [[manager], [captain]] = await Promise.all([
    db.select({ u: teamManagers.userId }).from(teamManagers).where(and(eq(teamManagers.teamId, teamId), eq(teamManagers.userId, user.id))).limit(1),
    db
      .select({ p: players.id })
      .from(teamMembers)
      .innerJoin(players, eq(players.id, teamMembers.playerId))
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.isCaptain, true), eq(players.userId, user.id)))
      .limit(1),
  ]);
  return !!manager || !!captain;
}

/** Server-action guard for team people changes. */
export async function requireTeamManager(teamId: string) {
  const session = await auth();
  if (!session?.user || !(await canManageTeam(session.user, teamId))) throw new Error('Forbidden');
  return session.user;
}
