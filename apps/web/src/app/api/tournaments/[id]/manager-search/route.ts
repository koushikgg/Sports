import { NextResponse } from 'next/server';
import { and, asc, eq, getDb, sql, tournamentManagers, users } from '@sports/db';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

/** Finds accounts an admin can make managers of a tournament. Admins only; people already managing it are left out. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 60);
  const user = (await auth())?.user;
  if (user?.role !== 'admin' || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ hits: [] }, { status: 403 });
  if (q.length < 2) return NextResponse.json({ hits: [] });
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const have = getDb().select({ u: tournamentManagers.userId }).from(tournamentManagers).where(eq(tournamentManagers.tournamentId, id));
  const rows = await getDb()
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(sql`(${users.name} ilike ${like} or ${users.email} ilike ${like})`, sql`${users.id} not in ${have}`))
    .orderBy(asc(users.name))
    .limit(8);
  return NextResponse.json({ hits: rows.map((r) => ({ id: r.id, name: r.name, sub: r.email })) });
}
