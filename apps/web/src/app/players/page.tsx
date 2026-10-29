import type { Metadata } from 'next';
import { asc, eq, getDb, players, sql, teamMembers, teams, users } from '@sports/db';
import { avatarSrc } from '@/lib/avatar';
import { RatchShell } from '@/components/ratch/shell';
import { PlayersList, type PlayerRow } from '@/components/tournaments/players-list';
import '@/components/tournaments/tournaments.css';
import { getShellUser } from '@/lib/shell-user';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Players', robots: { index: false } };

export default async function PlayersPage() {
  const { user } = await getShellUser();
  const db = getDb();
  const [all, links] = await Promise.all([
    db.select({ id: players.id, name: players.name, role: players.role, userId: players.userId, at: users.avatarUpdatedAt, has: sql<boolean>`${users.avatarUrl} is not null` }).from(players).leftJoin(users, eq(users.id, players.userId)).orderBy(asc(players.name)),
    db.select({ playerId: teamMembers.playerId, team: teams.name }).from(teamMembers).innerJoin(teams, eq(teams.id, teamMembers.teamId)),
  ]);
  const rows: PlayerRow[] = all.map((p) => ({ id: p.id, name: p.name, role: p.role, avatar: p.has ? avatarSrc(p.userId, p.at ?? new Date(0)) : null, teams: links.filter((l) => l.playerId === p.id).map((l) => l.team) }));

  return (
    <RatchShell active="players" user={user}>
      <div className="mx-head">
        <div><span className="lbl">DIRECTORY</span><h1>Players</h1></div>
      </div>
      <PlayersList rows={rows} />
    </RatchShell>
  );
}
