import { eq, getDb, users } from '@sports/db';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

/** Serves a person's photo to signed-in members. The `v` query changes whenever the photo does, so it caches for good. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await auth())?.user) return new Response(null, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const [row] = await getDb().select({ url: users.avatarUrl }).from(users).where(eq(users.id, id)).limit(1);
  const m = /^data:(image\/jpeg);base64,(.+)$/.exec(row?.url ?? '');
  if (!m) return new Response(null, { status: 404 });
  return new Response(Buffer.from(m[2]!, 'base64'), {
    headers: { 'Content-Type': m[1]!, 'Cache-Control': 'private, max-age=31536000, immutable' },
  });
}
