import { auth } from '@/auth';

/** The signed-in person as the Ratch shell shows them, plus whether they may score. */
export async function getShellUser() {
  const session = await auth();
  const role = session?.user?.role;
  const user = session?.user && role ? { name: session.user.name ?? session.user.email ?? 'User', role } : null;
  return { user, canScore: role === 'admin' || role === 'scorer' };
}
