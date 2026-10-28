'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  ClientEvents,
  ServerEvents,
  type Ack,
  type MatchSnapshot,
  type MatchUpdate,
} from '@sports/shared';
import { getScorerSocket, getViewerSocket } from './socket';

/**
 * Keeps a MatchSnapshot in sync over the socket. Updates must arrive in `seq` order;
 * on any gap or reconnect we rejoin, which returns a fresh snapshot.
 */
export function useLiveMatch(initial: MatchSnapshot, socketFactory?: () => Promise<Socket> | Socket) {
  const [snapshot, setSnapshot] = useState(initial);
  const [connected, setConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const seq = useRef(initial.seq);
  const matchId = initial.matchId;

  const apply = useCallback((s: MatchSnapshot) => {
    if (s.seq < seq.current) return;
    seq.current = s.seq;
    setSnapshot(s);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let active: Socket | null = null;

    const join = () => {
      active?.emit(ClientEvents.joinMatch, { matchId }, (res: Ack<{ snapshot: MatchSnapshot }>) => {
        if (res.ok) apply(res.snapshot);
      });
    };
    const onConnect = () => {
      setConnected(true);
      join();
    };
    const onDisconnect = () => setConnected(false);
    const onUpdate = (u: MatchUpdate) => {
      if (u.matchId !== matchId) return;
      if (u.seq === seq.current + 1) apply(u);
      else if (u.seq > seq.current + 1) join(); // missed something — resync
    };

    void Promise.resolve((socketFactory ?? getViewerSocket)()).then((s) => {
      if (cancelled) return;
      active = s;
      setSocket(s);
      s.on('connect', onConnect);
      s.on('disconnect', onDisconnect);
      s.on(ServerEvents.matchUpdate, onUpdate);
      if (s.connected) onConnect();
    });

    return () => {
      cancelled = true;
      if (!active) return;
      active.emit(ClientEvents.leaveMatch, { matchId });
      active.off('connect', onConnect);
      active.off('disconnect', onDisconnect);
      active.off(ServerEvents.matchUpdate, onUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, apply]);

  return { snapshot, connected, socket, apply, seqRef: seq };
}

/**
 * Live match for scorers: same sync plus a `send` that carries the expected seq.
 *
 * Sends are queued and go out one at a time, in the order they were tapped. Dropping a tap
 * while a ball is saving would silently lose a delivery, which is worse than a duplicate the
 * scorer can see and undo.
 */
export function useScorer(initial: MatchSnapshot) {
  const live = useLiveMatch(initial, getScorerSocket);
  const { socket, apply, seqRef } = live;
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  const send = useCallback(
    (type: string, payload: Record<string, unknown> = {}) => {
      if (!socket) return Promise.resolve(false);
      setPending((n) => n + 1);

      const emit = () =>
        new Promise<boolean>((resolve) => {
          setError(null);
          // The server emits the update before the ack, so seqRef is already current here.
          socket.emit(
            ClientEvents.scoreEvent,
            { matchId: initial.matchId, type, payload, expectedSeq: seqRef.current },
            (res: Ack<{ seq: number }>) => {
              if (!res.ok) {
                setError(res.message);
                if (res.snapshot) apply(res.snapshot); // out of date: adopt the server's view
              }
              resolve(res.ok);
            },
          );
        });

      const next = chain.current.then(emit, emit);
      chain.current = next;
      return next.finally(() => setPending((n) => n - 1));
    },
    [socket, initial.matchId, apply, seqRef],
  );

  const release = useCallback(
    () => socket?.emit(ClientEvents.releaseMatch, { matchId: initial.matchId }),
    [socket, initial.matchId],
  );

  return { ...live, send, release, error, busy: pending > 0 };
}
