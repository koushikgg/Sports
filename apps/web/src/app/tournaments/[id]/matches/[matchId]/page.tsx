import type { Metadata } from 'next';
import { MatchPageView, matchMetadata } from '@/components/match/match-page';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string; matchId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return matchMetadata((await params).matchId);
}

export default async function TournamentMatchPage({ params }: Props) {
  const { id, matchId } = await params;
  return <MatchPageView id={matchId} where={{ tournament: id }} />;
}
