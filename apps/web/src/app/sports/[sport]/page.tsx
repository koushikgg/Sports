import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCricketLeaders } from '@sports/scoring';
import { CricketLeaders } from '@/components/leaders';
import { LiveNow } from '@/components/live-now';
import { MatchCard } from '@/components/match-card';
import { PublicShell } from '@/components/public-shell';
import { getEnabledSports, listMatchCards, type MatchCardData } from '@/lib/queries';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ sport: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sport: key } = await params;
  const sport = (await getEnabledSports()).find((s) => s.key === key);
  return sport
    ? { title: `${sport.name} — live scores, fixtures & results`, description: `Follow every ${sport.name.toLowerCase()} match live.` }
    : {};
}

export default async function SportHub({ params }: Props) {
  const { sport: key } = await params;
  const sport = (await getEnabledSports()).find((s) => s.key === key);
  if (!sport) notFound();

  const [live, upcoming, results, leaders] = await Promise.all([
    listMatchCards({ sportKey: key, statuses: ['live', 'paused'] }),
    listMatchCards({ sportKey: key, statuses: ['scheduled'], order: 'upcoming' }),
    listMatchCards({ sportKey: key, statuses: ['completed', 'abandoned'], limit: 12 }),
    key === 'cricket' ? getCricketLeaders(5) : null,
  ]);

  const grid = (rows: MatchCardData[], emptyText: string) =>
    rows.length === 0 ? (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">{emptyText}</p>
    ) : (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{rows.map((m) => <MatchCard key={m.id} m={m} />)}</div>
    );

  return (
    <PublicShell>
      <h1 className="mb-8 text-3xl font-bold">{sport.name}</h1>
      <div className="space-y-10">
        <section aria-labelledby="live-h">
          <h2 id="live-h" className="mb-4 text-xl font-semibold">Live now</h2>
          <LiveNow key={live.map((m) => m.id).join()} matches={live} />
        </section>
        <section aria-labelledby="up-h">
          <h2 id="up-h" className="mb-4 text-xl font-semibold">Upcoming</h2>
          {grid(upcoming, 'No upcoming fixtures.')}
        </section>
        <section aria-labelledby="res-h">
          <h2 id="res-h" className="mb-4 text-xl font-semibold">Results</h2>
          {grid(results, 'No results yet.')}
        </section>
        {leaders && (
          <section aria-labelledby="lead-h">
            <h2 id="lead-h" className="mb-4 text-xl font-semibold">Leaders</h2>
            <CricketLeaders {...leaders} />
          </section>
        )}
      </div>
    </PublicShell>
  );
}
