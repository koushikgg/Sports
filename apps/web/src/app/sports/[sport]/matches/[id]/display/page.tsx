import type { Metadata } from 'next';
import { TvPageView } from '@/components/match/tv-page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'TV display', robots: { index: false } };

export default async function SportMatchTv({ params }: { params: Promise<{ sport: string; id: string }> }) {
  const { sport, id } = await params;
  return <TvPageView id={id} where={{ sport }} />;
}
