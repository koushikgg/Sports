import { notFound, redirect } from 'next/navigation';
import { getMatchCard, getSnapshot, matchAccess } from '@sports/scoring';
import { TvBoard } from '@/components/tv-board';
import { PrivateNotice } from '@/components/ratch/private-notice';
import { displayHref } from '@/lib/match-href';
import { getShellUser } from '@/lib/shell-user';
import { viewerOf } from '@/lib/viewer';

/** TV mode for a match, from its own route. A private match needs a signed-in admin or tournament manager. */
export async function TvPageView({ id, where }: { id: string; where: { sport: string } | { tournament: string } }) {
  const { user } = await getShellUser();
  const [m, snapshot] = await Promise.all([getMatchCard(id, viewerOf(user)), getSnapshot(id)]);
  if (!m || !snapshot) {
    const why = await matchAccess(id, viewerOf(user));
    if (why === 'private-tournament' || why === 'members-only') {
      return <PrivateNotice user={user} what="match" why={why} backHref="/matches" backLabel="ALL MATCHES" here={`/display/${id}`} />;
    }
    notFound();
  }
  if ('sport' in where ? m.sportKey !== where.sport || !!m.tournamentId : m.tournamentId !== where.tournament) redirect(displayHref(m));
  return <TvBoard initial={snapshot} title={`${m.teamA} vs ${m.teamB}`} />;
}
