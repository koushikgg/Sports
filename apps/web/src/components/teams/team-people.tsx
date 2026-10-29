import { asc, eq, getDb, players, teamManagers, teamMembers, users } from '@sports/db';
import { Button, Card, Empty } from '@/components/ui';
import { makeCaptain, removeFromTeam, removeManager } from '@/app/teams/actions';
import { PeopleSearch } from './people-search';

const Hidden = ({ teamId, name, value }: { teamId: string; name?: string; value?: string }) => (
  <>
    <input type="hidden" name="teamId" value={teamId} />
    {name && <input type="hidden" name={name} value={value} />}
  </>
);

/** The roster and the people who run a team. `canManage` shows the controls, `isAdmin` adds captain and manager assignment. */
export async function TeamPeople({ teamId, canManage, isAdmin }: { teamId: string; canManage: boolean; isAdmin: boolean }) {
  const db = getDb();
  const [roster, managers] = await Promise.all([
    db
      .select({ id: players.id, name: players.name, userId: players.userId, isCaptain: teamMembers.isCaptain })
      .from(teamMembers)
      .innerJoin(players, eq(players.id, teamMembers.playerId))
      .where(eq(teamMembers.teamId, teamId))
      .orderBy(asc(players.name)),
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(teamManagers)
      .innerJoin(users, eq(users.id, teamManagers.userId))
      .where(eq(teamManagers.teamId, teamId))
      .orderBy(asc(users.name)),
  ]);

  return (
    <div className="space-y-6">
      {canManage && (
        <Card>
          <PeopleSearch teamId={teamId} kind="player" label="Add a player" hint="Search people with an account or in the player directory. Adding a user creates their player profile." />
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Roster · {roster.length}</h2>
        {roster.length === 0 ? <Empty>Roster is empty.</Empty> : (
          <Card className="divide-y divide-border p-0">
            {roster.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span>
                  {p.name}
                  {p.isCaptain && <span className="ml-2 rounded bg-brand/20 px-1.5 text-xs text-brand">C</span>}
                  {p.userId && <span className="ml-2 text-xs text-muted">has account</span>}
                </span>
                {canManage && (
                  <div className="flex gap-2">
                    {isAdmin && !p.isCaptain && (
                      p.userId ? (
                        <form action={makeCaptain}><Hidden teamId={teamId} name="playerId" value={p.id} /><Button variant="ghost">Make captain</Button></form>
                      ) : <span className="self-center text-xs text-muted">No account, cannot captain</span>
                    )}
                    <form action={removeFromTeam}><Hidden teamId={teamId} name="playerId" value={p.id} /><Button variant="danger">Remove</Button></form>
                  </div>
                )}
              </div>
            ))}
          </Card>
        )}
        {isAdmin && <p className="text-xs text-muted">The captain can add and remove this team&apos;s people. Only players linked to a user account can be captain.</p>}
      </section>

      {(isAdmin || managers.length > 0) && (
        <section className="space-y-3">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Managers · {managers.length}</h2>
          {isAdmin && (
            <Card>
              <PeopleSearch teamId={teamId} kind="manager" label="Add a manager" hint="Managers add and remove this team's players without having to play." />
            </Card>
          )}
          {managers.length === 0 ? <Empty>No managers yet.</Empty> : (
            <Card className="divide-y divide-border p-0">
              {managers.map((m) => (
                <div key={m.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span>{m.name} <span className="text-xs text-muted">{m.email}</span></span>
                  {isAdmin && <form action={removeManager}><Hidden teamId={teamId} name="userId" value={m.id} /><Button variant="danger">Remove</Button></form>}
                </div>
              ))}
            </Card>
          )}
        </section>
      )}
    </div>
  );
}
