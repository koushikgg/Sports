import { getDb, players } from '@sports/db';
import { Button, Card, Empty, Input, Label, PageHeader, Textarea } from '@/components/ui';
import { createPlayer, deletePlayer, importPlayers } from './actions';

export const dynamic = 'force-dynamic';

export default async function PlayersAdmin() {
  const rows = await getDb().select().from(players).orderBy(players.name);
  return (
    <div className="space-y-6">
      <PageHeader title="Players" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <form action={createPlayer} className="space-y-3">
            <h2 className="font-medium">Add player</h2>
            <Label text="Name"><Input name="name" required /></Label>
            <Label text="Email"><Input name="email" type="email" /></Label>
            <Label text="Employee ID"><Input name="employeeId" /></Label>
            <Button>Add</Button>
          </form>
        </Card>
        <Card>
          <form action={importPlayers} className="space-y-3">
            <h2 className="font-medium">Import CSV</h2>
            <Label text="name,email,employeeId — one per line">
              <Textarea name="csv" rows={5} placeholder={'Asha Rao,asha@co.com,E102'} />
            </Label>
            <Button variant="ghost">Import</Button>
          </form>
        </Card>
      </div>
      {rows.length === 0 ? (
        <Empty>No players yet.</Empty>
      ) : (
        <Card className="divide-y divide-border p-0">
          {rows.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-muted">{[p.email, p.employeeId].filter(Boolean).join(' · ')}</div>
              </div>
              <form action={deletePlayer}>
                <input type="hidden" name="id" value={p.id} />
                <Button variant="danger">Delete</Button>
              </form>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
