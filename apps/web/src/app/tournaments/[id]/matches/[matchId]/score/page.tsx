import type { Metadata } from 'next';
import { ScorerPageView } from '@/components/match/scorer-page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Score', robots: { index: false } };

export default async function TournamentMatchScorer({ params }: { params: Promise<{ id: string; matchId: string }> }) {
  const { id, matchId } = await params;
  return <ScorerPageView id={matchId} where={{ tournament: id }} />;
}
