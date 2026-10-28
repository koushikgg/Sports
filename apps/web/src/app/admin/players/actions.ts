'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq, getDb, players } from '@sports/db';
import { audit, requireRole } from '@/lib/guard';

const playerSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email().optional().or(z.literal('')),
  employeeId: z.string().trim().optional(),
});

export async function createPlayer(formData: FormData) {
  const user = await requireRole('admin');
  const d = playerSchema.parse(Object.fromEntries(formData));
  const [row] = await getDb()
    .insert(players)
    .values({ name: d.name, email: d.email || null, employeeId: d.employeeId || null })
    .returning({ id: players.id });
  await audit(user.id, 'create', 'player', row?.id);
  revalidatePath('/admin/players');
}

/** CSV lines: name[,email[,employeeId]] — a header row starting with "name" is skipped. */
export async function importPlayers(formData: FormData) {
  const user = await requireRole('admin');
  const rows = String(formData.get('csv') ?? '')
    .split(/\r?\n/)
    .map((l) => l.split(',').map((c) => c.trim()))
    .filter((c) => c[0] && c[0].toLowerCase() !== 'name')
    .map(([name, email, employeeId]) => ({
      name: name!,
      email: email || null,
      employeeId: employeeId || null,
    }));
  if (rows.length) await getDb().insert(players).values(rows);
  await audit(user.id, 'import', 'player', undefined, { count: rows.length });
  revalidatePath('/admin/players');
}

export async function deletePlayer(formData: FormData) {
  const user = await requireRole('admin');
  const id = String(formData.get('id'));
  await getDb().delete(players).where(eq(players.id, id));
  await audit(user.id, 'delete', 'player', id);
  revalidatePath('/admin/players');
}
