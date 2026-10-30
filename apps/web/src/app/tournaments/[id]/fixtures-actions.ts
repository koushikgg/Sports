'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq, getDb, tournaments } from '@sports/db';
import { advanceBracket, clearFixtures, rebuildFixtures } from '@sports/scoring';
import type { BracketFixture, TournamentMeta } from '@sports/shared';
import { parseFixtureJson, type FixtureParse } from '@sports/sports-engine/src/fixture-import';
import { loadFixtureContext } from '@/lib/fixture-context';
import { audit, requireRole } from '@/lib/guard';

const LOCKED = 'The tournament has started, so its fixtures are locked.';
const TABLE = 'This is a Table tournament, so its fixtures are made for you. Switch it to Custom in Edit tournament to paste your own.';
const input = z.object({ tournamentId: z.string().uuid(), json: z.string().max(400_000), tzOffset: z.number().int().min(-840).max(840) });

/** Checks a pasted fixture list against the tournament and says, row by row, what would be created. Saves nothing. */
export async function previewFixtures(raw: unknown): Promise<{ error?: string; parse?: FixtureParse }> {
  await requireRole('admin');
  const p = input.safeParse(raw);
  if (!p.success) return { error: 'Paste the JSON first.' };
  const loaded = await loadFixtureContext(p.data.tournamentId, p.data.tzOffset);
  if (!loaded) return { error: 'This tournament has no saved setup.' };
  if (loaded.started) return { error: LOCKED };
  if (loaded.meta.formatKey === 'lk') return { error: TABLE };
  // pasting again replaces the current fixtures, so they are checked against an empty schedule
  return { parse: parseFixtureJson(p.data.json, { ...loaded.ctx, existing: [], bracket: [] }) };
}

/**
 * Saves the checked fixtures with the tournament. The paste is checked again here; nothing from the preview is trusted.
 * Cricket fixtures whose teams are known become scheduled matches at once, and the rest wait for their winners.
 * A sport without scoring keeps its fixtures as a schedule only.
 */
export async function createFixtures(raw: unknown): Promise<{ error?: string; created?: number; skipped?: number; matches?: number; replaced?: number }> {
  const admin = await requireRole('admin');
  const p = input.safeParse(raw);
  if (!p.success) return { error: 'Paste the JSON first.' };
  const loaded = await loadFixtureContext(p.data.tournamentId, p.data.tzOffset);
  if (!loaded) return { error: 'This tournament has no saved setup.' };

  if (loaded.started) return { error: LOCKED };
  if (loaded.meta.formatKey === 'lk') return { error: TABLE };
  const parse = parseFixtureJson(p.data.json, { ...loaded.ctx, existing: [], bracket: [] });
  if (parse.fatal) return { error: parse.fatal };
  if (parse.counts.error > 0) return { error: `Fix the ${parse.counts.error} row${parse.counts.error === 1 ? '' : 's'} with errors first.` };
  const rows = parse.rows.filter((r) => !r.skip);
  if (rows.length === 0) return { error: 'Every fixture is already in this tournament.' };

  // replace: the new list stands in for whatever was there (nothing has been played)
  const replaced = await clearFixtures(p.data.tournamentId);
  const added: BracketFixture[] = rows.map((r) => ({ no: r.no, round: r.round, date: r.date, time: r.time, tz: p.data.tzOffset, venue: r.venue, a: r.a!, b: r.b!, matchId: null, ...(r.group ? { group: r.group } : {}) }));
  const { bracket: _old, byes: _oldByes, groups: _oldGroups, ...base } = loaded.meta;
  const meta: TournamentMeta = { ...base, fixturesGenerated: true, bracket: added, ...(parse.byes.length ? { byes: parse.byes } : {}), ...(parse.groups.length ? { groups: parse.groups.map((g) => ({ name: g.name, teamIds: g.teams.map((t) => t.id), ...(g.from ? { from: g.from } : {}) })) } : {}) };
  await getDb().update(tournaments).set({ meta: meta as unknown as Record<string, unknown> }).where(eq(tournaments.id, p.data.tournamentId));
  const made = await advanceBracket(p.data.tournamentId);

  await audit(admin.id, 'import_fixtures', 'tournament', p.data.tournamentId, { created: rows.length, matches: made, replaced });
  revalidatePath(`/tournaments/${p.data.tournamentId}`);
  revalidatePath('/tournaments');
  revalidatePath('/matches');
  return { created: rows.length, skipped: parse.counts.skip, matches: made, replaced };
}

/** Removes every fixture so a new list can be made. Only before the tournament starts. */
export async function clearTournamentFixtures(raw: unknown): Promise<{ error?: string; removed?: number }> {
  const admin = await requireRole('admin');
  const p = z.object({ tournamentId: z.string().uuid() }).safeParse(raw);
  if (!p.success) return { error: 'Unknown tournament.' };
  const loaded = await loadFixtureContext(p.data.tournamentId, 0);
  if (!loaded) return { error: 'This tournament has no saved setup.' };
  if (loaded.started) return { error: LOCKED };
  const removed = await clearFixtures(p.data.tournamentId);
  await audit(admin.id, 'clear_fixtures', 'tournament', p.data.tournamentId, { removed });
  revalidatePath(`/tournaments/${p.data.tournamentId}`);
  revalidatePath('/tournaments');
  revalidatePath('/matches');
  return { removed };
}

/** Makes a Table tournament's fixtures again from its teams and settings. Only before the tournament starts. */
export async function regenerateTableFixtures(raw: unknown): Promise<{ error?: string; matches?: number }> {
  const admin = await requireRole('admin');
  const p = z.object({ tournamentId: z.string().uuid(), tzOffset: z.number().int().min(-840).max(840) }).safeParse(raw);
  if (!p.success) return { error: 'Unknown tournament.' };
  const loaded = await loadFixtureContext(p.data.tournamentId, 0);
  if (!loaded) return { error: 'This tournament has no saved setup.' };
  if (loaded.started) return { error: LOCKED };
  if (loaded.meta.formatKey !== 'lk') return { error: 'Only a Table tournament makes its own fixtures.' };
  await getDb().update(tournaments).set({ meta: { ...loaded.meta, tz: p.data.tzOffset } as unknown as Record<string, unknown> }).where(eq(tournaments.id, p.data.tournamentId));
  const r = await rebuildFixtures(p.data.tournamentId);
  await audit(admin.id, 'regenerate_fixtures', 'tournament', p.data.tournamentId, { removed: r.removed, matches: r.generated });
  revalidatePath(`/tournaments/${p.data.tournamentId}`);
  revalidatePath('/tournaments');
  revalidatePath('/matches');
  return { matches: r.generated };
}
