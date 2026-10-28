'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq, getDb, tournaments } from '@sports/db';
import { audit, requireRole } from '@/lib/guard';

const schema = z.object({
  sportId: z.string().uuid(),
  name: z.string().trim().min(1),
  format: z.enum(['round_robin', 'knockout', 'league_knockout', 'friendly']),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
});

export async function createTournament(formData: FormData) {
  const user = await requireRole('admin');
  const d = schema.parse(Object.fromEntries(formData));
  const [row] = await getDb()
    .insert(tournaments)
    .values({
      sportId: d.sportId,
      name: d.name,
      format: d.format,
      startsAt: d.startsAt ? new Date(d.startsAt) : null,
      endsAt: d.endsAt ? new Date(d.endsAt) : null,
    })
    .returning({ id: tournaments.id });
  await audit(user.id, 'create', 'tournament', row?.id);
  revalidatePath('/admin/tournaments');
}

export async function deleteTournament(formData: FormData) {
  const user = await requireRole('admin');
  const id = String(formData.get('id'));
  await getDb().delete(tournaments).where(eq(tournaments.id, id));
  await audit(user.id, 'delete', 'tournament', id);
  revalidatePath('/admin/tournaments');
}
