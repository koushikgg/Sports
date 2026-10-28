'use client';
import { MatchTile } from '@/components/matches/match-tile';
import { useNow } from '@/components/matches/time';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import type { MatchCardData } from '@/lib/queries';

export function ScoreQueue({ matches, assignedOnly }: { matches: MatchCardData[]; assignedOnly: boolean }) {
  useLiveRefresh();
  const now = useNow();
  if (matches.length === 0) {
    return (
      <p className="tn-empty">
        <b>Nothing to score right now</b>
        <span>{assignedOnly ? 'Matches assigned to you, and matches with no scorer assigned, appear here.' : 'Unfinished matches appear here.'}</span>
      </p>
    );
  }
  return <div className="mx-grid">{matches.map((m) => <MatchTile key={m.id} m={m} canScore now={now} />)}</div>;
}
