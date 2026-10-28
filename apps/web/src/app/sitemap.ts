import type { MetadataRoute } from 'next';
import { getEnabledSports, listMatchCards, SITE_URL } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [sports, matches] = await Promise.all([getEnabledSports(), listMatchCards({ limit: 200 })]);
  return [
    { url: SITE_URL, changeFrequency: 'hourly', priority: 1 },
    { url: `${SITE_URL}/sports`, changeFrequency: 'daily' },
    ...sports.map((s) => ({ url: `${SITE_URL}/sports/${s.key}`, changeFrequency: 'hourly' as const })),
    ...matches.map((m) => ({
      url: `${SITE_URL}/sports/${m.sportKey}/matches/${m.id}`,
      changeFrequency: m.status === 'live' ? ('always' as const) : ('weekly' as const),
    })),
  ];
}
