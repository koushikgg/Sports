import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq, getDb, teams } from '@sports/db';
import { RatchShell } from '@/components/ratch/shell';
import { Button } from '@/components/ui';
import { TeamPeople } from '@/components/teams/team-people';
import '@/components/tournaments/tournaments.css';
import { deleteTeam } from '../actions';
import { canManageTeam } from '@/lib/team-access';
import { getShellUser } from '@/lib/shell-user';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Team', robots: { index: false } };

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await getShellUser();
  const [team] = /^[0-9a-f-]{36}$/i.test(id) ? await getDb().select().from(teams).where(eq(teams.id, id)).limit(1) : [];
  if (!team) notFound();
  const canManage = await canManageTeam(user, id);

  return (
    <RatchShell active="teams" user={user}>
      <div className="mx-head">
        <div><span className="lbl">TEAM</span><h1>{team.name}</h1></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {user?.role === 'admin' && (
            <form action={deleteTeam}>
              <input type="hidden" name="id" value={id} />
              <Button variant="danger">Delete team</Button>
            </form>
          )}
          <Link href="/teams" className="mx-btn mx-btn-lg" data-variant="gray">BACK TO TEAMS</Link>
        </div>
      </div>
      <TeamPeople teamId={id} canManage={canManage} isAdmin={user?.role === 'admin'} />
    </RatchShell>
  );
}
