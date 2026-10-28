import { notFound } from 'next/navigation';
import '@sports/sports-engine/src/all';
import { getMatchCard, getSnapshot } from '@sports/scoring';
import { PageHeader } from '@/components/ui';
import { CricketScorer } from '@/components/cricket/scorer';
import { ScorerDebug } from '@/components/scorer-debug';
import { requireRole } from '@/lib/guard';

export const dynamic = 'force-dynamic';

export default async function ScorePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole('admin', 'scorer');
  const { id } = await params;
  const [snapshot, card] = await Promise.all([getSnapshot(id), getMatchCard(id)]);
  if (!snapshot) notFound();

  if (snapshot.sportKey === 'cricket') {
    return <CricketScorer initial={snapshot} venue={card?.venue} />;
  }
  return (
    <div className="max-w-xl">
      <PageHeader title="Scorer console" />
      <ScorerDebug initial={snapshot} />
    </div>
  );
}
