'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq, getDb, inArray, matchLineups, matches, players, teamMembers } from '@sports/db';
import { canScoreMatch } from '@sports/shared';
import { audit, requireRole } from '@/lib/guard';
import { getShellUser } from '@/lib/shell-user';

const input = z.object({ matchId: z.string().uuid(), a: z.array(z.string().uuid()).max(2), b: z.array(z.string().uuid()).max(2) });

/**
 * Saves who plays a foosball match: up to two players a side, from each team's roster (two when the team has two or more).
 * Only before the first goal, and only by someone who may score the match. The lineup becomes each team's squad.
 */
export async function setFoosballLineup(raw: unknown): Promise<{ error?: string }> {
  await requireRole('admin', 'scorer');
  const p = input.safeParse(raw);
  if (!p.success) return { error: 'Pick up to two players for each team.' };
  const { user } = await getShellUser();
  const db = getDb();
  const [m] = await db.select().from(matches).where(eq(matches.id, p.data.matchId)).limit(1);
  if (!m) return { error: 'Match not found.' };
  if (!canScoreMatch(user ? { id: user.id, role: user.role, managed: user.managed } : null, m)) return { error: 'You can’t score this match.' };
  if (m.lastSeq > 0 || m.status !== 'scheduled') return { error: 'The match has started, so its players are locked.' };

  const rows = await db.select({ teamId: teamMembers.teamId, id: players.id }).from(teamMembers).innerJoin(players, eq(players.id, teamMembers.playerId)).where(inArray(teamMembers.teamId, [m.teamAId, m.teamBId]));
  const cfgPps = (m.config as { playersPerSide?: number } | null)?.playersPerSide;
  const want = cfgPps === 1 || cfgPps === 2 ? cfgPps : 1;
  const roster = (t: string) => new Set(rows.filter((r) => r.teamId === t).map((r) => r.id));
  for (const [teamId, ids] of [[m.teamAId, p.data.a], [m.teamBId, p.data.b]] as const) {
    const r = roster(teamId);
    const name = teamId === m.teamAId ? 'The first team' : 'The second team';
    if (r.size < want) return { error: want === 2 ? `${name} needs 2 players for a doubles match and has ${r.size}.` : 'Every team needs at least one player before the match can start.' };
    if (new Set(ids).size !== ids.length || ids.some((x) => !r.has(x))) return { error: 'Pick players from the team’s own players.' };
    // the number to pick: the match's setting, or for matches made before it existed, two (or all there are)
    const need = cfgPps === 1 || cfgPps === 2 ? cfgPps : Math.min(2, r.size);
    if (ids.length !== need) return { error: need === 1 ? 'Pick one player for each team.' : 'Pick two players for each team.' };
  }
  await db.delete(matchLineups).where(eq(matchLineups.matchId, m.id));
  const values = [...p.data.a.map((id, i) => ({ matchId: m.id, teamId: m.teamAId, playerId: id, position: i + 1 })), ...p.data.b.map((id, i) => ({ matchId: m.id, teamId: m.teamBId, playerId: id, position: i + 1 }))];
  if (values.length) await db.insert(matchLineups).values(values);
  await audit(user!.id, 'set_lineup', 'match', m.id, { a: p.data.a.length, b: p.data.b.length });
  revalidatePath('/matches');
  return {};
}
