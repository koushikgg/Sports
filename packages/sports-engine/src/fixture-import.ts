/**
 * Fixture import: the organiser copies a prompt (teams, venues, rules and the JSON format below) into an external
 * tool, then pastes the JSON it returns. Nothing here touches the database; the server loads the context and saves.
 *
 * Format version 2 adds what knockouts need: a match number, slots that point at an earlier match
 * ("Winner of Match 3"), and a list of teams that skip the first round (byes). Version 1 files still read.
 */
import type { FixtureSlot } from '@sports/shared';

export const FIXTURE_JSON_VERSION = 2;
export const MAX_FIXTURES = 300;

/** One side of a fixture: a team, or the winner/loser of an earlier match. */
export type Slot = FixtureSlot;

export interface FixtureContext {
  tournamentName: string;
  sportName: string;
  formatKey: 'league' | 'lk' | 'ko' | 'groups' | 'custom';
  formatLabel: string;
  teams: { id: string; name: string; shortName?: string | null }[];
  venues: string[];
  startDate: string;
  endDate: string;
  perDay: number;
  firstMatchTime: string;
  restDay: boolean;
  overs?: number;
  /** Matches the prompt asks for: the league stage, or every round of a knockout. */
  expectedMatches: number;
  /** Fixtures already saved as real matches, as a pair of team ids and a local date, so a repeat paste is skipped. */
  existing: { teamAId: string; teamBId: string; date: string }[];
  /** Fixtures already saved in the tournament's bracket, so a repeat paste is skipped and numbers are not reused. */
  bracket: { no: number; date: string; time: string; a: Slot; b: Slot }[];
}

