'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { count, eq, getDb, users } from '@sports/db';
import { ROLES } from '@sports/shared';
import { unusablePasswordHash } from '@/lib/passwords';
import { audit, requireRole } from '@/lib/guard';

const done = (kind: 'notice' | 'error', text: string): never => {
  revalidatePath('/admin/users');
  redirect(`/admin/users?${kind}=${encodeURIComponent(text)}`);
};

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  name: z.string().trim().max(80).optional(),
  role: z.enum(ROLES),
});

/** Invites a person: creates the account their Google email will sign in to. */
export async function inviteUser(formData: FormData) {
  const admin = await requireRole('admin');
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return done('error', parsed.error.issues[0]?.message ?? 'Check the form.');
  const { email, role } = parsed.data;
  const name = parsed.data.name || email.split('@')[0]!;

  const db = getDb();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return done('error', `${email} already has an account.`);

  const [row] = await db.insert(users).values({ email, name, role, passwordHash: await unusablePasswordHash() }).returning({ id: users.id });
  await audit(admin.id, 'invite', 'user', row?.id, { email, role });
  return done('notice', `Invited ${email} as ${role}. They can now sign in with that Google account.`);
}

const adminCount = async () => Number((await getDb().select({ n: count() }).from(users).where(eq(users.role, 'admin')))[0]?.n ?? 0);

export async function setUserRole(formData: FormData) {
  const admin = await requireRole('admin');
  const id = String(formData.get('id'));
  const role = z.enum(ROLES).safeParse(formData.get('role'));
  if (!role.success) return done('error', 'Unknown role.');
  if (id === admin.id) return done('error', 'You cannot change your own role.');

  const db = getDb();
  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) return done('error', 'That person no longer exists.');
  if (target.role === 'admin' && role.data !== 'admin' && (await adminCount()) <= 1) return done('error', 'There must be at least one admin.');

  await db.update(users).set({ role: role.data }).where(eq(users.id, id));
  await audit(admin.id, 'set_role', 'user', id, { role: role.data });
  return done('notice', `${target.email} is now ${role.data}.`);
}

export async function removeUser(formData: FormData) {
  const admin = await requireRole('admin');
  const id = String(formData.get('id'));
  if (id === admin.id) return done('error', 'You cannot remove yourself.');

  const db = getDb();
  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) return done('error', 'That person no longer exists.');
  if (target.role === 'admin' && (await adminCount()) <= 1) return done('error', 'There must be at least one admin.');

  try {
    await db.delete(users).where(eq(users.id, id));
  } catch {
    // They have scored matches or been assigned to them, so their history still points at them.
    return done('error', `${target.email} has scoring history and cannot be removed. Change their role instead.`);
  }
  await audit(admin.id, 'remove', 'user', id, { email: target.email });
  return done('notice', `Removed ${target.email}.`);
}
