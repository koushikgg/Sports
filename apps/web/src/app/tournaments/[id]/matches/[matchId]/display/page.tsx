import type { Metadata } from 'next';
import { TvPageView } from '@/components/match/tv-page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'TV display', robots: { index: false } };

export default async function TournamentMatchTv({ params }: { params: Promise<{ id: string; matchId: string }> }) {
  const { id, matchId } = await params;
  return <TvPageView id={matchId} where={{ tournament: id }} />;
}
