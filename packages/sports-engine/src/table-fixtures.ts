import type { BracketFixture, FixtureSlot } from '@sports/shared';
import { addDays } from './tournament-plan';

/**
 * The Table type: everyone plays everyone once (circle method), then the top 4 play semi-finals (1st v 4th, 2nd v 3rd)
 * and a final, or the top 2 play the final. The knockout sides are table positions that fill in when the league ends.
 * Pure: it only makes the list. Saving it and turning it into matches is the server's job.
 */
export interface TableInput {
  teams: { id: string; name: string }[];
  qualify: 2 | 4;
  startDate: string;
  perDay: number;
  firstMatchTime: string;
  /** One empty day after each round of the league. */
  restDay: boolean;
  /** Minutes between matches on the same day. It shrinks so the last match of a day starts before 23:00. */
  gapMinutes: number;
  venues: string[];
  /** The organiser's getTimezoneOffset(), stored with every fixture. */
  tz: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (min: number) => `${pad(Math.floor(Math.min(1439, min) / 60))}:${pad(Math.min(1439, min) % 60)}`;
const team = (t: { id: string; name: string }): FixtureSlot => ({ kind: 'team', id: t.id, name: t.name });
const rank = (pos: number): FixtureSlot => ({ kind: 'rank', pos });
const winner = (match: number): FixtureSlot => ({ kind: 'winner', match });

/** How long a match takes plus a break, so a day of matches does not overlap. Cricket scales with the overs. */
export const gapMinutesFor = (sportKey: string, overs?: number) => (sportKey === 'cricket' ? Math.max(60, (overs ?? 20) * 8 + 40) : 60);

export function generateTableFixtures(i: TableInput): BracketFixture[] {
  const n = i.teams.length;
  if (n < 2) return [];
  const perDay = Math.max(1, i.perDay);
  const [h, m] = i.firstMatchTime.split(':').map(Number) as [number, number];
  const first = h * 60 + m;
  const gap = perDay > 1 ? Math.max(30, Math.min(i.gapMinutes, Math.floor((1380 - first) / (perDay - 1)))) : 0;

  // circle method: with an odd number of teams one sits out each round
  const ring: ({ id: string; name: string } | null)[] = [...i.teams];
  if (ring.length % 2) ring.push(null);
  const rounds: [{ id: string; name: string }, { id: string; name: string }][][] = [];
  for (let r = 0; r < ring.length - 1; r++) {
    const pairs: [{ id: string; name: string }, { id: string; name: string }][] = [];
    for (let k = 0; k < ring.length / 2; k++) {
      const a = ring[k], b = ring[ring.length - 1 - k];
      if (!a || !b) continue;
      pairs.push([a, b]);
    }
    rounds.push(pairs);
    ring.splice(1, 0, ring.pop()!);
  }

  // orient every pair so the team with fewer home games so far is home; nobody ends up always home or always away
  const lead = new Map<string, number>(); // home games minus away games
  for (const pairs of rounds) {
    pairs.forEach((p, k) => {
      const [a, b] = p;
      const la = lead.get(a.id) ?? 0, lb = lead.get(b.id) ?? 0;
      const flip = la > lb || (la === lb && (rounds.indexOf(pairs) + k) % 2 === 1);
      if (flip) pairs[k] = [b, a];
      const [h, aw] = pairs[k]!;
      lead.set(h.id, (lead.get(h.id) ?? 0) + 1);
      lead.set(aw.id, (lead.get(aw.id) ?? 0) - 1);
    });
  }

  const out: BracketFixture[] = [];
  let day = 0, slot = 0, prevRound = -1;
  const place = (round: string, a: FixtureSlot, b: FixtureSlot, newDay: boolean) => {
    if (newDay && (slot > 0 || out.length > 0)) { if (slot > 0) day++; slot = 0; }
    if (slot >= perDay) { day++; slot = 0; }
    out.push({
      no: out.length + 1, round, date: addDays(i.startDate, day), time: hhmm(first + slot * gap), tz: i.tz,
      venue: i.venues.length ? i.venues[day % i.venues.length]! : null, a, b, matchId: null,
    });
    slot++;
  };

  rounds.forEach((pairs, r) => {
    for (const [a, b] of pairs) {
      const boundary = r !== prevRound && prevRound !== -1;
      if (boundary && i.restDay) { if (slot > 0) day++; day++; slot = 0; }
      prevRound = r;
      place(`Round ${r + 1}`, team(a), team(b), false);
    }
  });

  const qualify = Math.min(i.qualify, n >= 4 ? 4 : 2);
  const afterLeague = () => { if (slot > 0) day++; slot = 0; };
  if (qualify === 4) {
    afterLeague();
    const s1 = out.length + 1, s2 = out.length + 2;
    place('Semi-final', rank(1), rank(4), false);
    place('Semi-final', rank(2), rank(3), false);
    afterLeague(); if (i.restDay) day++;
    place('Final', winner(s1), winner(s2), false);
  } else {
    afterLeague();
    place('Final', rank(1), rank(2), false);
  }
  return out;
}
