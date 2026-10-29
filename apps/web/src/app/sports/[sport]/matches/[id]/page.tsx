import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MatchPageView, matchMetadata } from '@/components/match/match-page';
import { getMatchCard } from '@/lib/queries';
import { getShellUser } from '@/lib/shell-user';
import { matchHref } from '@/lib/match-href';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ sport: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return matchMetadata((await params).id);
}

export default async function MatchPage({ params }: Props) {
  const { sport, id } = await params;
  // a tournament's match lives under the tournament; old links come here and carry on
  const { user } = await getShellUser();
  const card = await getMatchCard(id, !!user);
  if (card?.tournamentId) redirect(matchHref(card));
  return <MatchPageView id={id} where={{ sport }} />;
}
