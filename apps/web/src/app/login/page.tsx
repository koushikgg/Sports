import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import { signIn } from '@/auth';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;

  async function login(formData: FormData) {
    'use server';
    try {
      await signIn('credentials', {
        email: formData.get('email'),
        password: formData.get('password'),
        redirectTo: callbackUrl ?? '/admin',
      });
    } catch (e) {
      if (e instanceof AuthError) redirect('/login?error=1');
      throw e;
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <form action={login} className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold">Admin sign in</h1>
        {error && <p className="text-sm text-live">Invalid email or password.</p>}
        <input name="email" type="email" required placeholder="Email" className="w-full rounded-md border border-border bg-surface-2 px-3 py-2" />
        <input name="password" type="password" required placeholder="Password" className="w-full rounded-md border border-border bg-surface-2 px-3 py-2" />
        <button className="w-full rounded-md bg-brand px-3 py-2 font-medium text-black">Sign in</button>
      </form>
    </main>
  );
}
