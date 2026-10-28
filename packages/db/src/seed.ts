import { config } from 'dotenv';
import bcrypt from 'bcryptjs';

config({ path: '../../.env' });

const { getDb, sports, users } = await import('./index');
const db = getDb();

await db
  .insert(sports)
  .values([
    { key: 'cricket', name: 'Cricket', config: { defaultOvers: 5, ballsPerOver: 6 } },
    { key: 'foosball', name: 'Foosball', enabled: false, config: { firstTo: 10 } },
  ])
  .onConflictDoNothing();

const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin1234';
await db
  .insert(users)
  .values({ email, name: 'Admin', role: 'admin', passwordHash: await bcrypt.hash(password, 10) })
  .onConflictDoNothing();

console.log(`Seeded sports and admin user (${email})`);
process.exit(0);
