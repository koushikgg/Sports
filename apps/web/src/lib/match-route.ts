import { eq, getDb, matches, sports } from '@sports/db';

/**
 * Where a match lives, found from its id alone and without any visibility check, so an old address can be sent on to the
 * right place. The page it lands on decides who may see it.
 */
export async function matchRoute(id: string): Promise<{ id: string; sportKey: string; tournamentId: string | null } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await getDb()
    .select({ id: matches.id, sportKey: sports.key, tournamentId: matches.tournamentId })
    .from(matches)
    .innerJoin(sports, eq(sports.id, matches.sportId))
    .where(eq(matches.id, id))
    .limit(1);
  return row ?? null;
}
