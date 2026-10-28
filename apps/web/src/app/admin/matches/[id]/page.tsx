import Link from 'next/link';
import { notFound } from 'next/navigation';
import { alias, eq, getDb, matches, sports, teams } from '@sports/db';
import { MATCH_STATUSES } from '@sports/shared';
import { Button, Card, PageHeader, StatusBadge } from '@/components/ui';
import { deleteMatch, setMatchStatus } from '../actions';

export const dynamic = 'force-dynamic';

export default async function MatchDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = alias(teams, 'a');
  const b = alias(teams, 'b');
  const [m] = await getDb()
    .select({
      id: matches.id,
      status: matches.status,
      venue: matches.venue,
      config: matches.config,
      scheduledAt: matches.scheduledAt,
      sport: sports.name,
      sportKey: sports.key,
      teamA: a.name,
      teamB: b.name,
    })
    .from(matches)
    .innerJoin(sports, eq(sports.id, matches.sportId))
    .innerJoin(a, eq(a.id, matches.teamAId))
    .innerJoin(b, eq(b.id, matches.teamBId))
    .where(eq(matches.id, id))
    .limit(1);
  if (!m) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={`${m.teamA} vs ${m.teamB}`}>
        <StatusBadge status={m.status} />
      </PageHeader>
      <Card className="space-y-1 text-sm">
        <div><span className="text-muted">Sport:</span> {m.sport}</div>
        <div><span className="text-muted">Venue:</span> {m.venue ?? '—'}</div>
        <div><span className="text-muted">When:</span> {m.scheduledAt?.toLocaleString() ?? 'TBD'}</div>
        <div><span className="text-muted">Config:</span> {JSON.stringify(m.config)}</div>
      </Card>
      <Card>
        <h2 className="mb-3 font-medium">Status</h2>
        <div className="flex flex-wrap gap-2">
          {MATCH_STATUSES.map((s) => (
            <form key={s} action={setMatchStatus}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="status" value={s} />
              <Button variant={s === m.status ? 'primary' : 'ghost'} className="capitalize">{s}</Button>
            </form>
          ))}
        </div>
      </Card>
      <Link href={`/admin/matches/${id}/score`} className="inline-block rounded-md bg-accent px-3 py-2 text-sm font-medium text-white">Open scorer console</Link>
      <Link href={`/display/${id}`} target="_blank" className="ml-2 inline-block rounded-md border border-border px-3 py-2 text-sm">TV display ↗</Link>
      <form action={deleteMatch}>
        <input type="hidden" name="id" value={id} />
        <Button variant="danger">Delete match</Button>
      </form>
    </div>
  );
}
