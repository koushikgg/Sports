import { notFound, redirect } from 'next/navigation';
import { scoreHref } from '@/lib/match-href';
import { matchRoute } from '@/lib/match-route';

export const dynamic = 'force-dynamic';

/** The old scorer address. The console lives under its match now; this sends people there. */
export default async function OldScorerAddress({ params }: { params: Promise<{ id: string }> }) {
  const m = await matchRoute((await params).id);
  if (!m) notFound();
  redirect(scoreHref(m));
}
