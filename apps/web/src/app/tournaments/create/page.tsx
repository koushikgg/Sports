import type { Metadata } from 'next';
import Link from 'next/link';
import '@/components/create/create.css';
import { Wizard } from '@/components/create/wizard';
import { RatchShell } from '@/components/ratch/shell';
import { loadWizardData } from '@/lib/create-data';
import { getShellUser } from '@/lib/shell-user';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New tournament', robots: { index: false } };

export default async function CreateTournamentPage() {
  const { user } = await getShellUser();

  if (user?.role !== 'admin') {
    return (
      <RatchShell active="tournaments" user={user}>
        <div className="cw-denied">
          <h1>Organisers only</h1>
          <p>Creating a tournament needs an admin account.</p>
          <Link href={user ? '/tournaments' : '/login?callbackUrl=/tournaments/create'} className="mx-btn mx-btn-lg" data-variant="amber">{user ? 'BACK TO TOURNAMENTS' : 'SIGN IN'}</Link>
        </div>
      </RatchShell>
    );
  }

  return (
    <RatchShell active="tournaments" user={user}>
      <Wizard
        initialMode="tournament"
        initialTournamentId={null}
        currentUserId={null}
        {...(await loadWizardData())}
      />
    </RatchShell>
  );
}
