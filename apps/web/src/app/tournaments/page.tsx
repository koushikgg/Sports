import type { Metadata } from 'next';
import Link from 'next/link';
import { getTournamentDetail, listTournaments } from '@sports/scoring';
import '@sports/sports-engine/src/all';
import { RatchShell } from '@/components/ratch/shell';
import { TournamentPanel } from '@/components/tournaments/detail';
import { TournamentsBoard } from '@/components/tournaments/board';
import '@/components/tournaments/tournaments.css';
import { getShellUser } from '@/lib/shell-user';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Tournaments', description: 'Standings, fixtures and brackets for every tournament.' };

export default async function TournamentsPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { user } = await getShellUser();
  const { t } = await searchParams;
  const list = await listTournaments(!!user);
  const selectedId = list.find((x) => x.id === t)?.id ?? list.find((x) => x.status === 'live')?.id ?? list[0]?.id ?? null;
  const detail = selectedId ? await getTournamentDetail(selectedId, !!user) : null;

  return (
    <RatchShell active="tournaments" user={user}>
      <div className="mx-head">
        <div>
          <span className="lbl">ALL SPORTS</span>
          <h1>Tournaments</h1>
        </div>
        {user?.role === 'admin' && <Link href="/create" className="mx-btn mx-btn-lg" data-variant="amber">NEW TOURNAMENT</Link>}
      </div>
      <TournamentsBoard list={list} selected={selectedId} />
      {detail && <TournamentPanel key={detail.id} t={detail} isAdmin={user?.role === 'admin'} />}
    </RatchShell>
  );
}
