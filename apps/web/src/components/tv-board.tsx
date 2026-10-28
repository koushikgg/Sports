'use client';
import '@/styles/ratch-base.css';
import { useEffect } from 'react';
import type { MatchSnapshot } from '@sports/shared';
import type { CricketState } from '@sports/sports-engine/src/cricket';
import { CricketTv } from '@/components/cricket/tv';
import { useLiveMatch } from '@/lib/use-live-match';

export function TvBoard({ initial, title }: { initial: MatchSnapshot; title: string }) {
  const { snapshot, connected } = useLiveMatch(initial);
  const names = Object.fromEntries(snapshot.roster.flatMap((t) => t.players.map((p) => [p.id, p.name])));

  // Keep the TV awake while the board is open (not supported everywhere — ignore failures).
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = () => navigator.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {});
    void request();
    const onVisible = () => document.visibilityState === 'visible' && void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, []);

  return (
    <div className="ratch fixed inset-0 flex cursor-none flex-col p-12 text-fg">
      <header className="mb-8 flex items-center justify-between text-3xl text-muted">
        <span>{title}</span>
        <span className="flex items-center gap-4">
          {snapshot.status === 'live' && <span className="rounded-full bg-live px-5 py-1 text-2xl font-semibold text-white">LIVE</span>}
          <span aria-label={connected ? 'Connected' : 'Reconnecting'} className={`h-4 w-4 rounded-full ${connected ? 'bg-success' : 'bg-muted'}`} />
        </span>
      </header>
      <div className="min-h-0 flex-1">
        {snapshot.sportKey === 'cricket' ? (
          <CricketTv state={snapshot.state as CricketState} names={names} status={snapshot.summary.status} />
        ) : (
          <div className="flex h-full flex-col justify-center gap-10">
            {snapshot.summary.sides.map((s) => (
              <div key={s.name} className="flex items-baseline justify-between text-8xl font-bold">
                <span>{s.name}</span>
                <span className="font-mono tabular-nums text-brand">{s.score}</span>
              </div>
            ))}
            <p className="text-center text-5xl text-brand">{snapshot.summary.status}</p>
          </div>
        )}
      </div>
    </div>
  );
}
