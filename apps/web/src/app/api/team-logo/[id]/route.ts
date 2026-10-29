import { eq, getDb, teams } from '@sports/db';

export const dynamic = 'force-dynamic';

/** A team's logo. Public like the team's name; the `v` query changes whenever the logo does, so it caches for good. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const [row] = await getDb().select({ url: teams.logoUrl }).from(teams).where(eq(teams.id, id)).limit(1);
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(row?.url ?? '');
  if (!m) return new Response(null, { status: 404 });
  return new Response(Buffer.from(m[2]!, 'base64'), { headers: { 'Content-Type': m[1]!, 'Cache-Control': 'public, max-age=31536000, immutable' } });
}
