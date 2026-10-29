import { resolve } from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// One .env at the repo root is shared by web and realtime; Next only looks in apps/web by default.
// Next has already loaded its own env by now, so a plain call is a cached no-op: force the reload.
loadEnvConfig(resolve(process.cwd(), '../..'), process.env.NODE_ENV !== 'production', console, true);

const config: NextConfig = {
  // Lets a second dev server run next to the main one without fighting over .next.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // The scoring console moved out of /admin. A config redirect runs before the middleware and the admin
  // layout, so scorers following an old link are not turned away on the way.
  async redirects() {
    return [
      { source: '/admin/matches/:id/score', destination: '/score/:id', permanent: true },
      { source: '/admin/teams', destination: '/teams', permanent: false },
      { source: '/admin/teams/:id', destination: '/teams/:id', permanent: false },
    ];
  },
  transpilePackages: ['@sports/db', '@sports/scoring', '@sports/shared', '@sports/sports-engine'],
};

export default config;
