'use client';
import Link from 'next/link';
import type { MatchSnapshot, ScoreSummary } from '@sports/shared';
import { Card, StatusBadge } from '@/components/ui';
import { LocalTime } from '@/components/local-time';
import { useLiveMatch } from '@/lib/use-live-match';
import { cn } from '@/lib/utils';
import type { MatchCardData } from '@/lib/queries';

function CardView({ m, summary, status, live }: { m: MatchCardData; summary: ScoreSummary; status: string; live: boolean }) {
  const started = summary.sides.some((s) => s.score !== '—');
  return (
    <Link
      href={`/sports/${m.sportKey}/matches/${m.id}`}
      className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <Card className={cn('h-full transition hover:border-brand/60', live && 'border-live/40')}>
        <div className="mb-3 flex items-center justify-between text-xs text-muted">
          <span>{m.sportName}</span>
          <StatusBadge status={status} />
        </div>
        <div className="space-y-1.5">
          {[m.teamA, m.teamB].map((team) => {
            const side = summary.sides.find((s) => s.name === team);
            return (
              <div key={team} className="flex items-baseline justify-between gap-3">
                <span className="truncate font-medium">{team}</span>
                {started && <span className="shrink-0 font-mono text-sm tabular-nums">{side?.score ?? '—'}</span>}
              </div>
            );
          })}
        </div>
        {summary.status && started && <p className="mt-3 text-xs text-brand">{summary.status}</p>}
        <p className="mt-3 text-xs text-muted">
          <LocalTime iso={m.scheduledAt} />
          {m.venue && ` · ${m.venue}`}
        </p>
      </Card>
    </Link>
  );
}

/** A card that keeps its own score fresh over the socket. */
function LiveCard({ m }: { m: MatchCardData }) {
  const initial: MatchSnapshot = {
    matchId: m.id,
    sportKey: m.sportKey,
    roster: [],
    seq: m.seq,
    status: m.status,
    state: null,
    summary: m.summary,
  };
  const { snapshot } = useLiveMatch(initial);
  return <CardView m={m} summary={snapshot.summary} status={snapshot.status} live={snapshot.status === 'live'} />;
}

export function MatchCard({ m }: { m: MatchCardData }) {
  return m.status === 'live' || m.status === 'paused' ? (
    <LiveCard m={m} />
  ) : (
    <CardView m={m} summary={m.summary} status={m.status} live={false} />
  );
}
