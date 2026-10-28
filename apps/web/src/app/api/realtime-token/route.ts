import { SignJWT } from 'jose';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const token = await new SignJWT({ role: session.user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(session.user.id)
    .setExpirationTime('15m')
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET));

  return NextResponse.json({ token });
}
