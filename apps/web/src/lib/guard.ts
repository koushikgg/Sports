import { auth } from '@/auth';
import { getDb, auditLogs } from '@sports/db';
import type { Role } from '@sports/shared';

/** Server-action guard: every mutation must go through this. */
export async function requireRole(...roles: Role[]) {
  const session = await auth();
  if (!session?.user || !roles.includes(session.user.role)) throw new Error('Forbidden');
  return session.user;
}

export async function audit(
  userId: string,
  action: string,
  entity: string,
  entityId?: string,
  meta?: Record<string, unknown>,
) {
  await getDb().insert(auditLogs).values({ userId, action, entity, entityId, meta });
}
