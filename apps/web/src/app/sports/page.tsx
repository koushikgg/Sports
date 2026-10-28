import Link from 'next/link';
import { Card, Empty } from '@/components/ui';
import { PublicShell } from '@/components/public-shell';
import { getEnabledSports } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function SportsIndex() {
  const rows = await getEnabledSports();
  return (
    <PublicShell>
      <h1 className="mb-6 text-2xl font-semibold">Sports</h1>
      {rows.length === 0 ? (
        <Empty>No sports available yet.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((s) => (
            <Link key={s.id} href={`/sports/${s.key}`}>
              <Card className="py-8 text-center text-lg font-medium transition hover:border-brand/60">{s.name}</Card>
            </Link>
          ))}
        </div>
      )}
    </PublicShell>
  );
}
