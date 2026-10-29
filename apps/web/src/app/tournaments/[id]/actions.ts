'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, count, eq, getDb, matches, sql, sports, teams, tournaments } from '@sports/db';
import { minTeamsFor, type TournamentMeta } from '@sports/shared';
import { planTournament } from '@sports/sports-engine/src/tournament-plan';
import { audit, requireRole } from '@/lib/guard';

const uuid = z.string().uuid();
const refresh = (id: string) => { revalidatePath(`/tournaments/${id}`); revalidatePath('/tournaments'); };

async function load(id: string) {
  const [row] = await getDb()
    .select({ t: tournaments, sportId: sports.id, sportName: sports.name })
    .from(tournaments)
    .innerJoin(sports, eq(sports.id, tournaments.sportId))
    .where(eq(tournaments.id, id))
    .limit(1);
  const meta = row?.t.meta as unknown as TournamentMeta | undefined;
  return row && meta?.teams ? { ...row, meta } : null;
}

/** The planned match counts follow the team list. */
function replan(meta: TournamentMeta, teamCount: number): TournamentMeta {
  const p = planTournament({ formatKey: meta.formatKey, teams: teamCount, qualify: meta.qualify, perDay: meta.schedule.perDay, restDay: meta.schedule.restDay, startDate: meta.schedule.startDate, endDate: meta.schedule.endDate });
  return { ...meta, plan: { leagueMatches: p.leagueMatches, knockoutMatches: p.knockoutMatches, totalMatches: p.totalMatches, matchDays: p.matchDays, lastMatchDate: p.lastMatchDate } };
}

const save = (id: string, meta: TournamentMeta) => getDb().update(tournaments).set({ meta: meta as unknown as Record<string, unknown> }).where(eq(tournaments.id, id));

/** Admin only. Adds an existing team of the tournament's sport, or creates one by name and adds it. */
export async function addTournamentTeam(input: { tournamentId: string; teamId?: string; name?: string }): Promise<{ error?: string; team?: { id: string; name: string } }> {
  const admin = await requireRole('admin');
  const tournamentId = uuid.parse(input.tournamentId);
  const found = await load(tournamentId);
  if (!found) return { error: 'This tournament has no saved setup to add teams to.' };
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

  const next = replan({ ...found.meta, teams: [...found.meta.teams, team] }, found.meta.teams.length + 1);
  await save(tournamentId, next);
  await audit(admin.id, 'add_tournament_team', 'tournament', tournamentId, { teamId: team.id });
  refresh(tournamentId);
  return { team };
}

/** Admin only. A team with matches in the tournament stays, and so does a team the format needs. */
export async function removeTournamentTeam(input: { tournamentId: string; teamId: string }): Promise<{ error?: string }> {
  const admin = await requireRole('admin');
  const tournamentId = uuid.parse(input.tournamentId);
  const teamId = uuid.parse(input.teamId);
  const found = await load(tournamentId);
  if (!found) return { error: 'This tournament has no saved setup.' };
  const team = found.meta.teams.find((t) => t.id === teamId);
  if (!team) return { error: 'That team is not in this tournament.' };

  const [used] = await getDb().select({ n: count() }).from(matches).where(and(eq(matches.tournamentId, tournamentId), sql`(${matches.teamAId} = ${teamId} or ${matches.teamBId} = ${teamId})`));
  const n = Number(used?.n ?? 0);
  if (n > 0) return { error: `${team.name} has ${n} match${n === 1 ? '' : 'es'} in this tournament, so it can’t be removed. Delete those matches first.` };
  const min = minTeamsFor(found.meta.formatKey);
  if (found.meta.teams.length - 1 < min) return { error: `This format needs at least ${min} teams.` };

  const remaining = found.meta.teams.filter((t) => t.id !== teamId);
  await save(tournamentId, replan({ ...found.meta, teams: remaining }, remaining.length));
  await audit(admin.id, 'remove_tournament_team', 'tournament', tournamentId, { teamId });
  refresh(tournamentId);
  return {};
}
