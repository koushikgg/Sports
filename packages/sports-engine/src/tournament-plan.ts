import type { FormatKey } from '@sports/shared';

/** Pure scheduling maths for the tournament wizard. No fixtures are created from this yet. */

const pad = (n: number) => String(n).padStart(2, '0');

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export interface Plan {
  leagueMatches: number;
  knockoutMatches: number;
  totalMatches: number;
  rounds: number;
  matchDays: number;
  lastMatchDate: string;
  /** The schedule runs past the end date. */
  overrun: boolean;
}

export function planTournament(p: {
  formatKey: FormatKey;
  teams: number;
  qualify: 2 | 4;
  perDay: number;
  restDay: boolean;
  startDate: string;
  endDate: string;
  /** Table only: matches each team plays instead of everyone. */
  matchesPerTeam?: number;
}): Plan {
  const n = p.teams;
  if (p.formatKey === 'custom') return { leagueMatches: 0, knockoutMatches: 0, totalMatches: 0, rounds: 0, matchDays: 0, lastMatchDate: '', overrun: false };
  const half = Math.ceil(n / 2);
  const leagueMatches =
    p.formatKey === 'ko' ? 0 : p.formatKey === 'groups' ? 2 * ((half * (half - 1)) / 2) : p.formatKey === 'lk' && p.matchesPerTeam ? (n * p.matchesPerTeam) / 2 : (n * (n - 1)) / 2;
  const knockoutMatches =
    p.formatKey === 'ko' ? Math.max(0, n - 1) : p.formatKey === 'league' ? 0 : p.formatKey === 'groups' ? 3 : p.qualify === 2 ? 1 : 3;
  const totalMatches = leagueMatches + knockoutMatches;
  const rounds = p.formatKey === 'ko' ? Math.ceil(Math.log2(Math.max(2, n))) : Math.max(1, p.formatKey === 'lk' && p.matchesPerTeam ? p.matchesPerTeam : n - 1);
  const matchDays = Math.ceil(totalMatches / p.perDay) + (p.restDay ? Math.max(0, rounds - 1) : 0);
  const lastMatchDate = p.startDate ? addDays(p.startDate, Math.max(0, matchDays - 1)) : '';
  return { leagueMatches, knockoutMatches, totalMatches, rounds, matchDays, lastMatchDate, overrun: !!(p.endDate && lastMatchDate && lastMatchDate > p.endDate) };
}

/** First-round pairings by the circle method (first v last), for the preview only. */
export function previewRound1<T>(teams: T[], perDay: number, startDate: string, firstTime: string, limit = 5) {
  const list: (T | null)[] = teams.slice();
  if (list.length % 2) list.push(null);
  const pairs: { a: T; b: T; date: string; time: string }[] = [];
  const [h, m] = (firstTime || '18:00').split(':').map(Number) as [number, number];
  for (let i = 0; i < list.length / 2; i++) {
    const a = list[i], b = list[list.length - 1 - i];
    if (!a || !b) continue;
    const k = pairs.length;
    pairs.push({ a, b, date: addDays(startDate, Math.floor(k / perDay)), time: `${pad((h + (k % perDay) * 3) % 24)}:${pad(m)}` });
  }
  return pairs.slice(0, limit);
}

/** A local wall-clock date and time to an instant, given the organiser's Date#getTimezoneOffset (minutes). */
export function toInstant(date: string, time: string, tzOffsetMinutes: number): Date {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = time.split(':').map(Number) as [number, number];
  return new Date(Date.UTC(y, mo - 1, d, h, mi) + tzOffsetMinutes * 60_000);
}

export interface BracketSide { seed: number | null; bye?: boolean }
export interface BracketTie { a: BracketSide; b: BracketSide }
export interface BracketRound { name: string; ties: BracketTie[] }

/** Standard seeding order for a bracket of `size` (a power of two): 1v8, 4v5, 2v7, 3v6 for 8. */
function seedOrder(size: number): number[] {
  let order = [0];
  while (order.length < size) order = order.flatMap((x) => [x, order.length * 2 - 1 - x]);
  return order;
}

const roundName = (matches: number) => (matches === 1 ? 'FINAL' : matches === 2 ? 'SEMI-FINALS' : matches === 4 ? 'QUARTER-FINALS' : `ROUND OF ${matches * 2}`);

/**
 * A projected single-elimination bracket from seeds (0 = top seed). This is a projection from the
 * standings, not fixtures: later rounds have no teams until results exist.
 */
export function projectKnockout(teams: number): BracketRound[] {
  if (teams < 2) return [];
  const size = 2 ** Math.ceil(Math.log2(teams));
  const order = seedOrder(size);
  const side = (seed: number): BracketSide => (seed < teams ? { seed } : { seed: null, bye: true });
  const rounds: BracketRound[] = [];
  const first: BracketTie[] = [];
  for (let i = 0; i < order.length; i += 2) first.push({ a: side(order[i]!), b: side(order[i + 1]!) });
  rounds.push({ name: roundName(first.length), ties: first });
  for (let n = first.length / 2; n >= 1; n /= 2) {
    rounds.push({ name: roundName(n), ties: Array.from({ length: n }, () => ({ a: { seed: null }, b: { seed: null } })) });
  }
  return rounds;
}

/** League + knockouts / groups: the top `qualify` seeds go into semi-finals (1v4, 2v3) or a final (1v2). */
export function projectLeagueKnockout(qualify: 2 | 4): BracketRound[] {
  return qualify === 2
    ? [{ name: 'FINAL', ties: [{ a: { seed: 0 }, b: { seed: 1 } }] }]
    : [
        { name: 'SEMI-FINALS', ties: [{ a: { seed: 0 }, b: { seed: 3 } }, { a: { seed: 1 }, b: { seed: 2 } }] },
        { name: 'FINAL', ties: [{ a: { seed: null }, b: { seed: null } }] },
      ];
}
