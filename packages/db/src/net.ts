import net from 'node:net';
import { neonConfig } from '@neondatabase/serverless';

// Node 20 tries each resolved address with a 250ms timeout and gives up with
// "AggregateError ETIMEDOUT" if none connects in time. Neon hosts resolve to several
// addresses and cold computes are slower than that, so give each attempt real time.
net.setDefaultAutoSelectFamilyAttemptTimeout?.(5000);

/** Failures where the TCP connection never opened, so nothing reached the server. */
const CONNECT_ERRORS = new Set([
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EAI_AGAIN',
  'ENOTFOUND',
  'UND_ERR_CONNECT_TIMEOUT',
]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retrying is only safe pre-connection: a request that was sent might have been applied. */
neonConfig.fetchFunction = async (input: RequestInfo | URL, init?: RequestInit) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(input, init);
    } catch (err) {
      const code = (err as { cause?: { code?: string } })?.cause?.code;
      if (attempt >= 2 || !code || !CONNECT_ERRORS.has(code)) throw err;
      await sleep(300 * (attempt + 1));
    }
  }
};
