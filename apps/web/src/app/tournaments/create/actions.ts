'use server';
import { revalidatePath } from 'next/cache';
import { and, eq, getDb, inArray, matchLineups, matches, players, sports, teamMembers, teams, tournaments, users, venues } from '@sports/db';
import { FOOSBALL_DEFAULTS, FORMATS, fitMatchesPerTeam, matchInputSchema, tournamentInputSchema, type TournamentMeta } from '@sports/shared';
import { rebuildFixtures } from '@sports/scoring';
import { planTournament, toInstant } from '@sports/sports-engine/src/tournament-plan';
import { audit, requireRole } from '@/lib/guard';

type Failure = { ok: false; error: string };

const firstIssue = (e: { issues: { message: string }[] }) => e.issues[0]?.message ?? 'Check the form and try again.';

export async function addVenue(name: string): Promise<{ ok: true; venue: { id: string; name: string } } | Failure> {
  const user = await requireRole('admin');
  const clean = name.trim();
  if (!clean || clean.length > 80) return { ok: false, error: 'Give the venue a name.' };
  const db = getDb();
  // Same name again returns the existing venue instead of failing.
  await db.insert(venues).values({ name: clean }).onConflictDoNothing();
  const [venue] = await db.select().from(venues).where(eq(venues.name, clean)).limit(1);
  if (!venue) return { ok: false, error: 'Could not save the venue.' };
  await audit(user.id, 'create', 'venue', venue.id);
  return { ok: true, venue: { id: venue.id, name: venue.name } };
}

export async function addTeam(input: { sportId: string; name: string }): Promise<{ ok: true; team: { id: string; name: string; shortName: string | null; sportId: string } } | Failure> {
  const user = await requireRole('admin');
  const name = input.name.trim();
  if (!name || name.length > 60) return { ok: false, error: 'Give the team a name.' };
  const db = getDb();
  const [sport] = await db.select().from(sports).where(eq(sports.id, input.sportId)).limit(1);
  if (!sport) return { ok: false, error: 'Unknown sport.' };
  const [dupe] = await db.select().from(teams).where(and(eq(teams.sportId, sport.id), eq(teams.name, name))).limit(1);
  if (dupe) return { ok: true, team: { id: dupe.id, name: dupe.name, shortName: dupe.shortName, sportId: dupe.sportId } };
  const [team] = await db.insert(teams).values({ sportId: sport.id, name }).returning();
  await audit(user.id, 'create', 'team', team!.id);
  return { ok: true, team: { id: team!.id, name: team!.name, shortName: team!.shortName, sportId: team!.sportId } };
}

/** Saves the tournament with everything the wizard collected in `meta`. It does not create fixtures. */
export async function publishTournament(input: unknown): Promise<{ ok: true; id: string; plan: TournamentMeta['plan'] } | Failure> {
  const user = await requireRole('admin');
  const parsed = tournamentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const v = parsed.data;
  const db = getDb();

  const [sport] = await db.select().from(sports).where(eq(sports.id, v.sportId)).limit(1);
  if (!sport) return { ok: false, error: 'Unknown sport.' };
  const [venueRows, teamRows] = await Promise.all([
    v.venueIds.length ? db.select().from(venues).where(inArray(venues.id, v.venueIds)) : Promise.resolve([]),
    db.select().from(teams).where(inArray(teams.id, v.teamIds)),
  ]);
  if (venueRows.length !== new Set(v.venueIds).size) return { ok: false, error: 'A selected venue no longer exists.' };
  if (teamRows.length !== new Set(v.teamIds).size || teamRows.some((t) => t.sportId !== sport.id)) {
    return { ok: false, error: `Every team must be a ${sport.name} team.` };
  }

  const perTeam = v.formatKey === 'lk' ? fitMatchesPerTeam(teamRows.length, v.matchesPerTeam) : undefined;
  const plan = planTournament({ formatKey: v.formatKey, teams: teamRows.length, qualify: v.qualify, matchesPerTeam: perTeam, perDay: v.schedule.perDay, restDay: v.schedule.restDay, startDate: v.startDate, endDate: v.endDate });
  const byId = new Map(teamRows.map((t) => [t.id, t]));
  const venueById = new Map(venueRows.map((x) => [x.id, x]));
  const meta: TournamentMeta = {
    version: 1,
    formatKey: v.formatKey,
    ...(sport.key === 'cricket' && v.overs ? { overs: v.overs } : {}),
    ...(sport.key === 'foosball' ? { rules: v.rules ?? { ...FOOSBALL_DEFAULTS } } : {}),
    venues: v.venueIds.map((id) => ({ id, name: venueById.get(id)!.name })),
    points: v.points,
    qualify: v.qualify,
    ...(perTeam ? { matchesPerTeam: perTeam } : {}),
    tiebreak: v.tiebreak,
    teams: v.teamIds.map((id) => ({ id, name: byId.get(id)!.name })),
    schedule: { ...v.schedule, startDate: v.startDate, endDate: v.endDate },
    plan: { leagueMatches: plan.leagueMatches, knockoutMatches: plan.knockoutMatches, totalMatches: plan.totalMatches, matchDays: plan.matchDays, lastMatchDate: plan.lastMatchDate },
    fixturesGenerated: false,
    tz: v.tzOffset,
  };

  const [row] = await db
    .insert(tournaments)
    .values({
      sportId: sport.id,
      name: v.name,
      visibility: v.visibility,
      format: FORMATS[v.formatKey].column,
      startsAt: toInstant(v.startDate, '00:00', v.tzOffset),
      endsAt: toInstant(v.endDate, '23:59', v.tzOffset),
      meta: meta as unknown as Record<string, unknown>,
    })
    .returning({ id: tournaments.id });
  await audit(user.id, 'create', 'tournament', row!.id, { teams: teamRows.length, format: v.formatKey });
  // a Table tournament gets its fixtures right away; a Custom one waits for the organiser's list
  if (v.formatKey === 'lk') await rebuildFixtures(row!.id);
  revalidatePath('/tournaments');
  return { ok: true, id: row!.id, plan: meta.plan };
}

