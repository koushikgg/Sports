'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq, getDb, players, users } from '@sports/db';
import { auth } from '@/auth';

const schema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(60, 'Keep your name under 60 characters.'),
  /** '' keeps the photo, 'remove' deletes it, otherwise a cropped JPEG data URL from the browser. */
  avatar: z.string().max(200_000, 'That photo is too large.').regex(/^(|remove|data:image\/jpeg;base64,[A-Za-z0-9+/=]+)$/, 'Use a JPEG, PNG or WebP photo.'),
});

/** Saves the signed-in person's own name and photo. Never takes a user id from the client. */
export async function saveProfile(formData: FormData): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: 'Sign in again.' };
  const parsed = schema.safeParse({ name: formData.get('name') ?? '', avatar: formData.get('avatar') ?? '' });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form.' };
  const { name, avatar } = parsed.data;

  const db = getDb();
  await db.update(users).set({ name, ...(avatar === 'remove' ? { avatarUrl: null, avatarUpdatedAt: null } : avatar ? { avatarUrl: avatar, avatarUpdatedAt: new Date() } : {}) }).where(eq(users.id, session.user.id));
  await db.update(players).set({ name }).where(eq(players.userId, session.user.id));
  revalidatePath('/', 'layout');
  return {};
}
