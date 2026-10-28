import { auth } from '@/auth';
import type { ShellUser } from '@/components/ratch/shell';

/** The signed-in person as the Ratch shell shows them. */
export async function getShellUser(): Promise<{ user: ShellUser | null; canScore: boolean }> {
  const session = await auth();
  const role = session?.user?.role;
  const user: ShellUser | null = session?.user && role ? { id: session.user.id, name: session.user.name ?? session.user.email ?? 'User', role } : null;
  return { user, canScore: role === 'admin' || role === 'scorer' };
}
