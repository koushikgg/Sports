import '@sports/sports-engine/src/all';
import { eq, getDb, sports } from '@sports/db';
import { getMatchCard, listMatchCards, type MatchCardData } from '@sports/scoring';

export type { MatchCardData };
export { getMatchCard, listMatchCards };

export const getEnabledSports = () =>
  getDb().select().from(sports).where(eq(sports.enabled, true)).orderBy(sports.name);

/** Everything, so the landing page can tease sports that are not live yet. */
export const getAllSports = () => getDb().select().from(sports).orderBy(sports.name);

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
