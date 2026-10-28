import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { eq, getDb, users } from '@sports/db';
import type { Role } from '@sports/shared';
import { authConfig } from './auth.config';
import { completeGoogleSignIn, findUserByEmail } from './lib/google-signin';

const credsSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

/** Email + password stays available as a fallback. Set AUTH_PASSWORD_LOGIN=false once Google sign-in is live. */
const passwordLogin = process.env.AUTH_PASSWORD_LOGIN !== 'false';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    // Reads AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET from the environment.
    // PKCE and a state value: the first stops code injection, the second stops login CSRF.
    Google({ checks: ['pkce', 'state'], authorization: { params: { prompt: 'select_account' } } }),
    ...(passwordLogin
      ? [
          Credentials({
            async authorize(raw) {
              const parsed = credsSchema.safeParse(raw);
              if (!parsed.success) return null;
              const [user] = await getDb()
                .select()
                .from(users)
                .where(eq(users.email, parsed.data.email.toLowerCase()))
                .limit(1);
              if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return null;
              return { id: user.id, name: user.name, email: user.email, role: user.role };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Google sign-in is invite-only: the email must belong to an account an admin created.
    async signIn({ account, profile }) {
      if (account?.provider !== 'google') return true;
      const result = await completeGoogleSignIn({ email: profile?.email, emailVerified: profile?.email_verified, name: profile?.name });
      return result.ok ? true : `/login?error=AccessDenied&reason=${result.reason}`;
    },
    // The session's id and role always come from our own accounts table, never from Google.
    async jwt({ token, user, account, profile }) {
      if (account?.provider === 'google') {
        const dbUser = await findUserByEmail(profile?.email);
        if (dbUser) {
          token.uid = dbUser.id;
          token.role = dbUser.role as Role;
          token.name = dbUser.name;
          token.email = dbUser.email;
        }
        return token;
      }
      if (user) {
        token.uid = user.id;
        token.role = (user as { role: Role }).role;
      }
      return token;
    },
  },
});
