import { NextResponse } from 'next/server';
import { and, asc, eq, getDb, inArray, players, sql, teamManagers, teamMembers, users } from '@sports/db';
import { auth } from '@/auth';
import { canManageTeam } from '@/lib/team-access';

export const dynamic = 'force-dynamic';

export interface PersonHit { kind: 'user' | 'player'; id: string; name: string; sub: string }

/** Finds people a team manager may add. `kind=manager` is admin only and searches accounts. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const kind = url.searchParams.get('kind') === 'manager' ? 'manager' : 'player';
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 60);
  const session = await auth();
  const user = session?.user;
  if (!user || !/^[0-9a-f-]{36}$/i.test(id) || !(await canManageTeam(user, id))) return NextResponse.json({ hits: [] }, { status: 403 });
  if (kind === 'manager' && user.role !== 'admin') return NextResponse.json({ hits: [] }, { status: 403 });
  if (q.length < 2) return NextResponse.json({ hits: [] });

  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const db = getDb();
  const hits: PersonHit[] = [];

  if (kind === 'manager') {
    const have = db.select({ u: teamManagers.userId }).from(teamManagers).where(eq(teamManagers.teamId, id));
    const rows = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(and(sql`(${users.name} ilike ${like} or ${users.email} ilike ${like})`, sql`${users.id} not in ${have}`))
      .orderBy(asc(users.name))
      .limit(8);
    hits.push(...rows.map((r) => ({ kind: 'user' as const, id: r.id, name: r.name, sub: r.email })));
    return NextResponse.json({ hits });
  }

  const onTeam = db.select({ p: teamMembers.playerId }).from(teamMembers).where(eq(teamMembers.teamId, id));
  const [accounts, directory] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(
        and(
          sql`(${users.name} ilike ${like} or ${users.email} ilike ${like})`,
          sql`not exists (select 1 from ${players} where ${players.userId} = ${users.id} and ${players.id} in ${onTeam})`,
        ),
      )
      .orderBy(asc(users.name))
      .limit(8),
    // directory players without an account (those with one are found as users)
    db
      .select({ id: players.id, name: players.name, email: players.email })
      .from(players)
      .where(and(sql`${players.userId} is null`, sql`${players.name} ilike ${like}`, sql`${players.id} not in ${onTeam}`))
      .orderBy(asc(players.name))
      .limit(8),
  ]);
  hits.push(
    ...accounts.map((r) => ({ kind: 'user' as const, id: r.id, name: r.name, sub: r.email })),
    ...directory.map((r) => ({ kind: 'player' as const, id: r.id, name: r.name, sub: r.email ?? 'No account' })),
  );
  return NextResponse.json({ hits });
}
