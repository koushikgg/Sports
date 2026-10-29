import { asc, getDb, users } from '@sports/db';
import { auth } from '@/auth';
import { Avatar } from '@/components/ratch/avatar';
import { Button, Card, Empty, Input, Label, PageHeader, Select } from '@/components/ui';
import { inviteUser, removeUser, setUserRole } from './actions';
import { FlashToast } from '@/components/ratch/flash-toast';

export const dynamic = 'force-dynamic';

export default async function UsersAdmin({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const { notice, error } = await searchParams;
  const me = (await auth())?.user;
  const rows = await getDb().select().from(users).orderBy(asc(users.role), asc(users.email));

  return (
    <div className="space-y-6">
      <PageHeader title="Users" />
      <FlashToast notice={notice} error={error} />

      <Card>
        <form action={inviteUser} className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <Label text="Google email"><Input name="email" type="email" required placeholder="asha@company.com" /></Label>
          <Label text="Name (optional)"><Input name="name" maxLength={80} /></Label>
          <Label text="Role">
            <Select name="role" defaultValue="scorer">
              <option value="scorer">Scorer</option>
              <option value="admin">Admin</option>
            </Select>
          </Label>
          <Button>Invite</Button>
        </form>
        <p className="mt-3 text-xs text-muted">People sign in with the Google account that matches this email. Anyone not listed here is turned away.</p>
      </Card>

      {rows.length === 0 ? <Empty>No users yet.</Empty> : (
        <Card className="divide-y divide-border p-0">
          {rows.map((u) => {
            const self = u.id === me?.id;
            return (
              <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <Avatar name={u.name} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{u.name}{self && <span className="ml-2 font-mono text-[10px] text-muted">YOU</span>}</div>
                  <div className="truncate text-xs text-muted">{u.email}</div>
                </div>
                <form action={setUserRole} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={u.id} />
                  <Select name="role" defaultValue={u.role} disabled={self} aria-label={`Role for ${u.email}`} className="w-32">
                    <option value="scorer">Scorer</option>
                    <option value="admin">Admin</option>
                  </Select>
                  <Button variant="ghost" disabled={self}>Save</Button>
                </form>
                <form action={removeUser}>
                  <input type="hidden" name="id" value={u.id} />
                  <Button variant="danger" disabled={self}>Remove</Button>
                </form>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
