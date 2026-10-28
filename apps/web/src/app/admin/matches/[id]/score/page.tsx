import { notFound } from 'next/navigation';
import '@sports/sports-engine/src/all';
import { getSnapshot } from '@sports/scoring';
import { PageHeader } from '@/components/ui';
import { CricketScorer } from '@/components/cricket/scorer';
import { ScorerDebug } from '@/components/scorer-debug';
import { requireRole } from '@/lib/guard';

export const dynamic = 'force-dynamic';

export default async function ScorePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole('admin', 'scorer');
  const { id } = await params;
  const snapshot = await getSnapshot(id);
  if (!snapshot) notFound();
  return (
    <div className="max-w-xl">
      {snapshot.sportKey === 'cricket' ? (
        <CricketScorer initial={snapshot} />
      ) : (
        <>
          <PageHeader title="Scorer console" />
          <ScorerDebug initial={snapshot} />
        </>
      )}
    </div>
  );
}
