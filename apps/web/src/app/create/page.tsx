import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import '@/components/create/create.css';
import { Wizard } from '@/components/create/wizard';
import { RatchShell } from '@/components/ratch/shell';
import { loadWizardData } from '@/lib/create-data';
import { getShellUser } from '@/lib/shell-user';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Create', robots: { index: false } };

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ mode?: string; tournament?: string }> }) {
  const { user } = await getShellUser();
  const { mode, tournament } = await searchParams;
  // a match for one tournament now lives under that tournament
  if (mode === 'match' && tournament && /^[0-9a-f-]{36}$/i.test(tournament)) redirect(`/tournaments/${tournament}/create`);

  if (user?.role !== 'admin') {
    return (
      <RatchShell active={null} user={user}>
        <div className="cw-denied">
          <h1>Organisers only</h1>
          <p>Creating tournaments and matches needs an admin account.</p>
          <Link href={user ? '/' : '/login?callbackUrl=/create'} className="mx-btn mx-btn-lg" data-variant="amber">{user ? 'BACK TO MATCHES' : 'SIGN IN'}</Link>
        </div>
      </RatchShell>
    );
  }

  return (
    <RatchShell active={null} user={user}>
      <Wizard
        initialMode="tournament"
        initialTournamentId={null}
        currentUserId={null}
        {...(await loadWizardData())}
      />
    </RatchShell>
  );
}
