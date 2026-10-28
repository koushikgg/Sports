import { notFound } from 'next/navigation';
import { eq, getDb, players, teamMembers, teams } from '@sports/db';
import { Button, Card, Empty, Label, PageHeader, Select } from '@/components/ui';
import { addMember, deleteTeam, removeMember, setCaptain } from '../actions';

export const dynamic = 'force-dynamic';

export default async function TeamDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const [team] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
  if (!team) notFound();

  const [roster, everyone] = await Promise.all([
    db
      .select({ id: players.id, name: players.name, isCaptain: teamMembers.isCaptain })
      .from(teamMembers)
      .innerJoin(players, eq(players.id, teamMembers.playerId))
      .where(eq(teamMembers.teamId, id))
      .orderBy(players.name),
    db.select().from(players).orderBy(players.name),
  ]);
  const inTeam = new Set(roster.map((r) => r.id));
  const available = everyone.filter((p) => !inTeam.has(p.id));

  return (
    <div className="space-y-6">
      <PageHeader title={team.name}>
        <form action={deleteTeam}>
          <input type="hidden" name="id" value={id} />
          <Button variant="danger">Delete team</Button>
        </form>
      </PageHeader>
      <Card>
        <form action={addMember} className="flex items-end gap-3">
          <input type="hidden" name="teamId" value={id} />
          <Label text="Add player to roster">
            <Select name="playerId" required>
              {available.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Label>
          <Button disabled={available.length === 0}>Add</Button>
        </form>
      </Card>
      {roster.length === 0 ? (
        <Empty>Roster is empty.</Empty>
      ) : (
        <Card className="divide-y divide-border p-0">
          {roster.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span>{p.name}{p.isCaptain && <span className="ml-2 rounded bg-brand/20 px-1.5 text-xs text-brand">C</span>}</span>
              <div className="flex gap-2">
                {!p.isCaptain && (
                  <form action={setCaptain}>
                    <input type="hidden" name="teamId" value={id} />
                    <input type="hidden" name="playerId" value={p.id} />
                    <Button variant="ghost">Make captain</Button>
                  </form>
                )}
                <form action={removeMember}>
                  <input type="hidden" name="teamId" value={id} />
                  <input type="hidden" name="playerId" value={p.id} />
                  <Button variant="danger">Remove</Button>
                </form>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
