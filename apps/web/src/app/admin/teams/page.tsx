import Link from 'next/link';
import { eq, getDb, sports, teams } from '@sports/db';
import { Button, Card, Empty, Input, Label, PageHeader, Select } from '@/components/ui';
import { createTeam } from './actions';

export const dynamic = 'force-dynamic';

export default async function TeamsAdmin() {
  const db = getDb();
  const [sportRows, rows] = await Promise.all([
    db.select().from(sports).orderBy(sports.name),
    db
      .select({ id: teams.id, name: teams.name, shortName: teams.shortName, sport: sports.name })
      .from(teams)
      .innerJoin(sports, eq(sports.id, teams.sportId))
      .orderBy(teams.name),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Teams" />
      <Card>
        <form action={createTeam} className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <Label text="Sport">
            <Select name="sportId" required>
              {sportRows.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Label>
          <Label text="Name"><Input name="name" required /></Label>
          <Label text="Short (≤5)"><Input name="shortName" maxLength={5} /></Label>
          <Button>Create team</Button>
        </form>
      </Card>
      {rows.length === 0 ? (
        <Empty>No teams yet.</Empty>
      ) : (
        <Card className="divide-y divide-border p-0">
          {rows.map((t) => (
            <Link key={t.id} href={`/admin/teams/${t.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-surface-2">
              <span className="font-medium">{t.name}{t.shortName && <span className="ml-2 text-muted">{t.shortName}</span>}</span>
              <span className="text-xs text-muted">{t.sport}</span>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
