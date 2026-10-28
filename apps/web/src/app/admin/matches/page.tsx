import Link from 'next/link';
import { alias, desc, eq, getDb, matches, sports, teams, tournaments } from '@sports/db';
import { Button, Card, Empty, Input, Label, PageHeader, Select, StatusBadge } from '@/components/ui';
import { createMatch } from './actions';

export const dynamic = 'force-dynamic';

export default async function MatchesAdmin() {
  const db = getDb();
  const a = alias(teams, 'a');
  const b = alias(teams, 'b');
  const [sportRows, teamRows, tourRows, rows] = await Promise.all([
    db.select().from(sports).orderBy(sports.name),
    db.select().from(teams).orderBy(teams.name),
    db.select().from(tournaments).orderBy(tournaments.name),
    db
      .select({
        id: matches.id,
        status: matches.status,
        scheduledAt: matches.scheduledAt,
        sport: sports.name,
        teamA: a.name,
        teamB: b.name,
      })
      .from(matches)
      .innerJoin(sports, eq(sports.id, matches.sportId))
      .innerJoin(a, eq(a.id, matches.teamAId))
      .innerJoin(b, eq(b.id, matches.teamBId))
      .orderBy(desc(matches.createdAt)),
  ]);
  const teamOptions = teamRows.map((t) => <option key={t.id} value={t.id}>{t.name}</option>);

  return (
    <div className="space-y-6">
      <PageHeader title="Matches" />
      <Card>
        <form action={createMatch} className="grid gap-3 sm:grid-cols-3">
          <Label text="Sport">
            <Select name="sportId" required>
              {sportRows.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Label>
          <Label text="Team A"><Select name="teamAId" required>{teamOptions}</Select></Label>
          <Label text="Team B"><Select name="teamBId" required>{teamOptions}</Select></Label>
          <Label text="Tournament (optional)">
            <Select name="tournamentId">
              <option value="">—</option>
              {tourRows.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Label>
          <Label text="Venue"><Input name="venue" /></Label>
          <Label text="Date & time"><Input name="scheduledAt" type="datetime-local" /></Label>
          <Label text="Overs (cricket)"><Input name="overs" type="number" min={1} max={50} placeholder="5" /></Label>
          <Label text="First to (foosball)"><Input name="firstTo" type="number" min={1} max={50} placeholder="10" /></Label>
          <div className="flex items-end"><Button>Create match</Button></div>
        </form>
      </Card>
      {rows.length === 0 ? (
        <Empty>No matches yet.</Empty>
      ) : (
        <Card className="divide-y divide-border p-0">
          {rows.map((m) => (
            <Link key={m.id} href={`/admin/matches/${m.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-surface-2">
              <div>
                <div className="font-medium">{m.teamA} vs {m.teamB}</div>
                <div className="text-xs text-muted">{m.sport}{m.scheduledAt && ` · ${m.scheduledAt.toLocaleString()}`}</div>
              </div>
              <StatusBadge status={m.status} />
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
