import { cache } from 'react';
import { eq, getDb, sql, tournamentManagers, users } from '@sports/db';
import { auth } from '@/auth';
import type { ShellUser } from '@/components/ratch/shell';
import { avatarSrc } from '@/lib/avatar';

/**
 * What the shell shows about each signed-in person (name, photo, tournaments they manage). Every page needs it, and asking the
 * database costs a whole round trip, so it is remembered for a short while and forgotten at once when it changes
 * (`forgetShellUser`): a profile edit, a role change, a manager added or removed.
 */
const REMEMBER_MS = 30_000;
const remembered = new Map<string, { at: number; user: ShellUser }>();
export function forgetShellUser(userId?: string) {
  if (userId) remembered.delete(userId);
  else remembered.clear();
}

/** The signed-in person as the Ratch shell shows them. Called many times in one request, it asks once. */
export const getShellUser = cache(async (): Promise<{ user: ShellUser | null; canScore: boolean }> => {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user || !role) return { user: null, canScore: false };
  const hit = remembered.get(session.user.id);
  // the role in the sign-in cookie is the one that counts, so a remembered copy is only used while it agrees
  if (hit && Date.now() - hit.at < REMEMBER_MS && hit.user.role === role) return { user: hit.user, canScore: true };
  let name = session.user.name ?? session.user.email ?? 'User';
  let avatar: string | null = null;
  let managed: string[] = [];
  let failed = false;
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
  } catch { failed = true; /* the header still works from the session */ }
  const user: ShellUser = { id: session.user.id, name, role, avatar, managed };
  if (!failed) { remembered.set(session.user.id, { at: Date.now(), user }); if (remembered.size > 500) remembered.delete(remembered.keys().next().value!); }
  return { user, canScore: true };
});
