import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { listTournaments } from '@sports/scoring';
import '@sports/sports-engine/src/all';
import { RatchShell } from '@/components/ratch/shell';
import { TournamentsBoard } from '@/components/tournaments/board';
import '@/components/tournaments/tournaments.css';
import { getShellUser } from '@/lib/shell-user';
import { viewerOf } from '@/lib/viewer';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Tournaments', description: 'Standings, fixtures and brackets for every tournament.' };

export default async function TournamentsPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  // links from before each tournament had its own page
  if (t && /^[0-9a-f-]{36}$/i.test(t)) redirect(`/tournaments/${t}`);
  const { user } = await getShellUser();
  const list = await listTournaments(viewerOf(user));

  return (
    <RatchShell active="tournaments" user={user}>
      <div className="mx-head">
        <div>
          <span className="lbl">ALL SPORTS</span>
          <h1>Tournaments</h1>
        </div>
        {user?.role === 'admin' && <Link href="/create" className="mx-btn mx-btn-lg" data-variant="amber">NEW TOURNAMENT</Link>}
      </div>
      <TournamentsBoard list={list} />
    </RatchShell>
  );
}
