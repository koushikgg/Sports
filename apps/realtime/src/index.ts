import { createServer } from 'node:http';
import { jwtVerify } from 'jose';
import { Server } from 'socket.io';
import {
  ClientEvents,
  joinMatchSchema,
  rooms,
  scoreEventSchema,
  ServerEvents,
  type Ack,
  type SocketTokenClaims,
} from '@sports/shared';
import { getSnapshot, releaseMatch, submitScoreEvent } from '@sports/scoring';
import '@sports/sports-engine/src/all';

const port = Number(process.env.REALTIME_PORT ?? 4000);
const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
const secret = new TextEncoder().encode(process.env.AUTH_SECRET ?? '');

const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404).end();
});

const io = new Server(http, { cors: { origin, credentials: true } });

// Viewers connect anonymously; a token (issued by the web app) upgrades the socket to scorer/admin.
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) return next();
  try {
    const { payload } = await jwtVerify(token, secret);
    socket.data.user = payload as unknown as SocketTokenClaims;
    next();
  } catch {
    next(new Error('invalid token'));
  }
});

io.on('connection', (socket) => {
  const user = socket.data.user as SocketTokenClaims | undefined;
  type AckFn = (res: Ack<any>) => void;
  const reply = (cb: unknown, res: Ack<any>) => typeof cb === 'function' && (cb as AckFn)(res);

  // Join a match room and get the current snapshot back (also used to resync after a gap).
  socket.on(ClientEvents.joinMatch, async (raw, cb) => {
    const parsed = joinMatchSchema.safeParse(raw);
    if (!parsed.success) return reply(cb, { ok: false, code: 'invalid', message: 'bad matchId' });
    try {
      const snapshot = await getSnapshot(parsed.data.matchId);
      if (!snapshot) return reply(cb, { ok: false, code: 'not_found', message: 'Match not found' });
      await socket.join(rooms.match(parsed.data.matchId));
      reply(cb, { ok: true, snapshot });
    } catch (err) {
      console.error('join failed', err);
      reply(cb, { ok: false, code: 'error', message: 'Could not load match' });
    }
  });

  socket.on(ClientEvents.leaveMatch, (raw) => {
    const parsed = joinMatchSchema.safeParse(raw);
    if (parsed.success) void socket.leave(rooms.match(parsed.data.matchId));
  });

  socket.on(ClientEvents.joinSport, (key: unknown) => {
    if (typeof key === 'string') void socket.join(rooms.sport(key));
  });

  // Landing-page feed: told whenever any match goes live or finishes.
  socket.on(ClientEvents.joinLive, () => void socket.join(rooms.live));

  socket.on(ClientEvents.scoreEvent, async (raw, cb) => {
    if (!user) return reply(cb, { ok: false, code: 'forbidden', message: 'Sign in to score' });
    const parsed = scoreEventSchema.safeParse(raw);
    if (!parsed.success) return reply(cb, { ok: false, code: 'invalid', message: 'bad event' });

    try {
      const res = await submitScoreEvent(user, parsed.data);
      if (!res.ok) return reply(cb, res);
      io.to(rooms.match(res.update.matchId)).emit(ServerEvents.matchUpdate, res.update);
      if (res.statusChanged) io.to(rooms.live).emit(ServerEvents.liveChanged, { matchId: res.update.matchId });
      reply(cb, { ok: true, seq: res.update.seq });
    } catch (err) {
      console.error('score failed', err);
      reply(cb, { ok: false, code: 'error', message: 'Could not save event' });
    }
  });

  socket.on(ClientEvents.releaseMatch, async (raw, cb) => {
    const parsed = joinMatchSchema.safeParse(raw);
    if (!user || !parsed.success) return reply(cb, { ok: false, code: 'forbidden', message: 'Not allowed' });
    const done = await releaseMatch(user, parsed.data.matchId);
    reply(cb, done ? { ok: true } : { ok: false, code: 'forbidden', message: 'Not your match' });
  });
});

http.listen(port, () => console.log(`realtime listening on :${port}`));
