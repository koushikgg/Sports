import { matchHref } from '@/lib/match-href';
import { notFound, redirect } from 'next/navigation';
import '@sports/sports-engine/src/all';
import { getMatchCard, getSnapshot } from '@sports/scoring';
import { canScoreMatch } from '@sports/shared';
import { CricketScorer } from '@/components/cricket/scorer';
import { ScorerDebug } from '@/components/scorer-debug';
import { PageHeader } from '@/components/ui';
import { getShellUser } from '@/lib/shell-user';

export const dynamic = 'force-dynamic';

export default async function ScorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await getShellUser();
  const [snapshot, card] = await Promise.all([getSnapshot(id), getMatchCard(id, true)]);
  if (!snapshot || !card) notFound();

  // Role is enforced by the middleware; this adds the per-match rule (assigned scorer, finished matches).
  if (!canScoreMatch(user, card)) redirect(matchHref(card));

  if (snapshot.sportKey === 'cricket') return <CricketScorer initial={snapshot} venue={card.venue} />;
  return (
    <div className="mx-auto max-w-xl p-6">
      <PageHeader title="Scorer console" />
      <ScorerDebug initial={snapshot} />
    </div>
  );
}
