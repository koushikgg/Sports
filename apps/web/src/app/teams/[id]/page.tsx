import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { asc, eq, getDb, players, sports, teamManagers, teamMembers, teams, users } from '@sports/db';
import { RatchShell } from '@/components/ratch/shell';
import { TeamManage } from '@/components/teams/team-manage';
import { canManageTeam } from '@/lib/team-access';
import { getShellUser } from '@/lib/shell-user';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Team', robots: { index: false } };

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await getShellUser();
  const db = getDb();
  const [row] = /^[0-9a-f-]{36}$/i.test(id)
    ? await db.select({ id: teams.id, name: teams.name, shortName: teams.shortName, sport: sports.name }).from(teams).innerJoin(sports, eq(sports.id, teams.sportId)).where(eq(teams.id, id)).limit(1)
    : [];
  if (!row) notFound();

  const [canManage, roster, managers] = await Promise.all([
    canManageTeam(user, id),
    db
      .select({ id: players.id, name: players.name, userId: players.userId, email: users.email, playerEmail: players.email, isCaptain: teamMembers.isCaptain })
      .from(teamMembers)
      .innerJoin(players, eq(players.id, teamMembers.playerId))
      .leftJoin(users, eq(users.id, players.userId))
      .where(eq(teamMembers.teamId, id))
      .orderBy(asc(players.name)),
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(teamManagers)
      .innerJoin(users, eq(users.id, teamManagers.userId))
      .where(eq(teamManagers.teamId, id))
      .orderBy(asc(users.name)),
  ]);

  return (
    <RatchShell active="teams" user={user}>
      <TeamManage
        team={row}
        roster={roster.map((r) => ({ id: r.id, name: r.name, userId: r.userId, isCaptain: r.isCaptain, email: r.email ?? r.playerEmail }))}
        managers={managers}
        canManage={canManage}
        isAdmin={user?.role === 'admin'}
      />
    </RatchShell>
  );
}
