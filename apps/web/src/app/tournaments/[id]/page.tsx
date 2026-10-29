import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTournamentDetail } from '@sports/scoring';
import '@sports/sports-engine/src/all';
import { ProfileBack } from '@/components/players/player-view';
import { RatchShell } from '@/components/ratch/shell';
import { TournamentPanel } from '@/components/tournaments/detail';
import '@/components/tournaments/tournaments.css';
import { getShellUser } from '@/lib/shell-user';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { user } = await getShellUser();
  const t = /^[0-9a-f-]{36}$/i.test(id) ? await getTournamentDetail(id, !!user) : null;
  return { title: t?.name ?? 'Tournament', description: t ? `Standings, fixtures and results for ${t.name}.` : undefined };
}

export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await getShellUser();
  const t = /^[0-9a-f-]{36}$/i.test(id) ? await getTournamentDetail(id, !!user) : null;
  if (!t) notFound();
  return (
    <RatchShell active="tournaments" user={user}>
      <ProfileBack href="/tournaments" label="ALL TOURNAMENTS" />
      <TournamentPanel t={t} isAdmin={user?.role === 'admin'} />
    </RatchShell>
  );
}
