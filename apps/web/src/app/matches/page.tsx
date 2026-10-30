import type { Metadata } from 'next';
import '@sports/sports-engine/src/all';
import { getSnapshot } from '@sports/scoring';
import { MatchesBoard } from '@/components/matches/board';
import '@/components/matches/matches.css';
import { RatchShell } from '@/components/ratch/shell';
import { getEnabledSports, listMatchCards } from '@/lib/queries';
import { getShellUser } from '@/lib/shell-user';
import { viewerOf } from '@/lib/viewer';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Matches', description: 'Live scores, fixtures and results for every sport.' };

export default async function MatchesPage() {
  const [{ user }, sports] = await Promise.all([getShellUser(), getEnabledSports()]);
  const matches = await listMatchCards({ limit: 200, viewer: viewerOf(user) });

  // Feature the live cricket match with the most activity.
  const live = matches.filter((m) => m.sportKey === 'cricket' && m.status === 'live').sort((a, b) => b.seq - a.seq)[0];
  const featured = live ? await getSnapshot(live.id) : null;

  return (
    <RatchShell active="matches" user={user}>
      <MatchesBoard
        matches={matches}
        sports={sports.map((s) => ({ key: s.key, name: s.name }))}
        featured={featured}
        featuredCompetition={live?.competition ?? null}
        viewer={user}
      />
    </RatchShell>
  );
}
