import { eq, getDb, users } from '@sports/db';
import { decideGoogleSignIn, parseList, type GoogleDenied, type Role } from '@sports/shared';
import { unusablePasswordHash } from './passwords';

export interface GoogleProfile {
  email?: string | null;
  emailVerified?: boolean | null;
  name?: string | null;
}

export async function findUserByEmail(email: string | null | undefined) {
  const clean = email?.trim().toLowerCase();
  if (!clean) return null;
  const [user] = await getDb().select().from(users).where(eq(users.email, clean)).limit(1);
  return user ?? null;
}

/**
 * Applies the invite-only policy to a Google profile, using the real accounts table.
 * First sign-in for a listed ADMIN_EMAILS address creates that admin account.
 */
export async function completeGoogleSignIn(
  profile: GoogleProfile,
  env: Record<string, string | undefined> = process.env,
): Promise<{ ok: true; created: boolean } | { ok: false; reason: GoogleDenied }> {
  const email = profile.email?.trim().toLowerCase();
  const existing = await findUserByEmail(email);
  const decision = decideGoogleSignIn({
    email,
    emailVerified: profile.emailVerified,
    existing: existing ? { id: existing.id, role: existing.role as Role } : null,
    adminEmails: parseList(env.ADMIN_EMAILS),
    allowedDomain: env.ALLOWED_EMAIL_DOMAIN || null,
  });
  if (!decision.allow) return { ok: false, reason: decision.reason };

  const db = getDb();
  if (decision.create && email) {
    await db.insert(users).values({
      email,
      name: profile.name?.trim() || email.split('@')[0]!,
      role: decision.create.role,
      passwordHash: await unusablePasswordHash(),
    }).onConflictDoNothing();
    return { ok: true, created: true };
  }
  // An invite only knows the email. Take the display name from Google the first time.
  if (existing && profile.name?.trim() && existing.name === email!.split('@')[0]) {
    await db.update(users).set({ name: profile.name.trim() }).where(eq(users.id, existing.id));
  }
  return { ok: true, created: false };
}
