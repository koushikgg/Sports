'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, count, eq, getDb, inArray, matches, sql, sports, teams, tournaments, venues } from '@sports/db';
import { FORMATS, fitMatchesPerTeam, matchesPerTeamOptions, minTeamsFor, tournamentEditSchema, type TournamentMeta } from '@sports/shared';
import { rebuildFixtures, tournamentStarted } from '@sports/scoring';
import { planTournament, toInstant } from '@sports/sports-engine/src/tournament-plan';
import { audit, requireRole } from '@/lib/guard';

const uuid = z.string().uuid();
const refresh = (id: string) => { revalidatePath(`/tournaments/${id}`); revalidatePath('/tournaments'); };

async function load(id: string) {
  const [row] = await getDb()
    .select({ t: tournaments, sportId: sports.id, sportName: sports.name, sportKey: sports.key })
    .from(tournaments)
    .innerJoin(sports, eq(sports.id, tournaments.sportId))
    .where(eq(tournaments.id, id))
    .limit(1);
  const meta = row?.t.meta as unknown as TournamentMeta | undefined;
  return row && meta?.teams ? { ...row, meta } : null;
}

/** The planned match counts follow the team list. */
function replan(meta: TournamentMeta, teamCount: number): TournamentMeta {
  // matches per team follows the team count: a value that no longer fits drops to the nearest that does
  const perTeam = meta.formatKey === 'lk' ? fitMatchesPerTeam(teamCount, meta.matchesPerTeam) : undefined;
  const { matchesPerTeam: _old, ...rest } = meta;
  meta = { ...rest, ...(perTeam ? { matchesPerTeam: perTeam } : {}) };
  const p = planTournament({ formatKey: meta.formatKey, teams: teamCount, qualify: meta.qualify, matchesPerTeam: perTeam, perDay: meta.schedule.perDay, restDay: meta.schedule.restDay, startDate: meta.schedule.startDate, endDate: meta.schedule.endDate });
  return { ...meta, plan: { leagueMatches: p.leagueMatches, knockoutMatches: p.knockoutMatches, totalMatches: p.totalMatches, matchDays: p.matchDays, lastMatchDate: p.lastMatchDate } };
}

const save = (id: string, meta: TournamentMeta) => getDb().update(tournaments).set({ meta: meta as unknown as Record<string, unknown> }).where(eq(tournaments.id, id));

/** Admin only. Adds an existing team of the tournament's sport, or creates one by name and adds it. */
export async function addTournamentTeam(input: { tournamentId: string; teamId?: string; name?: string; tzOffset?: number }): Promise<{ error?: string; team?: { id: string; name: string }; cleared?: number; regenerated?: boolean }> {
  const admin = await requireRole('admin');
  const tournamentId = uuid.parse(input.tournamentId);
  const found = await load(tournamentId);
  if (!found) return { error: 'This tournament has no saved setup to add teams to.' };
  if (await tournamentStarted(tournamentId)) return { error: 'The tournament has started, so teams can’t be added.' };
  const db = getDb();

  let team: { id: string; name: string } | undefined;
  if (input.teamId) {
    const [t] = await db.select().from(teams).where(and(eq(teams.id, uuid.parse(input.teamId)), eq(teams.sportId, found.sportId))).limit(1);
    if (!t) return { error: `That isn’t a ${found.sportName} team.` };
    team = { id: t.id, name: t.name };
  } else {
    const name = (input.name ?? '').trim();
    if (!name || name.length > 60) return { error: 'Give the team a name (up to 60 characters).' };
    const [dupe] = await db.select().from(teams).where(and(eq(teams.sportId, found.sportId), sql`lower(${teams.name}) = ${name.toLowerCase()}`)).limit(1);
    if (dupe) team = { id: dupe.id, name: dupe.name };
    else {
      const [made] = await db.insert(teams).values({ sportId: found.sportId, name }).returning({ id: teams.id, name: teams.name });
      team = made!;
      await audit(admin.id, 'create', 'team', team.id);
    }
  }
  if (found.meta.teams.some((t) => t.id === team!.id)) return { error: `${team.name} is already in this tournament.` };

  const next = replan({ ...found.meta, teams: [...found.meta.teams, team], ...(input.tzOffset !== undefined ? { tz: input.tzOffset } : {}) }, found.meta.teams.length + 1);
  await save(tournamentId, next);
  await audit(admin.id, 'add_tournament_team', 'tournament', tournamentId, { teamId: team.id });
  // fixtures were made for the old list of teams: a Table tournament makes them again, a Custom one waits for a new list
  const r = await rebuildFixtures(tournamentId);
  refresh(tournamentId);
  return { team, cleared: r.removed, regenerated: found.meta.formatKey === 'lk' && !r.locked };
}

