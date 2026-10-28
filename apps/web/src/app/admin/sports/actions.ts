'use server';
import { revalidatePath } from 'next/cache';
import { eq, getDb, sports } from '@sports/db';
import { audit, requireRole } from '@/lib/guard';

export async function toggleSport(formData: FormData) {
  const user = await requireRole('admin');
  const id = String(formData.get('id'));
  const enabled = formData.get('enabled') === 'true';
  await getDb().update(sports).set({ enabled }).where(eq(sports.id, id));
  await audit(user.id, enabled ? 'enable' : 'disable', 'sport', id);
  revalidatePath('/admin/sports');
  revalidatePath('/sports');
}
