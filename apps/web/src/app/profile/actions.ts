'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq, getDb, players, users } from '@sports/db';
import { auth } from '@/auth';

const schema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(60, 'Keep your name under 60 characters.'),
  /** '' keeps the photo, 'remove' deletes it, otherwise a cropped JPEG data URL from the browser. */
  avatar: z.string().max(200_000, 'That photo is too large.').regex(/^(|remove|data:image\/jpeg;base64,[A-Za-z0-9+/=]+)$/, 'Use a JPEG, PNG or WebP photo.'),
  /** Cricket playing role: '' clears it. WK is only kept (an organiser sets it), not offered. */
  cricketRole: z.enum(['', 'BAT', 'BOWL', 'AR', 'WK'], { message: 'Pick batter, bowler or all-rounder.' }),
});

/** Saves the signed-in person's own name and photo. Never takes a user id from the client. */
export async function saveProfile(formData: FormData): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: 'Sign in again.' };
  const parsed = schema.safeParse({ name: formData.get('name') ?? '', avatar: formData.get('avatar') ?? '', cricketRole: formData.get('cricketRole') ?? '' });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form.' };
  const { name, avatar, cricketRole } = parsed.data;

  const db = getDb();
  await db.update(users).set({ name, ...(avatar === 'remove' ? { avatarUrl: null, avatarUpdatedAt: null } : avatar ? { avatarUrl: avatar, avatarUpdatedAt: new Date() } : {}) }).where(eq(users.id, session.user.id));
  const [mine] = await db.select({ id: players.id, role: players.role }).from(players).where(eq(players.userId, session.user.id)).limit(1);
  if (mine) await db.update(players).set({ name, role: cricketRole || null }).where(eq(players.id, mine.id));
  else if (cricketRole) {
    // choosing a role makes the person a player: a record linked to their account
    const [me] = await db.select({ email: users.email }).from(users).where(eq(users.id, session.user.id)).limit(1);
    await db.insert(players).values({ name, email: me?.email ?? null, userId: session.user.id, role: cricketRole }).onConflictDoNothing();
  }
  revalidatePath('/', 'layout');
  return {};
}
