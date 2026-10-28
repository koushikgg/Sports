import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth, signOut } from '@/auth';

const nav = [
  ['/admin', 'Dashboard'],
  ['/admin/sports', 'Sports'],
  ['/admin/teams', 'Teams'],
  ['/admin/players', 'Players'],
  ['/admin/tournaments', 'Tournaments'],
  ['/admin/matches', 'Matches'],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-56 shrink-0 border-r border-border bg-surface p-4 md:block">
        <div className="mb-6 text-lg font-bold">
          Sports <span className="text-brand">Admin</span>
        </div>
        <nav className="space-y-1">
          {nav.map(([href, label]) => (
            <Link key={href} href={href} className="block rounded-md px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
              {label}
            </Link>
          ))}
        </nav>
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/login' });
          }}
          className="mt-8"
        >
          <button className="text-sm text-muted hover:text-fg">Sign out ({session.user.role})</button>
        </form>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
