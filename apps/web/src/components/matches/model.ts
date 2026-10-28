import type { ScoreSummary } from '@sports/shared';
import type { MatchCardData } from '@/lib/queries';

export type StatusGroup = 'live' | 'up' | 'ft';

export const statusGroup = (s: MatchCardData['status']): StatusGroup =>
  s === 'live' || s === 'paused' ? 'live' : s === 'scheduled' ? 'up' : 'ft';

const SPORT_COLORS: Record<string, string> = {
  cricket: '#ffdb4d',
  football: '#34c759',
  foosball: '#006cff',
  badminton: '#c85cff',
};
export const sportColor = (key: string) => SPORT_COLORS[key] ?? '#9aa1ad';

/** Team badge colours (background, text), picked from the name so a team always looks the same. */
const TINTS: [string, string][] = [
  ['#172e80', '#8aa6fe'], ['#3a2a14', '#ffaf69'], ['#3a3414', '#ffdb4d'], ['#2a1d3d', '#c4a4ff'],
  ['#3d1a1c', '#ff7477'], ['#14283d', '#7fb2ff'], ['#123430', '#29dbae'], ['#3d1a2c', '#ff57ab'],
];
export function teamTint(name: string): { bg: string; fg: string } {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [bg, fg] = TINTS[h % TINTS.length]!;
  return { bg, fg };
}

export const teamCode = (name: string, short?: string | null) =>
  (short?.trim() || name.replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/)[0]?.slice(0, 3) || '?').toUpperCase();

/** "112/3 (14.2/20)" -> ["112/3", "(14.2/20)"]; "—" (not started) -> null. */
export function splitScore(score: string | undefined): [string, string] | null {
  if (!score || score === '—') return null;
  const i = score.indexOf(' (');
  return i < 0 ? [score, ''] : [score.slice(0, i), score.slice(i + 1)];
}

export const sideScore = (summary: ScoreSummary, team: string) => summary.sides.find((s) => s.name === team)?.score;
export const hasStarted = (summary: ScoreSummary) => summary.sides.some((s) => s.score !== '—');
