'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ClientEvents, ServerEvents } from '@sports/shared';
import { MatchCard } from '@/components/match-card';
import { getViewerSocket } from '@/lib/socket';
import type { MatchCardData } from '@/lib/queries';

/**
 * Horizontal snap carousel of live matches. Scores update per card; when any match
 * starts or finishes the server tells us and we refetch the list.
 */
export function LiveNow({ matches }: { matches: MatchCardData[] }) {
  const router = useRouter();

  useEffect(() => {
    const socket = getViewerSocket();
    const join = () => socket.emit(ClientEvents.joinLive);
    const refresh = () => router.refresh();
    socket.on('connect', join);
    socket.on(ServerEvents.liveChanged, refresh);
    if (socket.connected) join();
    return () => {
      socket.off('connect', join);
      socket.off(ServerEvents.liveChanged, refresh);
    };
  }, [router]);

  if (matches.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">
        No matches are live right now. Check the fixtures below.
      </p>
    );
  }

  return (
    <div
      role="region"
      aria-label="Live matches"
      tabIndex={0}
      className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 focus-visible:outline-2 focus-visible:outline-brand motion-safe:scroll-smooth"
    >
      {matches.map((m) => (
        <div key={m.id} className="w-[85%] shrink-0 snap-start sm:w-80">
          <MatchCard m={m} />
        </div>
      ))}
    </div>
  );
}