/** Admin only. Before the tournament starts the fixtures are cleared with the change. After it starts, a team with matches stays. A team the format needs stays too. */
export async function removeTournamentTeam(input: { tournamentId: string; teamId: string; tzOffset?: number }): Promise<{ error?: string; cleared?: number; regenerated?: boolean }> {
  const admin = await requireRole('admin');
  const tournamentId = uuid.parse(input.tournamentId);
  const teamId = uuid.parse(input.teamId);
  const found = await load(tournamentId);
  if (!found) return { error: 'This tournament has no saved setup.' };
  const team = found.meta.teams.find((t) => t.id === teamId);
  if (!team) return { error: 'That team is not in this tournament.' };

  // before the tournament starts the fixtures are cleared with the change, so a team's matches do not hold it in
  const started = await tournamentStarted(tournamentId);
  if (started) {
    const [used] = await getDb().select({ n: count() }).from(matches).where(and(eq(matches.tournamentId, tournamentId), sql`(${matches.teamAId} = ${teamId} or ${matches.teamBId} = ${teamId})`));
    const n = Number(used?.n ?? 0);
    if (n > 0) return { error: `${team.name} has ${n} match${n === 1 ? '' : 'es'} in this tournament, which has started, so it can’t be removed.` };
  }
  const min = minTeamsFor(found.meta.formatKey, found.meta.qualify);
  if (found.meta.teams.length - 1 < min) return { error: `This format needs at least ${min} teams.` };

  const remaining = found.meta.teams.filter((t) => t.id !== teamId);
  await save(tournamentId, replan({ ...found.meta, teams: remaining, ...(input.tzOffset !== undefined ? { tz: input.tzOffset } : {}) }, remaining.length));
  await audit(admin.id, 'remove_tournament_team', 'tournament', tournamentId, { teamId });
  const r = started ? { removed: 0, locked: true } : await rebuildFixtures(tournamentId);
  refresh(tournamentId);
  return { cleared: r.removed, regenerated: found.meta.formatKey === 'lk' && !r.locked };
}

/**
 * Admin only. Saves the tournament's settings (name, dates, venues, format, rules, schedule).
 * Once the tournament has started its format, qualifiers, overs and schedule are locked in; the rest can still change.
 * Changing the format before it starts removes the fixtures, since they were made for the old format.
 */
