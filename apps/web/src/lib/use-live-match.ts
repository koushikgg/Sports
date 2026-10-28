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

  return { snapshot, connected, socket, apply };
}

/** Live match for scorers: same sync plus a `send` that carries the expected seq. */
export function useScorer(initial: MatchSnapshot) {
  const live = useLiveMatch(initial, getScorerSocket);
  const { socket, snapshot, apply } = live;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const seqRef = useRef(snapshot.seq);
  seqRef.current = snapshot.seq;

  const send = useCallback(
    (type: string, payload: Record<string, unknown> = {}) =>
      new Promise<boolean>((resolve) => {
        if (!socket || busyRef.current) return resolve(false);
        busyRef.current = true;
        setBusy(true);
        setError(null);
        socket.emit(
          ClientEvents.scoreEvent,
          { matchId: initial.matchId, type, payload, expectedSeq: seqRef.current },
          (res: Ack<{ seq: number }>) => {
            busyRef.current = false;
            setBusy(false);
            if (!res.ok) {
              setError(res.message);
              if (res.snapshot) apply(res.snapshot); // out of date: adopt the server's view
            }
            resolve(res.ok);
          },
        );
      }),
    [socket, initial.matchId, apply],
  );

  const release = useCallback(
    () => socket?.emit(ClientEvents.releaseMatch, { matchId: initial.matchId }),
    [socket, initial.matchId],
  );

  return { ...live, send, release, error, busy };
}
