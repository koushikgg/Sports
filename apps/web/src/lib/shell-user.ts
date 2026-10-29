import { eq, getDb, sql, tournamentManagers, users } from '@sports/db';
import { auth } from '@/auth';
import type { ShellUser } from '@/components/ratch/shell';
import { avatarSrc } from '@/lib/avatar';

/** The signed-in person as the Ratch shell shows them. Name and photo are read fresh, so edits show at once. */
export async function getShellUser(): Promise<{ user: ShellUser | null; canScore: boolean }> {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user || !role) return { user: null, canScore: false };
  let name = session.user.name ?? session.user.email ?? 'User';
  let avatar: string | null = null;
  let managed: string[] = [];
  try {
    const db = getDb();
    const [[row], mine] = await Promise.all([
      db
        .select({ name: users.name, at: users.avatarUpdatedAt, has: sql<boolean>`${users.avatarUrl} is not null` })
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1),
      db.select({ t: tournamentManagers.tournamentId }).from(tournamentManagers).where(eq(tournamentManagers.userId, session.user.id)),
    ]);
    if (row) { name = row.name; avatar = row.has ? avatarSrc(session.user.id, row.at ?? new Date(0)) : null; }
    managed = mine.map((m) => m.t);
  } catch { /* the header still works from the session */ }
  return { user: { id: session.user.id, name, role, avatar, managed }, canScore: true };
}