export async function updateTournament(raw: unknown): Promise<{ error?: string; cleared?: number; regenerated?: boolean }> {
  const admin = await requireRole('admin');
  const parsed = tournamentEditSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form.' };
  const v = parsed.data;
  const found = await load(v.tournamentId);
  if (!found) return { error: 'This tournament has no saved setup to edit.' };
  const { meta } = found;
  const cricket = found.sportKey === 'cricket';
  const started = await tournamentStarted(v.tournamentId);

  const sameSchedule = v.schedule.perDay === meta.schedule.perDay && v.schedule.firstMatchTime === meta.schedule.firstMatchTime && v.schedule.restDay === meta.schedule.restDay;
  if (started) {
    const locked = [
      v.formatKey !== meta.formatKey && 'the format',
      v.qualify !== meta.qualify && 'how many qualify',
      cricket && (v.overs ?? meta.overs) !== meta.overs && 'the overs',
      !sameSchedule && 'the daily schedule',
      meta.formatKey === 'lk' && fitMatchesPerTeam(meta.teams.length, v.matchesPerTeam) !== fitMatchesPerTeam(meta.teams.length, meta.matchesPerTeam) && 'the matches per team',
    ].filter(Boolean);
    if (locked.length) return { error: `The tournament has started, so ${locked.join(' and ')} can’t change.` };
  }
  const formatChanged = v.formatKey !== meta.formatKey;
  const table0 = v.formatKey === 'lk';
  if (table0 && v.matchesPerTeam !== undefined && !matchesPerTeamOptions(meta.teams.length).includes(v.matchesPerTeam)) {
    return { error: `${v.matchesPerTeam} matches per team doesn’t fit ${meta.teams.length} teams. Pick one of ${matchesPerTeamOptions(meta.teams.length).join(', ')}.` };
  }
  const need = minTeamsFor(v.formatKey, v.qualify);
  if ((formatChanged || v.qualify !== meta.qualify) && meta.teams.length < need) {
    return { error: `${FORMATS[v.formatKey].label} needs at least ${need} teams, and this tournament has ${meta.teams.length}.` };
  }

  const db = getDb();
  const venueRows = v.venueIds.length ? await db.select().from(venues).where(inArray(venues.id, v.venueIds)) : [];
  if (venueRows.length !== new Set(v.venueIds).size) return { error: 'A selected venue no longer exists.' };
  const byId = new Map(venueRows.map((x) => [x.id, x]));

  const overs = cricket ? (v.overs ?? meta.overs ?? 20) : undefined;
  const perTeam = table0 ? fitMatchesPerTeam(meta.teams.length, v.matchesPerTeam) : undefined;
  const plan = planTournament({ formatKey: v.formatKey, teams: meta.teams.length, qualify: v.qualify, matchesPerTeam: perTeam, perDay: v.schedule.perDay, restDay: v.schedule.restDay, startDate: v.startDate, endDate: v.endDate });
  const { matchesPerTeam: _was, ...metaBase } = meta;
  const next: TournamentMeta = {
    ...metaBase,
    formatKey: v.formatKey,
    ...(perTeam ? { matchesPerTeam: perTeam } : {}),
    ...(overs ? { overs } : {}),
    venues: v.venueIds.map((id) => ({ id, name: byId.get(id)!.name })),
    points: v.points,
    qualify: v.qualify,
    tiebreak: v.tiebreak,
    schedule: { ...meta.schedule, ...v.schedule, startDate: v.startDate, endDate: v.endDate },
    tz: v.tzOffset,
    plan: { leagueMatches: plan.leagueMatches, knockoutMatches: plan.knockoutMatches, totalMatches: plan.totalMatches, matchDays: plan.matchDays, lastMatchDate: plan.lastMatchDate },
  };
  if (!cricket) delete next.overs;

  await db
    .update(tournaments)
    .set({
      name: v.name,
      visibility: v.visibility,
      format: FORMATS[v.formatKey].column,
      startsAt: toInstant(v.startDate, '00:00', v.tzOffset),
      endsAt: toInstant(v.endDate, '23:59', v.tzOffset),
      meta: next as unknown as Record<string, unknown>,
    })
    .where(eq(tournaments.id, v.tournamentId));

  // Before the tournament starts a Table's fixtures are made again whenever something they depend on changes. Changing the
  // type clears the old ones (a Custom tournament waits for a pasted list). Otherwise new overs just follow into the matches.
  let cleared = 0;
  const table = v.formatKey === 'lk';
  const scheduleChanged =
    v.startDate !== meta.schedule.startDate || !sameSchedule || v.qualify !== meta.qualify || overs !== meta.overs ||
    v.venueIds.join() !== meta.venues.map((x) => x.id).join() || perTeam !== fitMatchesPerTeam(meta.teams.length, meta.matchesPerTeam);
  if (!started && (formatChanged || (table && scheduleChanged))) cleared = (await rebuildFixtures(v.tournamentId)).removed;
  else if (!started && overs && overs !== meta.overs) {
    await db
      .update(matches)
      .set({ config: sql`${matches.config} || jsonb_build_object('overs', ${overs}::int, 'powerplayOvers', least(coalesce((${matches.config}->>'powerplayOvers')::int, 6), ${overs}::int), 'maxOversPerBowler', ceil(${overs}::numeric / 5)::int)` })
      .where(and(eq(matches.tournamentId, v.tournamentId), eq(matches.status, 'scheduled'), eq(matches.lastSeq, 0)));
  }
  await audit(admin.id, 'update', 'tournament', v.tournamentId, { formatChanged, cleared, visibility: v.visibility });
  refresh(v.tournamentId);
  revalidatePath('/matches');
  return { cleared, regenerated: table && !started && (formatChanged || scheduleChanged) };
}
