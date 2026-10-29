import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PlayerView, ProfileBack } from '@/components/players/player-view';
import { RatchShell } from '@/components/ratch/shell';
import { getPlayerProfile } from '@/lib/player-stats';
import { getShellUser } from '@/lib/shell-user';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Player', robots: { index: false } };

export default async function PlayerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sport?: string }> }) {
  const [{ id }, { sport }] = await Promise.all([params, searchParams]);
  const { user } = await getShellUser();
  const profile = /^[0-9a-f-]{36}$/i.test(id) ? await getPlayerProfile(id) : null;
  if (!profile) notFound();
  return (
    <RatchShell active="players" user={user}>
      <div className="pf" style={{ gap: 24 }}>
        <ProfileBack href="/players" label="BACK TO PLAYERS" />
        <PlayerView profile={profile} sport={sport} basePath={`/players/${id}`} />
      </div>
    </RatchShell>
  );
}
