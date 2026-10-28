'use client';
import { canScoreMatch } from '@sports/shared';
import type { ShellUser } from '@/components/ratch/shell';
import { MatchTile } from '@/components/matches/match-tile';
import { useNow } from '@/components/matches/time';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import type { MatchCardData } from '@/lib/queries';

/** Match tiles for the landing page. Live tiles update in place; the list refreshes when a match starts or ends. */
export function TileGrid({ matches, viewer, empty }: { matches: MatchCardData[]; viewer: ShellUser | null; empty: string }) {
  useLiveRefresh();
  const now = useNow();
  if (matches.length === 0) return <p className="sx-empty">{empty}</p>;
  return <div className="mx-grid">{matches.map((m) => <MatchTile key={m.id} m={m} canScore={canScoreMatch(viewer, m)} now={now} />)}</div>;
}
