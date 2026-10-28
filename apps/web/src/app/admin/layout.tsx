import { redirect } from 'next/navigation';
import { accessFor } from '@sports/shared';
import { auth } from '@/auth';
import { AdminNav } from '@/components/ratch/admin-nav';
import { RatchShell } from '@/components/ratch/shell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login?callbackUrl=/admin');
  const { role } = session.user;
  if (accessFor(role, '/admin') !== 'ok') redirect('/forbidden');

  return (
    <RatchShell active={null} user={{ id: session.user.id, name: session.user.name ?? session.user.email ?? 'User', role }}>
      <AdminNav />
      {children}
    </RatchShell>
  );
}
