import { eq, getDb, inArray, matches, sports, teams, tournaments } from '@sports/db';
import { FORMATS, type TournamentMeta } from '@sports/shared';
import { tournamentStarted } from '@sports/scoring';
import type { FixtureContext } from '@sports/sports-engine/src/fixture-import';

export interface LoadedFixtureContext {
  ctx: FixtureContext;
  meta: TournamentMeta;
  sportId: string;
  sportKey: string;
  /** Fixtures are locked once the tournament has started. */
  started: boolean;
}

/** Everything the fixture prompt and the import check need to know about a tournament. `tzOffset` is the browser's getTimezoneOffset(). */
export async function loadFixtureContext(tournamentId: string, tzOffset = 0): Promise<LoadedFixtureContext | null> {
  const db = getDb();
  const [row] = await db
    .select({ t: tournaments, sportId: sports.id, sportKey: sports.key, sportName: sports.name })
    .from(tournaments)
    .innerJoin(sports, eq(sports.id, tournaments.sportId))
    .where(eq(tournaments.id, tournamentId))
    .limit(1);
  const meta = row?.t.meta as unknown as TournamentMeta | undefined;
  if (!row || !meta?.teams?.length) return null;

  const [started, teamRows, existing] = await Promise.all([
    tournamentStarted(tournamentId),
    db.select({ id: teams.id, name: teams.name, shortName: teams.shortName }).from(teams).where(inArray(teams.id, meta.teams.map((t) => t.id))),
    db.select({ a: matches.teamAId, b: matches.teamBId, at: matches.scheduledAt }).from(matches).where(eq(matches.tournamentId, tournamentId)),
  ]);
  const venueNames = (meta.venues ?? []).map((v) => v.name);
  const n = meta.teams.length;
  // a knockout lists every round (one team goes out per match); the other formats list the league stage
  const expected = meta.formatKey === 'ko' ? Math.max(0, n - 1) : meta.plan?.leagueMatches ?? 0;

  return {
    meta, sportId: row.sportId, sportKey: row.sportKey, started,
    ctx: {
      tournamentName: row.t.name, sportName: row.sportName, formatKey: meta.formatKey, formatLabel: FORMATS[meta.formatKey].label,
      teams: meta.teams.map((t) => ({ id: t.id, name: teamRows.find((x) => x.id === t.id)?.name ?? t.name, shortName: teamRows.find((x) => x.id === t.id)?.shortName ?? null })),
      venues: venueNames, startDate: meta.schedule.startDate, endDate: meta.schedule.endDate, perDay: meta.schedule.perDay,
      firstMatchTime: meta.schedule.firstMatchTime, restDay: meta.schedule.restDay, overs: meta.overs, expectedMatches: expected,
      bracket: (meta.bracket ?? []).map((b) => ({ no: b.no, date: b.date, time: b.time, a: b.a, b: b.b })),
      existing: existing.filter((m) => m.at).map((m) => ({ teamAId: m.a, teamBId: m.b, date: new Date(m.at!.getTime() - tzOffset * 60_000).toISOString().slice(0, 10) })),
    },
  };
}
