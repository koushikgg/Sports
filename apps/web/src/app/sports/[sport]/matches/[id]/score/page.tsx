import type { Metadata } from 'next';
import { ScorerPageView } from '@/components/match/scorer-page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Score', robots: { index: false } };

export default async function SportMatchScorer({ params }: { params: Promise<{ sport: string; id: string }> }) {
  const { sport, id } = await params;
  return <ScorerPageView id={id} where={{ sport }} />;
}
