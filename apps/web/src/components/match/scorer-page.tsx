import { notFound, redirect } from 'next/navigation';
import '@sports/sports-engine/src/all';
import { getMatchCard, getSnapshot, matchAccess } from '@sports/scoring';
import { canScoreMatch } from '@sports/shared';
import { CricketScorer } from '@/components/cricket/scorer';
import { PrivateNotice } from '@/components/ratch/private-notice';
import { ScorerDebug } from '@/components/scorer-debug';
import { PageHeader } from '@/components/ui';
import { matchHref, scoreHref } from '@/lib/match-href';
import { getShellUser } from '@/lib/shell-user';
import { viewerOf } from '@/lib/viewer';

/** The scorer console for a match. `where` is the route it was opened from; a match's console is only at its own route. */
export async function ScorerPageView({ id, where }: { id: string; where: { sport: string } | { tournament: string } }) {
  const { user } = await getShellUser();
  const [snapshot, card] = await Promise.all([getSnapshot(id), getMatchCard(id, viewerOf(user))]);
  if (!snapshot || !card) {
    const why = await matchAccess(id, viewerOf(user));
    if (why === 'private-tournament' || why === 'members-only') {
      return <PrivateNotice user={user} what="match" why={why} backHref="/matches" backLabel="ALL MATCHES" here="/score" />;
    }
    notFound();
  }
  // the right address for this match; anything else is sent on to it
  if ('sport' in where ? card.sportKey !== where.sport || !!card.tournamentId : card.tournamentId !== where.tournament) redirect(scoreHref(card));

  // Role is enforced by the middleware; this adds the per-match rule (managers, assigned scorer, finished matches).
  if (!canScoreMatch(user, card)) redirect(matchHref(card));

  if (snapshot.sportKey === 'cricket') return <CricketScorer initial={snapshot} venue={card.venue} backHref={matchHref(card)} />;
  return (
    <div className="mx-auto max-w-xl p-6">
      <PageHeader title="Scorer console" />
      <ScorerDebug initial={snapshot} />
    </div>
  );
}
