import Link from 'next/link';
import { getCricketLeaders } from '@sports/scoring';
import { CricketLeaders } from '@/components/leaders';
import { LiveNow } from '@/components/live-now';
import { MatchCard } from '@/components/match-card';
import { PublicShell } from '@/components/public-shell';
import { getAllSports, listMatchCards } from '@/lib/queries';

export const dynamic = 'force-dynamic';

function Section({ id, title, action, children }: { id?: string; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id ?? title}-h`} className="mt-12 scroll-mt-20">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 id={`${id ?? title}-h`} className="text-xl font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const empty = (text: string) => (
  <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">{text}</p>
);

export default async function Home() {
  const [allSports, live, upcoming, results, leaders] = await Promise.all([
    getAllSports(),
    listMatchCards({ statuses: ['live', 'paused'] }),
    listMatchCards({ statuses: ['scheduled'], order: 'upcoming', limit: 6 }),
    listMatchCards({ statuses: ['completed'], limit: 6 }),
    getCricketLeaders(5),
  ]);
  const cricketOn = allSports.some((s) => s.key === 'cricket' && s.enabled);

  return (
    <PublicShell>
      <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-surface via-surface-2 to-bg px-6 py-14 text-center sm:py-20">
        <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-brand/15 blur-3xl" />
        <p className="relative text-sm font-medium uppercase tracking-widest text-brand">Company sports</p>
        <h1 className="relative mt-3 text-4xl font-bold tracking-tight sm:text-6xl">
          Every match. <span className="text-brand">Live.</span>
        </h1>
        <p className="relative mx-auto mt-4 max-w-xl text-muted">
          Ball-by-ball scores, fixtures and results for every game played around the office.
        </p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <a href="#live" className="rounded-md bg-brand px-5 py-2.5 font-medium text-black">
            {live.length > 0 ? `${live.length} live now` : 'See live scores'}
          </a>
          <Link href="/sports" className="rounded-md border border-border px-5 py-2.5 font-medium hover:bg-surface-2">Browse sports</Link>
        </div>
      </section>

      <Section id="live" title="Live now">
        <LiveNow key={live.map((m) => m.id).join()} matches={live} />
      </Section>

      <Section title="Sports">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {allSports.map((s) => (
            <li key={s.id}>
              {s.enabled ? (
                <Link href={`/sports/${s.key}`} className="block rounded-xl border border-border bg-surface p-6 transition hover:border-brand/60 focus-visible:outline-2 focus-visible:outline-brand">
                  <div className="text-lg font-semibold">{s.name}</div>
                  <div className="mt-1 text-sm text-muted">
                    {live.filter((m) => m.sportKey === s.key).length} live · {upcoming.filter((m) => m.sportKey === s.key).length} upcoming
                  </div>
                </Link>
              ) : (
                <div aria-disabled className="rounded-xl border border-dashed border-border p-6 opacity-60">
                  <div className="text-lg font-semibold">{s.name}</div>
                  <div className="mt-1 text-sm text-muted">Coming soon</div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Upcoming">
        {upcoming.length === 0 ? empty('No fixtures scheduled.') : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{upcoming.map((m) => <MatchCard key={m.id} m={m} />)}</div>
        )}
      </Section>

      <Section title="Recent results">
        {results.length === 0 ? empty('No results yet.') : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{results.map((m) => <MatchCard key={m.id} m={m} />)}</div>
        )}
      </Section>

      {cricketOn && (
        <Section title="Cricket leaders">
          <CricketLeaders {...leaders} />
        </Section>
      )}
    </PublicShell>
  );
}
