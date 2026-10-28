'use client';
import type { MatchSnapshot } from '@sports/shared';
import { Card, StatusBadge } from '@/components/ui';
import type { CricketState } from '@sports/sports-engine/src/cricket';
import { CricketLive } from '@/components/cricket/live';
import { useLiveMatch } from '@/lib/use-live-match';

export function LiveScore({ initial }: { initial: MatchSnapshot }) {
  const { snapshot, connected } = useLiveMatch(initial);
  const live = snapshot.status === 'live';
  const names = Object.fromEntries(snapshot.roster.flatMap((t) => t.players.map((p) => [p.id, p.name])));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm">
        <StatusBadge status={snapshot.status} />
        <span className={connected ? 'text-success' : 'text-muted'}>
          {connected ? '● Live updates on' : '○ Connecting…'}
        </span>
      </div>
      <Card className="space-y-3 py-6">
        {snapshot.summary.sides.map((side) => (
          <div key={side.name} className="flex items-baseline justify-between px-2">
            <span className="text-xl font-semibold">{side.name}</span>
            <span className={`font-mono text-3xl ${live ? 'text-brand' : ''}`}>{side.score}</span>
          </div>
        ))}
        {snapshot.summary.status && (
          <p className="border-t border-border px-2 pt-3 text-sm text-muted">{snapshot.summary.status}</p>
        )}
      </Card>
      {snapshot.sportKey === 'cricket' && <CricketLive state={snapshot.state as CricketState} names={names} />}
    </div>
  );
}
