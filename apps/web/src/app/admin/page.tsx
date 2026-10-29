import Link from 'next/link';
import { count, eq, getDb, matches, players, teams, tournaments } from '@sports/db';
import { Card, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const db = getDb();
  const total = async (t: typeof teams | typeof players | typeof tournaments | typeof matches) =>
    (await db.select({ n: count() }).from(t))[0]?.n ?? 0;
  const [liveRow] = await db.select({ n: count() }).from(matches).where(eq(matches.status, 'live'));

  const stats = [
    ['Live matches', liveRow?.n ?? 0, '/admin/matches'],
    ['Matches', await total(matches), '/admin/matches'],
    ['Teams', await total(teams), '/teams'],
    ['Players', await total(players), '/players'],
    ['Tournaments', await total(tournaments), '/admin/tournaments'],
  ] as const;

  return (
    <div>
      <PageHeader title="Dashboard" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map(([label, n, href]) => (
          <Link key={label} href={href}>
            <Card className="transition hover:border-brand/60">
              <div className="text-3xl font-bold">{n}</div>
              <div className="text-sm text-muted">{label}</div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
