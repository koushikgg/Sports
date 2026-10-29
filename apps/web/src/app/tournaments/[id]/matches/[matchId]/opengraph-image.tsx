import { matchImage } from '@/lib/match-og';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Match score card';

export default async function Image({ params }: { params: Promise<{ matchId: string }> }) {
  return matchImage((await params).matchId);
}
