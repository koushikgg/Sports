import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import '@sports/sports-engine/src/all';
import { getSnapshot } from '@sports/scoring';
import { LiveScore } from '@/components/live-score';
import { LocalTime } from '@/components/local-time';
import { PublicShell } from '@/components/public-shell';
import { getMatchCard } from '@/lib/queries';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ sport: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const m = await getMatchCard(id);
  if (!m) return {};
  const title = `${m.teamA} vs ${m.teamB} — ${m.status === 'live' ? 'live score' : m.sportName}`;
  const description = [m.summary.sides.map((s) => `${s.name} ${s.score}`).join(' · '), m.summary.status].filter(Boolean).join(' — ');
  return { title, description, openGraph: { title, description, type: 'website' }, twitter: { card: 'summary_large_image', title, description } };
}

export default async function MatchPage({ params }: Props) {
  const { sport, id } = await params;
  const m = await getMatchCard(id);
  if (!m || m.sportKey !== sport) notFound();
  const snapshot = await getSnapshot(id);
  if (!snapshot) notFound();

  return (
    <PublicShell>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{m.teamA} vs {m.teamB}</h1>
          <p className="mt-1 text-sm text-muted">
            <LocalTime iso={m.scheduledAt} />
            {m.venue && ` · ${m.venue}`}
          </p>
        </div>
        <Link href={`/display/${id}`} target="_blank" className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg">
          TV mode ↗
        </Link>
      </div>
      <LiveScore initial={snapshot} />
    </PublicShell>
  );
}
