import type { Metadata } from 'next';
import '@sports/sports-engine/src/all';
import { canScoreMatch } from '@sports/shared';
import { statusGroup } from '@/components/matches/model';
import { RatchShell } from '@/components/ratch/shell';
import { ScoreQueue } from '@/components/tournaments/score-queue';
import '@/components/tournaments/tournaments.css';
import { listMatchCards } from '@/lib/queries';
import { getShellUser } from '@/lib/shell-user';
import { viewerOf } from '@/lib/viewer';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Score', robots: { index: false } };

export default async function ScoreIndex() {
  const { user } = await getShellUser();
  const all = await listMatchCards({ statuses: ['scheduled', 'live', 'paused'], viewer: viewerOf(user), limit: 200 });
  const mine = all
    .filter((m) => canScoreMatch(user, m))
    .sort((a, b) => Number(statusGroup(b.status) === 'live') - Number(statusGroup(a.status) === 'live') || (a.scheduledAt ?? '9999').localeCompare(b.scheduledAt ?? '9999'));

  return (
    <RatchShell active="score" user={user}>
      <div className="mx-head">
        <div><span className="lbl">SCORER</span><h1>Matches to score</h1></div>
      </div>
      <ScoreQueue matches={mine} assignedOnly={user?.role === 'scorer'} />
    </RatchShell>
  );
}
