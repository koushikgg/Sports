import { notFound, redirect } from 'next/navigation';
import { displayHref } from '@/lib/match-href';
import { matchRoute } from '@/lib/match-route';

export const dynamic = 'force-dynamic';

/** The old TV address. TV mode lives under its match now; this sends people there. */
export default async function OldTvAddress({ params }: { params: Promise<{ matchId: string }> }) {
  const m = await matchRoute((await params).matchId);
  if (!m) notFound();
  redirect(displayHref(m));
}
