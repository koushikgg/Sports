import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { eq, getDb, players, users } from '@sports/db';
import { auth } from '@/auth';
import { PlayerView } from '@/components/players/player-view';
import { ProfileEditor } from '@/components/players/profile-editor';
import '@/components/players/profile.css';
import { RatchShell } from '@/components/ratch/shell';
import { getPlayerProfile } from '@/lib/player-stats';
import { getShellUser } from '@/lib/shell-user';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My profile', robots: { index: false } };

export default async function MyProfile({ searchParams }: { searchParams: Promise<{ sport?: string }> }) {
  const { sport } = await searchParams;
  const session = await auth();
  if (!session?.user) redirect('/login?callbackUrl=/profile');
  const { user } = await getShellUser();
  const db = getDb();
  const [me] = await db.select({ name: users.name, email: users.email, role: users.role }).from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!me) redirect('/login');
  const [player] = await db.select({ id: players.id, role: players.role }).from(players).where(eq(players.userId, session.user.id)).limit(1);
  const profile = player ? await getPlayerProfile(player.id) : null;
  const editor = <ProfileEditor name={me.name} email={me.email} role={me.role} avatar={user?.avatar ?? null} cricketRole={player?.role ?? null} />;

  return (
    <RatchShell active={null} user={user}>
      <div className="pf">
        {profile ? (
          <PlayerView profile={profile} sport={sport} basePath="/profile" identity={editor} />
        ) : (
          <section className="pf-hero">{editor}</section>
        )}
      </div>
    </RatchShell>
  );
}
