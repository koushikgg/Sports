import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTournamentDetail } from '@sports/scoring';
import '@/components/create/create.css';
import { Wizard } from '@/components/create/wizard';
import { RatchShell } from '@/components/ratch/shell';
import { loadWizardData } from '@/lib/create-data';
import { getShellUser } from '@/lib/shell-user';
import { viewerOf } from '@/lib/viewer';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New match', robots: { index: false } };

/** A cricket match that belongs to this tournament. Admins only. */
export default async function TournamentCreatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await getShellUser();

  if (user?.role !== 'admin') {
    return (
      <RatchShell active="tournaments" user={user}>
        <div className="cw-denied">
          <h1>Organisers only</h1>
          <p>Creating matches needs an admin account.</p>
          <Link href={user ? `/tournaments/${id}` : `/login?callbackUrl=/tournaments/${id}/create`} className="mx-btn mx-btn-lg" data-variant="amber">{user ? 'BACK TO TOURNAMENT' : 'SIGN IN'}</Link>
        </div>
      </RatchShell>
    );
  }

  const t = /^[0-9a-f-]{36}$/i.test(id) ? await getTournamentDetail(id, viewerOf(user)) : null;
  if (!t) notFound();
  if (t.sportKey !== 'cricket') {
    return (
      <RatchShell active="tournaments" user={user}>
        <div className="cw-denied">
          <h1>Cricket only for now</h1>
          <p>Matches can only be created here for cricket tournaments.</p>
          <Link href={`/tournaments/${id}`} className="mx-btn mx-btn-lg" data-variant="amber">BACK TO TOURNAMENT</Link>
        </div>
      </RatchShell>
    );
  }

  return (
    <RatchShell active="tournaments" user={user}>
      <Wizard initialMode="match" initialTournamentId={id} lockedTournament={{ id, name: t.name }} currentUserId={null} {...(await loadWizardData())} />
    </RatchShell>
  );
}
