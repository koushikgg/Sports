'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ClientEvents, ServerEvents } from '@sports/shared';
import { getViewerSocket } from './socket';

/** Refetch the server-rendered page whenever any match starts or finishes. */
export function useLiveRefresh() {
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
}