export interface FixtureIssue { level: 'error' | 'warn'; text: string }
export interface FixtureRow {
  index: number;
  /** The number other fixtures use to point at this one. */
  no: number;
  round: string | null;
  date: string;
  time: string;
  venue: string | null;
  a: Slot | null;
  b: Slot | null;
  /** How each side reads: a team name, or "Winner of Match 3". */
  labelA: string;
  labelB: string;
  /** Already in the tournament, so it is not created again. */
  skip: boolean;
  issues: FixtureIssue[];
}
export interface FixtureParse {
  /** The paste could not be read at all. */
  fatal: string | null;
  rows: FixtureRow[];
  /** Teams that skip the first round. */
  byes: { id: string; name: string }[];
  /** The rounds in the order they are played, with how many matches each has. */
  stages: { name: string; count: number }[];
  /** Problems with the list as a whole, e.g. a team that is in no fixture. They warn; they do not block. */
  notes: string[];
  counts: { total: number; ok: number; warn: number; error: number; skip: number };
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
/** A slot that points at another match ("Winner of Match 3"), as opposed to a team or a table position. */
export const isMatchRef = (s: Slot | null): s is Extract<Slot, { kind: 'winner' | 'loser' }> => s?.kind === 'winner' || s?.kind === 'loser';
export const slotLabel = (s: Slot | null, raw = ''): string =>
  !s ? raw : s.kind === 'team' ? s.name : s.kind === 'rank' ? `${ordinal(s.pos)} in the table` : `${s.kind === 'winner' ? 'Winner' : 'Loser'} of Match ${s.match}`;
export const slotKey = (s: Slot | null) => (!s ? '' : s.kind === 'team' ? s.id : s.kind === 'rank' ? `R${s.pos}` : `${s.kind[0]!.toUpperCase()}${s.match}`);

const FORMAT_RULES: Record<FixtureContext['formatKey'], string> = {
  custom: 'You decide the shape: league matches, knockout rounds, byes, or a mix. Make a sensible schedule for the teams listed, using every team. For a knockout part list every round up to the final, with "Winner of Match N" for sides decided by an earlier match, and list teams that skip the first round under "byes".',
  league: 'Everyone plays everyone exactly once.',
  lk: 'League stage only: everyone plays everyone exactly once. The knockout rounds are added later, so leave them out.',
  groups: 'Split the teams evenly into Group A and Group B. Within each group everyone plays everyone once. Put the group in the round name, for example "Group A · Match 1". Leave the knockout rounds out.',
  ko: 'Single elimination. List EVERY round up to the final: with N teams that is exactly N-1 matches. If N is not a power of two, make the first round only as big as needed so every later round is full, and list the teams that skip the first round under "byes". A team on a bye appears by name in its first match.',
};

const KO_EXAMPLE = `{
  "version": 2,
  "byes": ["Team E", "Team F"],
  "fixtures": [
    { "match": 1, "round": "Round 1", "date": "2026-11-02", "time": "18:00", "teamA": "Team A", "teamB": "Team B" },
    { "match": 2, "round": "Round 1", "date": "2026-11-02", "time": "19:00", "teamA": "Team C", "teamB": "Team D" },
    { "match": 3, "round": "Semi-final", "date": "2026-11-03", "time": "18:00", "teamA": "Winner of Match 1", "teamB": "Team E" },
    { "match": 4, "round": "Semi-final", "date": "2026-11-03", "time": "19:00", "teamA": "Winner of Match 2", "teamB": "Team F" },
    { "match": 5, "round": "Final", "date": "2026-11-04", "time": "18:00", "teamA": "Winner of Match 3", "teamB": "Winner of Match 4" }
  ]
}`;

/** The text the organiser copies. Plain text, so it works in any chat tool. */
export function buildFixturePrompt(c: FixtureContext): string {
  const teams = c.teams.map((t, i) => `${i + 1}. ${t.name}${t.shortName ? ` (short: ${t.shortName})` : ''}`).join('\n');
  const ko = c.formatKey === 'ko';
  return `You are helping me plan the fixtures for a ${c.sportName.toLowerCase()} tournament. Reply with ONE JSON object only, in a single code block, with no other text.

TOURNAMENT
Name: ${c.tournamentName}
Format: ${c.formatLabel}. ${FORMAT_RULES[c.formatKey]}
Teams (${c.teams.length}). Use these names exactly:
${teams}
Venues: ${c.venues.length ? c.venues.join(', ') : 'none listed (leave "venue" out)'}
Dates: ${c.startDate} to ${c.endDate}
Matches per day: ${c.perDay}, first match at ${c.firstMatchTime}, then evenly spaced through the evening
Rest day between rounds: ${c.restDay ? 'yes' : 'no'}
${c.overs ? `Overs per match: ${c.overs}\n` : ''}${c.expectedMatches > 0 ? `Number of matches to list: ${c.expectedMatches}\n` : ''}
JSON FORMAT (version ${FIXTURE_JSON_VERSION})
{
  "version": ${FIXTURE_JSON_VERSION},
  "byes": ["Team name"],
  "fixtures": [
    { "match": 1, "round": "Round 1", "date": "YYYY-MM-DD", "time": "HH:MM", "venue": "Venue name", "teamA": "Team name", "teamB": "Team name" }
  ]
}

RULES
- "match" numbers the fixtures 1, 2, 3 ... in the order they are played. Every number is used once.
- teamA and teamB are each either a team from the list above, spelled exactly as shown, or "Winner of Match N" / "Loser of Match N" when that team is decided by an earlier match.
- "Winner of Match N" must point at a match that is played earlier, and each winner is used in exactly one later match.
- "byes" lists the teams that skip the first round. Leave it out if there are none.${ko ? `
- "round" names the stage. Use exactly: "Round 1" (and "Round 2" ...) for early rounds, then "Quarter-final", "Semi-final" and "Final". Use "Third place" for a third-place match.
- Keep each stage together: all matches of one stage share the same "round" and are played before the next stage starts.` : ''}
- date is YYYY-MM-DD and time is 24-hour HH:MM, in local time. Keep every date between ${c.startDate} and ${c.endDate}.
- venue must be one of the venues above. "venue" and "round" are optional.
- A team can not play two matches at the same date and time.
- List at most ${MAX_FIXTURES} fixtures.${ko ? `\n\nEXAMPLE (a 6-team knockout)\n${KO_EXAMPLE}` : ''}`;
}

/** The stage names a knockout uses. Other labels ("Round 1", "Match 3", "Group A") are kept as written. */
export const STAGES = ['Final', 'Semi-final', 'Quarter-final', 'Third place'] as const;

/** Writes the usual spellings of a stage the same way: "QF", "Quarterfinals", "Quarter finals" are all "Quarter-final". */
export function canonicalRound(raw: string): string {
  const t = raw.trim().replace(/\s+/g, ' ');
  const k = t.toLowerCase().replace(/[-_\s.]/g, '');
  if (/^(qf|quarterfinals?|quarters?|last8|roundof8)$/.test(k)) return 'Quarter-final';
  if (/^(sf|semifinals?|semis?|last4|roundof4)$/.test(k)) return 'Semi-final';
  if (/^(f|finals?|grandfinal|thegrandfinal|championship|finale)$/.test(k)) return 'Final';
  if (/^(thirdplace(playoff|match)?|3rdplace|3rd4thplace|bronze(final|match)?)$/.test(k)) return 'Third place';
  return t;
}

/** "Quarter-final" with 4 matches reads "Quarter-finals"; the final and everything else stay as they are. */
export const stageTitle = (name: string) => (name === 'Quarter-final' || name === 'Semi-final' ? `${name}s` : name);

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

function validDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
const validTime = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** Pulls the JSON out of whatever was pasted: a bare object or array, or one wrapped in a code fence or chat text. */
function extractJson(text: string): unknown {
  const t = text.trim();
  if (!t) throw new Error('Paste the JSON first.');
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  const body = (fenced?.[1] ?? t).trim();
  const tries = [body];
  const obj = body.indexOf('{'), arr = body.indexOf('[');
  const start = obj === -1 ? arr : arr === -1 ? obj : Math.min(obj, arr);
  const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'));
  if (start !== -1 && end > start) tries.push(body.slice(start, end + 1));
  let lastErr = 'It is not valid JSON.';
  for (const s of tries) {
    try { return JSON.parse(s); } catch (e) { lastErr = e instanceof Error ? e.message : lastErr; }
  }
  throw new Error(`That is not valid JSON (${lastErr}).`);
}

const REF = /^(winner|loser|w|l)\s*(?:of)?\s*(?:match|m|#)?\s*(\d{1,4})$/i;

export function parseFixtureJson(text: string, c: FixtureContext): FixtureParse {
  const fail = (fatal: string): FixtureParse => ({ fatal, rows: [], byes: [], stages: [], notes: [], counts: { total: 0, ok: 0, warn: 0, error: 0, skip: 0 } });
  let data: unknown;
  try { data = extractJson(text); } catch (e) { return fail(e instanceof Error ? e.message : 'Could not read that.'); }

  const doc = Array.isArray(data) ? {} : ((data ?? {}) as { fixtures?: unknown; version?: unknown; byes?: unknown });
  const list = Array.isArray(data) ? data : doc.fixtures;
  if (!Array.isArray(list)) return fail('Expected an object with a "fixtures" list, like the format in the prompt.');
  if (doc.version !== undefined && doc.version !== 1 && doc.version !== FIXTURE_JSON_VERSION) return fail(`This is format version ${String(doc.version)}; this app reads versions 1 and ${FIXTURE_JSON_VERSION}.`);
  if (list.length === 0) return fail('The list of fixtures is empty.');
  if (list.length > MAX_FIXTURES) return fail(`That is ${list.length} fixtures; the limit is ${MAX_FIXTURES} at a time.`);

  const byName = new Map<string, { id: string; name: string }>();
  for (const t of c.teams) { byName.set(norm(t.name), t); if (t.shortName) byName.set(norm(t.shortName), t); }
  const venueByName = new Map(c.venues.map((v) => [norm(v), v]));
  const existing = new Set(c.existing.map((e) => `${[e.teamAId, e.teamBId].sort().join('|')}|${e.date}`));
  const bracketSigs = new Set(c.bracket.map((b) => `${b.no}|${b.date}|${b.time}|${slotKey(b.a)}|${slotKey(b.b)}`));
  const bracketNos = new Set(c.bracket.map((b) => b.no));

  // which numbers are used, so references can be checked
  const nos = list.map((raw, i) => {
    const n = (raw as { match?: unknown } | null)?.match;
    return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : typeof n === 'string' && /^\d{1,4}$/.test(n.trim()) ? Number(n) : i + 1;
  });

  function slotOf(raw: unknown, errs: (t: string) => void, side: string): { slot: Slot | null; label: string } {
    if (raw && typeof raw === 'object') {
      const o = raw as { winnerOf?: unknown; loserOf?: unknown };
      const n = Number(o.winnerOf ?? o.loserOf);
      if (Number.isInteger(n) && n > 0 && (o.winnerOf !== undefined || o.loserOf !== undefined)) {
        const slot: Slot = { kind: o.winnerOf !== undefined ? 'winner' : 'loser', match: n };
        return { slot, label: slotLabel(slot) };
      }
    }
    const name = typeof raw === 'string' ? raw.trim() : '';
    if (!name) { errs(`${side} is missing.`); return { slot: null, label: '' }; }
    const team = byName.get(norm(name));
    if (team) return { slot: { kind: 'team', id: team.id, name: team.name }, label: team.name };
    const m = REF.exec(name);
    if (m) {
      const slot: Slot = { kind: /^w/i.test(m[1]!) ? 'winner' : 'loser', match: Number(m[2]) };
      return { slot, label: slotLabel(slot) };
    }
    errs(`“${name}” is not a team in this tournament.`);
    return { slot: null, label: name };
  }

  const rows: FixtureRow[] = list.map((raw, index) => {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const issues: FixtureIssue[] = [];
    const err = (text: string) => issues.push({ level: 'error', text });
    const warn = (text: string) => issues.push({ level: 'warn', text });
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) err('This entry is not an object.');

    const no = nos[index]!;
    const A = slotOf(o.teamA, err, 'teamA');
    const B = slotOf(o.teamB, err, 'teamB');
    if (A.slot?.kind === 'team' && B.slot?.kind === 'team' && A.slot.id === B.slot.id) err('A team can not play itself.');
    if (A.slot && B.slot && isMatchRef(A.slot) && slotKey(A.slot) === slotKey(B.slot)) err('Both sides point at the same match.');

    const date = typeof o.date === 'string' ? o.date.trim() : '';
    const time = typeof o.time === 'string' ? o.time.trim() : '';
    if (!validDate(date)) err('date must be a real date like 2026-11-01.');
    else if (c.startDate && c.endDate && (date < c.startDate || date > c.endDate)) warn(`${date} is outside the tournament dates (${c.startDate} to ${c.endDate}).`);
    if (!validTime(time)) err('time must be 24-hour like 18:30.');

    let venue: string | null = null;
    if (typeof o.venue === 'string' && o.venue.trim()) {
      venue = venueByName.get(norm(o.venue)) ?? o.venue.trim().slice(0, 80);
      if (!venueByName.has(norm(o.venue))) warn(`“${o.venue.trim()}” is not one of this tournament’s venues. It is kept as typed.`);
    }
    const round = typeof o.round === 'string' && o.round.trim() ? canonicalRound(o.round).slice(0, 40) : null;

    let skip = false;
    if (A.slot && B.slot && validDate(date) && validTime(time) && bracketSigs.has(`${no}|${date}|${time}|${slotKey(A.slot)}|${slotKey(B.slot)}`)) skip = true;
    else if (bracketNos.has(no)) err(`Match ${no} is already used by a different fixture in this tournament. Use numbers that are not taken.`);
    if (!skip && A.slot?.kind === 'team' && B.slot?.kind === 'team' && validDate(date) && existing.has(`${[A.slot.id, B.slot.id].sort().join('|')}|${date}`)) skip = true;
    if (skip) warn('Already in this tournament, so it will be skipped.');
    return { index, no, round, date, time, venue, a: A.slot, b: B.slot, labelA: A.label, labelB: B.label, skip, issues };
  });

  const at = (i: number) => rows[i]!;
  const when = (r: FixtureRow) => `${r.date} ${r.time}`;

  // numbers are used once
  const byNo = new Map<number, number[]>();
  for (const r of rows) byNo.set(r.no, [...(byNo.get(r.no) ?? []), r.index]);
  for (const [no, idxs] of byNo) if (idxs.length > 1) for (const i of idxs) at(i).issues.push({ level: 'error', text: `Match number ${no} is used more than once.` });

  // slots that point at an earlier match
  const used = new Map<string, number[]>();
  for (const r of rows) {
    for (const s of [r.a, r.b]) {
      if (!isMatchRef(s)) continue;
      const src = rows.find((x) => x.no === s.match);
      const k = slotKey(s);
      used.set(k, [...(used.get(k) ?? []), r.index]);
      if (s.match === r.no) r.issues.push({ level: 'error', text: `Match ${r.no} can not depend on itself.` });
      else if (!src) r.issues.push({ level: 'error', text: `${slotLabel(s)} points at a match that is not in the list.` });
      else if (validDate(src.date) && validTime(src.time) && validDate(r.date) && validTime(r.time) && when(src) >= when(r)) {
        r.issues.push({ level: 'error', text: `${slotLabel(s)} is played at ${src.date} ${src.time}, which is not before this match.` });
      }
    }
  }
  for (const [k, idxs] of used) if (idxs.length > 1) for (const i of idxs) at(i).issues.push({ level: 'error', text: `${slotLabel(at(i).a && slotKey(at(i).a) === k ? at(i).a : at(i).b)} is used by more than one match.` });

  // byes
  const byes: { id: string; name: string }[] = [];
  const fileByes = Array.isArray(doc.byes) ? doc.byes : [];
  const byeIssues: string[] = [];
  for (const raw of fileByes) {
    const team = typeof raw === 'string' ? byName.get(norm(raw)) : undefined;
    if (!team) { byeIssues.push(`Bye “${String(raw)}” is not a team in this tournament.`); continue; }
    if (byes.some((b) => b.id === team.id)) { byeIssues.push(`${team.name} is listed as a bye twice.`); continue; }
    byes.push(team);
  }

  // team clashes (teams that are known)
  const slot = new Map<string, number[]>();
  const day = new Map<string, number[]>();
  const pair = new Map<string, number[]>();
  for (const r of rows) {
    if (!validDate(r.date)) continue;
    const ids = [r.a, r.b].filter((s): s is Extract<Slot, { kind: 'team' }> => s?.kind === 'team').map((s) => s.id);
    for (const id of ids) {
      if (validTime(r.time)) slot.set(`${id}|${r.date}|${r.time}`, [...(slot.get(`${id}|${r.date}|${r.time}`) ?? []), r.index]);
      day.set(`${id}|${r.date}`, [...(day.get(`${id}|${r.date}`) ?? []), r.index]);
    }
    if (ids.length === 2) { const k = `${[...ids].sort().join('|')}|${r.date}`; pair.set(k, [...(pair.get(k) ?? []), r.index]); }
  }
  for (const idxs of slot.values()) if (idxs.length > 1) for (const i of idxs) at(i).issues.push({ level: 'error', text: `A team is in more than one match at ${at(i).time} on ${at(i).date}.` });
  for (const idxs of day.values()) if (idxs.length > 1) for (const i of idxs) if (!at(i).issues.some((x) => x.text.includes('more than one match'))) at(i).issues.push({ level: 'warn', text: `A team plays ${idxs.length} times on ${at(i).date}.` });
  for (const idxs of pair.values()) if (idxs.length > 1) for (const i of idxs) at(i).issues.push({ level: 'error', text: 'The same two teams are listed twice on this day.' });

  // does the bracket add up? (knockouts, or any list that points at earlier matches)
  const hasRefs = rows.some((r) => isMatchRef(r.a) || isMatchRef(r.b));
  const global: string[] = [...byeIssues];
  if (c.formatKey === 'ko' || hasRefs) {
    const last = [...rows].filter((r) => validDate(r.date) && validTime(r.time)).sort((x, y) => (when(y) < when(x) ? -1 : when(y) > when(x) ? 1 : y.no - x.no))[0];
    for (const r of rows) {
      if (r === last || r.skip) continue;
      if (!used.has(`W${r.no}`) && !used.has(`L${r.no}`)) r.issues.push({ level: 'warn', text: `Nobody plays the winner of Match ${r.no}. Only the final should be last.` });
    }
    const named = new Set<string>(byes.map((b) => b.id));
    for (const r of rows) for (const s of [r.a, r.b]) if (s?.kind === 'team') named.add(s.id);
    const missing = c.teams.filter((t) => !named.has(t.id));
    if (missing.length) global.push(`${missing.map((t) => t.name).join(', ')} ${missing.length === 1 ? 'is' : 'are'} not in any fixture or bye.`);
    for (const b of byes) if (!rows.some((r) => [r.a, r.b].some((s) => s?.kind === 'team' && s.id === b.id))) global.push(`${b.name} is a bye but plays no match.`);
  }
  if (c.formatKey === 'ko' && c.teams.length > 1) {
    const expected = c.teams.length - 1;
    const listed = rows.filter((r) => !r.skip).length + c.bracket.length;
    if (listed !== expected) global.push(`A knockout with ${c.teams.length} teams has ${expected} matches in all (one team goes out per match). This list has ${listed}.`);
  }

  // Name the stages from the shape of the bracket: how many winner-steps a match is from the final.
  if (hasRefs) {
    const consumers = new Map<number, number[]>(); // match -> matches that play its winner
    for (const r of rows) for (const s of [r.a, r.b]) if (s?.kind === 'winner') consumers.set(s.match, [...(consumers.get(s.match) ?? []), r.no]);
    const sinks = rows.filter((r) => !consumers.has(r.no) && !(r.a?.kind === 'loser' && r.b?.kind === 'loser'));
    const last = [...sinks].sort((x, y) => (when(y) < when(x) ? -1 : when(y) > when(x) ? 1 : y.no - x.no))[0];
    const dist = new Map<number, number>();
    if (last) {
      dist.set(last.no, 0);
      for (let changed = true, guard = 0; changed && guard < rows.length + 2; guard++) {
        changed = false;
        for (const r of rows) for (const c of consumers.get(r.no) ?? []) {
          const d = dist.get(c);
          if (d !== undefined && (dist.get(r.no) === undefined || d + 1 < dist.get(r.no)!)) { dist.set(r.no, d + 1); changed = true; }
        }
      }
    }
    const deepest = Math.max(0, ...dist.values());
    const name = (r: FixtureRow): string | null => {
      if (r.a?.kind === 'loser' && r.b?.kind === 'loser') return 'Third place';
      const d = dist.get(r.no);
      return d === undefined ? null : d === 0 ? 'Final' : d === 1 ? 'Semi-final' : d === 2 ? 'Quarter-final' : `Round ${deepest - d + 1}`;
    };
    for (const r of rows) {
      const inferred = name(r);
      if (!inferred) continue;
      if (!r.round) r.round = inferred;
      else if ((STAGES as readonly string[]).includes(r.round) && (STAGES as readonly string[]).includes(inferred) && r.round !== inferred) {
        r.issues.push({ level: 'warn', text: `Labelled ${r.round}, but by the bracket this is the ${inferred} (${inferred === 'Final' ? 'the last match' : `${dist.get(r.no)} step${dist.get(r.no) === 1 ? '' : 's'} from the final`}).` });
      }
    }
  }
  const order = new Map<string, { first: string; count: number }>();
  for (const r of rows) {
    const key = r.round ?? 'Matches';
    const cur = order.get(key);
    order.set(key, { first: cur && cur.first < when(r) ? cur.first : when(r), count: (cur?.count ?? 0) + 1 });
  }
  const stages = [...order].sort((x, y) => x[1].first.localeCompare(y[1].first)).map(([name, v]) => ({ name, count: v.count }));

  const counts = { total: rows.length, ok: 0, warn: 0, error: 0, skip: rows.filter((r) => r.skip).length };
  for (const r of rows) {
    if (r.issues.some((i) => i.level === 'error')) counts.error++;
    else if (r.issues.some((i) => i.level === 'warn')) counts.warn++;
    else counts.ok++;
  }
  return { fatal: null, rows, byes, stages, notes: global, counts };
}
