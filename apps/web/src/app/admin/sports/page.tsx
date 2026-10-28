import { getDb, sports } from '@sports/db';
import { Button, Card, PageHeader } from '@/components/ui';
import { toggleSport } from './actions';

export const dynamic = 'force-dynamic';

export default async function SportsAdmin() {
  const rows = await getDb().select().from(sports).orderBy(sports.name);
  return (
    <div>
      <PageHeader title="Sports" />
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((s) => (
          <Card key={s.id} className="flex items-center justify-between">
            <div>
              <div className="font-medium">{s.name}</div>
              <div className="text-xs text-muted">{s.enabled ? 'Enabled' : 'Disabled (hidden from public)'}</div>
            </div>
            <form action={toggleSport}>
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="enabled" value={String(!s.enabled)} />
              <Button variant="ghost">{s.enabled ? 'Disable' : 'Enable'}</Button>
            </form>
          </Card>
        ))}
      </div>
    </div>
  );
}