/** Creates one match with its rules, playing XIs, captains, keepers, scorer and visibility. */
export async function createMatchAction(input: unknown): Promise<{ ok: true; id: string; sportKey: string } | Failure> {
  const user = await requireRole('admin');
  const parsed = matchInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const v = parsed.data;
  const db = getDb();

  const teamRows = await db.select().from(teams).where(inArray(teams.id, [v.teamAId, v.teamBId]));
  if (teamRows.length !== 2) return { ok: false, error: 'Pick two teams.' };
  const [sport] = await db.select().from(sports).where(eq(sports.id, teamRows[0]!.sportId)).limit(1);
  if (!sport || sport.key !== 'cricket' || teamRows[1]!.sportId !== sport.id) return { ok: false, error: 'Both teams must be cricket teams.' };

  if (v.tournamentId) {
    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, v.tournamentId)).limit(1);
    if (!t || t.sportId !== sport.id) return { ok: false, error: 'That tournament is not a cricket tournament.' };
  }

  let venueName: string | null = null;
  if (v.venueId) {
    const [venue] = await db.select().from(venues).where(eq(venues.id, v.venueId)).limit(1);
    if (!venue) return { ok: false, error: 'That venue no longer exists.' };
    venueName = venue.name;
  }

  const [scorer] = await db.select().from(users).where(eq(users.id, v.scorerId)).limit(1);
  if (!scorer) return { ok: false, error: 'Assign a scorer.' };

  // Every chosen player must be on that team's roster.
  const roster = await db
    .select({ teamId: teamMembers.teamId, playerId: teamMembers.playerId })
    .from(teamMembers)
    .where(inArray(teamMembers.teamId, [v.teamAId, v.teamBId]));
  const onRoster = (teamId: string, ids: string[]) => ids.every((id) => roster.some((r) => r.teamId === teamId && r.playerId === id));
  if (!onRoster(v.teamAId, v.lineups.a.playerIds) || !onRoster(v.teamBId, v.lineups.b.playerIds)) {
    return { ok: false, error: 'A selected player is not on that team’s roster.' };
  }

  const { rules } = v;
  const [match] = await db
    .insert(matches)
    .values({
      sportId: sport.id,
      tournamentId: v.tournamentId,
      teamAId: v.teamAId,
      teamBId: v.teamBId,
      venue: venueName,
      scheduledAt: toInstant(v.date, v.time, v.tzOffset),
      config: {
        overs: rules.overs,
        ballsPerOver: 6,
        powerplayOvers: rules.powerplay,
        playersPerSide: rules.playersPerSide,
        maxOversPerBowler: Math.ceil(rules.overs / 5),
        freeHit: rules.freeHit,
        wideReball: rules.wideReball,
        superOver: rules.superOver,
        dls: rules.dls,
      },
      assignedScorerId: v.scorerId,
      visibility: v.visibility,
      meta: { umpires: v.umpires.filter(Boolean) },
    })
    .returning({ id: matches.id });

  const rows = (['a', 'b'] as const).flatMap((side) => {
    const l = v.lineups[side];
    const teamId = side === 'a' ? v.teamAId : v.teamBId;
    return l.playerIds.map((playerId, i) => ({ matchId: match!.id, teamId, playerId, position: i + 1, isCaptain: l.captainId === playerId, isKeeper: l.keeperId === playerId }));
  });
  try {
    await db.insert(matchLineups).values(rows);
  } catch {
    // Do not leave a match without its XI behind.
    await db.delete(matches).where(eq(matches.id, match!.id));
    return { ok: false, error: 'Could not save the playing XI. Nothing was created; try again.' };
  }
  await audit(user.id, 'create', 'match', match!.id, { tournamentId: v.tournamentId });
  revalidatePath('/');
  revalidatePath('/matches');
  revalidatePath('/tournaments');
  return { ok: true, id: match!.id, sportKey: sport.key };
}
