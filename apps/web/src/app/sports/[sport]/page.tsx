import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCricketLeaders } from '@sports/scoring';
import '@/components/matches/matches.css';
import '@/components/sports/sports.css';
import { RatchShell } from '@/components/ratch/shell';
import { SportHub } from '@/components/sports/hub';
import { getEnabledSports, listMatchCards } from '@/lib/queries';
import { getShellUser } from '@/lib/shell-user';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ sport: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sport: key } = await params;
  const sport = (await getEnabledSports()).find((s) => s.key === key);
  return sport
    ? { title: `${sport.name} — live scores, fixtures & results`, description: `Follow every ${sport.name.toLowerCase()} match live.` }
    : {};
}

export default async function SportHubPage({ params }: Props) {
  const { sport: key } = await params;
  const [sports, { user }] = await Promise.all([getEnabledSports(), getShellUser()]);
  const sport = sports.find((s) => s.key === key);
  if (!sport) notFound();

  const [matches, leaders] = await Promise.all([
    listMatchCards({ sportKey: key, limit: 200, signedIn: !!user }),
    key === 'cricket' ? getCricketLeaders(5) : null,
  ]);

  return (
    <RatchShell active="matches" user={user}>
      <nav className="rx-crumbs" aria-label="Breadcrumb">
        <Link href="/matches">MATCHES</Link>/<Link href="/sports">SPORTS</Link>/<span aria-current="page">{sport.name.toUpperCase()}</span>
      </nav>
      <SportHub sport={{ key: sport.key, name: sport.name }} matches={matches} leaders={leaders} viewer={user} />
    </RatchShell>
  );
}
