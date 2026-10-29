import type { Metadata } from 'next';
import '@fontsource-variable/inter';
import '@fontsource-variable/inter-tight';
import '@fontsource-variable/jetbrains-mono';
import '@/styles/ratch-base.css';
import '@/components/matches/matches.css';
import '@/components/login/login.css';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import '@sports/sports-engine/src/all';
import { safeReturnPath } from '@sports/shared';
import { auth, signIn } from '@/auth';
import { GoogleButton } from '@/components/login/google-button';
import { LiveCard, type FeedItem } from '@/components/login/live-card';
import { getEnabledSports, listMatchCards } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };

const MESSAGES: Record<string, string> = {
  not_invited: 'That Google account has not been invited yet. Ask your league admin to add your email, then try again.',
  domain: 'Only the company Google accounts can sign in here. Choose your work account.',
  unverified: 'Google could not confirm that email address. Try another account.',
  password: 'Invalid email or password.',
};
const GENERIC = "Sign-in was cancelled or didn't complete. Try again.";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reason?: string; callbackUrl?: string }>;
}) {
  const { error, reason, callbackUrl } = await searchParams;
  const returnTo = safeReturnPath(callbackUrl);

  // Already signed in: nothing to do here.
  if ((await auth())?.user) redirect(returnTo);

  async function google() {
    'use server';
    await signIn('google', { redirectTo: returnTo });
  }

  async function password(formData: FormData) {
    'use server';
    try {
      await signIn('credentials', { email: formData.get('email'), password: formData.get('password'), redirectTo: returnTo });
    } catch (e) {
      if (e instanceof AuthError) redirect(`/login?error=password${callbackUrl ? `&callbackUrl=${encodeURIComponent(returnTo)}` : ''}`);
      throw e;
    }
  }

  const [sports, live, next] = await Promise.all([
    getEnabledSports(),
    listMatchCards({ statuses: ['live'], limit: 3 }),
    listMatchCards({ statuses: ['scheduled'], order: 'upcoming', limit: 3 }),
  ]);
  const feed: FeedItem[] = [...live.map((m) => ({ m, live: true })), ...(live.length ? [] : next.map((m) => ({ m, live: false })))].map(({ m, live: isLive }) => ({
    comp: (m.competition ?? m.sportName).toUpperCase(),
    match: `${m.teamA} vs ${m.teamB}`,
    score: isLive ? (m.summary.sides.filter((s) => s.score !== '—').at(-1)?.score.split(' ')[0] ?? '—') : '—',
    line: isLive ? m.summary.status : 'Starting soon',
    live: isLive,
  }));

  const failed = error ? (error === 'password' ? MESSAGES.password : MESSAGES[reason ?? ''] ?? GENERIC) : null;
  const passwordLogin = process.env.AUTH_PASSWORD_LOGIN !== 'false';

  return (
    <div className="ratch lg-page" data-theme="dark">
      <section className="lg-brand" aria-label="About">
        <Link href="/" className="lg-logo"><i /><b>Ratchet</b></Link>
        <div className="lg-pitch">
          <h1>Every ball, every goal, <span>scored live</span>.</h1>
          <p>Run your league, score matches from the boundary and share a live view with everyone watching.</p>
          <LiveCard items={feed} />
        </div>
        <div className="lg-sports">{sports.map((s) => <span key={s.id}>{s.name.toUpperCase()}</span>)}</div>
      </section>

      <main className="lg-panel">
        <div className="lg-form">
          <div>
            <h2>Sign in</h2>
            <p className="lg-sub">One tap with your Google account. No passwords to remember.</p>
          </div>

          <GoogleButton action={google} />

          {failed && <div className="lg-error" role="alert">{failed}</div>}

          <div className="lg-note">
            <span className="lbl">SCORERS AND ORGANISERS</span>
            <span>Use the Google account your league admin invited. Viewers can watch live matches without signing in.</span>
          </div>

          {passwordLogin && (
            <details className="lg-pw" open={error === 'password'}>
              <summary>SIGN IN WITH EMAIL AND PASSWORD</summary>
              <form action={password}>
                <input name="email" type="email" required placeholder="Email" autoComplete="email" aria-label="Email" />
                <input name="password" type="password" required placeholder="Password" autoComplete="current-password" aria-label="Password" />
                <button>SIGN IN</button>
              </form>
            </details>
          )}

          <Link href="/" className="lg-viewer">CONTINUE AS VIEWER</Link>
          <p className="lg-fine">By continuing you agree to the terms of use and privacy policy.</p>
        </div>
      </main>
    </div>
  );
}
