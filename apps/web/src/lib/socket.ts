'use client';
import { io, type Socket } from 'socket.io-client';

const url = process.env.NEXT_PUBLIC_REALTIME_URL ?? 'http://localhost:4000';

let viewer: Socket | null = null;
let scorer: Promise<Socket> | null = null;

/**
 * Read-only socket shared by every live component on the page. Signed-in people connect with a token so the live-score
 * server knows who they are (a manager may watch a private tournament); everyone else connects anonymously.
 */
export function getViewerSocket(): Socket {
  return (viewer ??= io(url, {
    autoConnect: true,
    auth: (cb) => {
      void fetch('/api/realtime-token')
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { token?: string } | null) => cb(j?.token ? { token: j.token } : {}))
        .catch(() => cb({}));
    },
  }));
}

/** Authenticated socket for scorers. Fetches a short-lived token from the web app first. */
export function getScorerSocket(): Promise<Socket> {
  return (scorer ??= (async () => {
    const res = await fetch('/api/realtime-token');
    if (!res.ok) throw new Error('Not signed in');
    const { token } = (await res.json()) as { token: string };
    // The token only authenticates the handshake; refresh it on every reconnect attempt.
    const socket = io(url, {
      auth: (cb) => {
        void fetch('/api/realtime-token')
          .then((r) => r.json())
          .then((j: { token: string }) => cb({ token: j.token }))
          .catch(() => cb({ token }));
      },
    });
    return socket;
  })().catch((err) => {
    scorer = null;
    throw err;
  }));
}
