import { eq, getDb, sports, tournaments } from '@sports/db';
import { Button, Card, Empty, Input, Label, PageHeader, Select } from '@/components/ui';
import { createTournament, deleteTournament } from './actions';

export const dynamic = 'force-dynamic';

export default async function TournamentsAdmin() {
  const db = getDb();
  const [sportRows, rows] = await Promise.all([
    db.select().from(sports).orderBy(sports.name),
    db
      .select({ id: tournaments.id, name: tournaments.name, format: tournaments.format, sport: sports.name })
      .from(tournaments)
      .innerJoin(sports, eq(sports.id, tournaments.sportId))
      .orderBy(tournaments.createdAt),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Tournaments" />
      <Card>
        <form action={createTournament} className="grid gap-3 sm:grid-cols-3">
          <Label text="Sport">
            <Select name="sportId" required>
              {sportRows.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Label>
          <Label text="Name"><Input name="name" required /></Label>
          <Label text="Format">
            <Select name="format">
              <option value="friendly">Friendly</option>
              <option value="round_robin">Round robin</option>
              <option value="knockout">Knockout</option>
              <option value="league_knockout">League + knockout</option>
            </Select>
          </Label>
          <Label text="Starts"><Input name="startsAt" type="date" /></Label>
          <Label text="Ends"><Input name="endsAt" type="date" /></Label>
          <div className="flex items-end"><Button>Create</Button></div>
        </form>
      </Card>
      {rows.length === 0 ? (
        <Empty>No tournaments yet.</Empty>
      ) : (
        <Card className="divide-y divide-border p-0">
          {rows.map((t) => (
            <div key={t.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-muted">{t.sport} · {t.format.replace('_', ' ')}</div>
              </div>
              <form action={deleteTournament}>
                <input type="hidden" name="id" value={t.id} />
                <Button variant="danger">Delete</Button>
              </form>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
