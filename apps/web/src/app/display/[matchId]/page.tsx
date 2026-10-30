import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '@sports/sports-engine/src/all';
import { getSnapshot } from '@sports/scoring';
import { TvBoard } from '@/components/tv-board';
import { getMatchCard } from '@/lib/queries';
import { PrivateNotice } from '@/components/ratch/private-notice';
import { viewerOf } from '@/lib/viewer';
import { getShellUser } from '@/lib/shell-user';
import { matchAccess } from '@sports/scoring';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'TV display', robots: { index: false } };

export default async function DisplayPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const { user } = await getShellUser();
  const [m, snapshot] = await Promise.all([getMatchCard(matchId, viewerOf(user)), getSnapshot(matchId)]);
  if (!m || !snapshot) {
    const why = await matchAccess(matchId, viewerOf(user));
    if (why === 'private-tournament' || why === 'members-only') return <PrivateNotice user={user} what="match" why={why} backHref="/matches" backLabel="ALL MATCHES" here={`/display/${matchId}`} />;
    notFound();
  }
  return <TvBoard initial={snapshot} title={`${m.teamA} vs ${m.teamB}`} />;
}
