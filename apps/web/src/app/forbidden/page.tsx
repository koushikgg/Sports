import type { Metadata } from 'next';
import Link from 'next/link';
import '@/components/create/create.css';
import { RatchShell } from '@/components/ratch/shell';
import { getShellUser } from '@/lib/shell-user';

export const metadata: Metadata = { title: 'Not allowed', robots: { index: false } };

export default async function Forbidden() {
  const { user } = await getShellUser();
  return (
    <RatchShell active={null} user={user}>
      <div className="cw-denied">
        <span className="lbl">ERROR 403</span>
        <h1>You do not have access to this page</h1>
        <p>{user ? `Your ${user.role} account cannot open it.` : 'Sign in with an account that can.'}</p>
        <Link href="/" className="mx-btn mx-btn-lg" data-variant="amber">BACK HOME</Link>
      </div>
    </RatchShell>
  );
}
