import { describe, expect, it } from 'vitest';
import { buildFixturePrompt, canonicalRound, parseFixtureJson, slotKey, stageTitle, type FixtureContext } from './fixture-import';

const ctx: FixtureContext = {
  tournamentName: 'City T20', sportName: 'Cricket', formatKey: 'league', formatLabel: 'League',
  teams: [{ id: 'A', name: 'Alpha', shortName: 'ALP' }, { id: 'B', name: 'Beta' }, { id: 'C', name: 'Gamma' }],
  venues: ['Main Ground', 'Nets Arena'], startDate: '2026-11-01', endDate: '2026-11-30', perDay: 2, firstMatchTime: '18:00', restDay: false, overs: 10, expectedMatches: 3, existing: [], bracket: [],
};
const fx = (o: Record<string, unknown>) => ({ round: 'Match 1', date: '2026-11-02', time: '18:00', venue: 'Main Ground', teamA: 'Alpha', teamB: 'Beta', ...o });
const wrap = (...f: unknown[]) => JSON.stringify({ version: 1, fixtures: f });
const errs = (r: ReturnType<typeof parseFixtureJson>, i = 0) => r.rows[i]!.issues.filter((x) => x.level === 'error').map((x) => x.text);

describe('fixture prompt', () => {
  const p = buildFixturePrompt(ctx);
  it('lists the teams, venues, dates and rules the AI needs', () => {
    expect(p).toContain('1. Alpha (short: ALP)');
    expect(p).toContain('3. Gamma');
    expect(p).toContain('Venues: Main Ground, Nets Arena');
    expect(p).toContain('2026-11-01 to 2026-11-30');
    expect(p).toContain('Matches per day: 2, first match at 18:00');
    expect(p).toContain('Overs per match: 10');
    expect(p).toContain('Number of matches to list: 3');
    expect(p).toContain('"fixtures"');
    expect(p).toContain('Everyone plays everyone exactly once.');
    expect(p).not.toContain('EXAMPLE');
  });
  it('describes byes, winner slots and match numbers', () => {
    expect(p).toContain('"byes"');
    expect(p).toContain('"match": 1');
    expect(p).toContain('Winner of Match N');
  });
  it('a knockout prompt asks for every round, says N-1, and has a worked example', () => {
    const k = buildFixturePrompt({ ...ctx, formatKey: 'ko', formatLabel: 'Knockout', expectedMatches: 2, sportName: 'Foosball', overs: undefined });
    expect(k).toContain('EVERY round up to the final');
    expect(k).toContain('N-1 matches');
    expect(k).toContain('EXAMPLE (a 6-team knockout)');
    expect(k).toContain('Winner of Match 3');
    expect(k).not.toContain('Overs per match');
  });
  it('tells groups what to leave out and handles no venues', () => {
    expect(buildFixturePrompt({ ...ctx, formatKey: 'groups', formatLabel: 'Groups' })).toContain('Group A and Group B');
    expect(buildFixturePrompt({ ...ctx, venues: [] })).toContain('none listed');
  });
});

describe('parseFixtureJson: reading', () => {
  it('reads a clean paste', () => {
    const r = parseFixtureJson(wrap(fx({}), fx({ round: 'Match 2', date: '2026-11-03', teamA: 'Gamma', teamB: 'Alpha' })), ctx);
    expect(r.fatal).toBeNull();
    expect(r.counts).toEqual({ total: 2, ok: 2, warn: 0, error: 0, skip: 0 });
    expect(r.rows[0]).toMatchObject({ no: 1, a: { kind: 'team', id: 'A' }, b: { kind: 'team', id: 'B' }, round: 'Match 1', venue: 'Main Ground', labelA: 'Alpha' });
    expect(r.rows.map((x) => x.no)).toEqual([1, 2]); // numbered by position when "match" is left out
  });
  it('accepts a code fence, chat text around it, and a bare array', () => {
    expect(parseFixtureJson('Here you go:\n```json\n' + wrap(fx({})) + '\n```\nEnjoy!', ctx).counts.ok).toBe(1);
    expect(parseFixtureJson('Sure! ' + wrap(fx({})) + ' Done.', ctx).counts.ok).toBe(1);
    expect(parseFixtureJson(JSON.stringify([fx({})]), ctx).counts.ok).toBe(1);
  });
  it('reports a paste it cannot read', () => {
    expect(parseFixtureJson('', ctx).fatal).toMatch(/Paste the JSON/);
    expect(parseFixtureJson('not json at all', ctx).fatal).toMatch(/not valid JSON/);
    expect(parseFixtureJson('{"foo": 1}', ctx).fatal).toMatch(/"fixtures"/);
    expect(parseFixtureJson(JSON.stringify({ version: 9, fixtures: [fx({})] }), ctx).fatal).toMatch(/version 9/);
    expect(parseFixtureJson(wrap(), ctx).fatal).toMatch(/empty/);
    expect(parseFixtureJson(JSON.stringify({ fixtures: Array.from({ length: 301 }, () => fx({})) }), ctx).fatal).toMatch(/limit is 300/);
  });
  it('reads version 2 as well as 1', () => {
    expect(parseFixtureJson(JSON.stringify({ version: 2, fixtures: [fx({})] }), ctx).counts.ok).toBe(1);
  });
});

describe('parseFixtureJson: rows', () => {
  it('matches team names case-insensitively and by short name', () => {
    const r = parseFixtureJson(wrap(fx({ teamA: ' alpha ', teamB: 'bETA' }), fx({ date: '2026-11-03', teamA: 'ALP', teamB: 'Gamma' })), ctx);
    expect(r.rows.map((x) => [slotKey(x.a), slotKey(x.b)])).toEqual([['A', 'B'], ['A', 'C']]);
    expect(r.rows[0]!.labelA).toBe('Alpha');
  });
  it('flags unknown teams, a team against itself, and missing fields', () => {
    const r = parseFixtureJson(wrap(fx({ teamA: 'Zeta' }), fx({ teamB: 'Alpha' }), { round: 'x' }), ctx);
    expect(errs(r, 0)[0]).toMatch(/“Zeta” is not a team/);
    expect(errs(r, 1)).toContain('A team can not play itself.');
    expect(errs(r, 2).join(' ')).toMatch(/teamA is missing.*teamB is missing.*date.*time/);
    expect(r.counts.error).toBe(3);
  });
  it('checks dates and times for real', () => {
    const r = parseFixtureJson(wrap(fx({ date: '2026-02-30' }), fx({ date: '02/11/2026' }), fx({ time: '25:00' }), fx({ time: '6pm' })), ctx);
    expect(r.counts.error).toBe(4);
  });
  it('warns about dates outside the tournament and venues it does not know', () => {
    const r = parseFixtureJson(wrap(fx({ date: '2026-12-05', venue: 'Moon Base' })), ctx);
    expect(r.counts).toMatchObject({ warn: 1, error: 0 });
    expect(r.rows[0]!.issues.map((i) => i.text).join(' ')).toMatch(/outside the tournament dates.*not one of this tournament’s venues/);
    expect(r.rows[0]!.venue).toBe('Moon Base');
    expect(parseFixtureJson(wrap(fx({ venue: 'main ground' })), ctx).rows[0]!.venue).toBe('Main Ground');
  });
  it('rejects a team in two matches at the same time, warns for the same day', () => {
    const clash = parseFixtureJson(wrap(fx({}), fx({ teamA: 'Alpha', teamB: 'Gamma' })), ctx);
    expect(errs(clash, 0).join(' ')).toMatch(/more than one match at 18:00/);
    const sameDay = parseFixtureJson(wrap(fx({}), fx({ time: '20:00', teamA: 'Alpha', teamB: 'Gamma' })), ctx);
    expect(sameDay.counts).toMatchObject({ error: 0, warn: 2 });
  });
  it('rejects the same pair twice on one day', () => {
    expect(errs(parseFixtureJson(wrap(fx({}), fx({ time: '20:00', teamA: 'Beta', teamB: 'Alpha' })), ctx), 0).join(' ')).toMatch(/listed twice/);
  });
  it('skips a real match that already exists that day, in either order', () => {
    const r = parseFixtureJson(wrap(fx({ teamA: 'Beta', teamB: 'Alpha' })), { ...ctx, existing: [{ teamAId: 'A', teamBId: 'B', date: '2026-11-02' }] });
    expect(r.rows[0]!.skip).toBe(true);
    expect(r.counts).toMatchObject({ skip: 1, warn: 1, error: 0 });
  });
});

describe('knockout slots and byes', () => {
  const ko = (n: number): FixtureContext => ({
    ...ctx, sportName: 'Foosball', formatKey: 'ko', formatLabel: 'Knockout', overs: undefined, expectedMatches: n - 1, startDate: '2026-11-01', endDate: '2026-11-30',
    teams: Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, name: `Team ${i + 1}` })), venues: [],
  });
  const m = (no: number, round: string, date: string, time: string, teamA: string, teamB: string) => ({ match: no, round, date, time, teamA, teamB });

  // 11 teams: 3 first-round matches (6 teams) + 5 byes -> 4 quarter-finals, 2 semi-finals, a final = 10 matches
  const correct = {
    version: 2,
    byes: ['Team 3', 'Team 5', 'Team 6', 'Team 8', 'Team 11'],
    fixtures: [
      m(1, 'Round 1', '2026-11-02', '18:00', 'Team 7', 'Team 2'),
      m(2, 'Round 1', '2026-11-02', '19:00', 'Team 10', 'Team 4'),
      m(3, 'Round 1', '2026-11-02', '20:00', 'Team 1', 'Team 9'),
      m(4, 'Quarter-final', '2026-11-03', '18:00', 'Winner of Match 1', 'Team 3'),
      m(5, 'Quarter-final', '2026-11-03', '19:00', 'Winner of Match 2', 'Team 5'),
      m(6, 'Quarter-final', '2026-11-03', '20:00', 'Winner of Match 3', 'Team 8'),
      m(7, 'Quarter-final', '2026-11-03', '21:00', 'Team 6', 'Team 11'),
      m(8, 'Semi-final', '2026-11-04', '18:00', 'Winner of Match 4', 'Winner of Match 5'),
      m(9, 'Semi-final', '2026-11-04', '19:00', 'Winner of Match 6', 'Winner of Match 7'),
      m(10, 'Final', '2026-11-05', '18:00', 'Winner of Match 8', 'Winner of Match 9'),
    ],
  };

  it('reads a full 11-team knockout with byes and winner slots with no problems', () => {
    const r = parseFixtureJson(JSON.stringify(correct), ko(11));
    expect(r.fatal).toBeNull();
    expect(r.counts).toEqual({ total: 10, ok: 10, warn: 0, error: 0, skip: 0 });
    expect(r.notes).toEqual([]);
    expect(r.byes.map((b) => b.name)).toEqual(['Team 3', 'Team 5', 'Team 6', 'Team 8', 'Team 11']);
    expect(r.rows[3]).toMatchObject({ no: 4, round: 'Quarter-final', labelA: 'Winner of Match 1', labelB: 'Team 3', a: { kind: 'winner', match: 1 } });
    expect(r.rows[9]).toMatchObject({ labelA: 'Winner of Match 8', labelB: 'Winner of Match 9' });
  });

  it('accepts the other ways of writing a slot', () => {
    const r = parseFixtureJson(JSON.stringify({ fixtures: [
      m(1, 'R1', '2026-11-02', '18:00', 'Team 1', 'Team 2'),
      { match: 2, date: '2026-11-03', time: '18:00', teamA: { winnerOf: 1 }, teamB: 'W 1x' },
      m(3, 'R', '2026-11-03', '19:00', 'winner match 1', 'Loser of Match 1'),
      m(4, 'R', '2026-11-03', '20:00', 'W1', 'L1'),
    ] }), ko(3));
    expect(r.rows[1]!.a).toEqual({ kind: 'winner', match: 1 });
    expect(r.rows[1]!.issues.map((i) => i.text).join(' ')).toMatch(/“W 1x” is not a team/);
    expect(r.rows[2]).toMatchObject({ a: { kind: 'winner', match: 1 }, b: { kind: 'loser', match: 1 } });
    expect(r.rows[3]).toMatchObject({ a: { kind: 'winner', match: 1 }, b: { kind: 'loser', match: 1 } });
  });

  it('errors when a slot points at a missing, later, or same match', () => {
    const r = parseFixtureJson(JSON.stringify({ fixtures: [
      m(1, 'R1', '2026-11-02', '18:00', 'Team 1', 'Winner of Match 9'),
      m(2, 'R1', '2026-11-02', '19:00', 'Team 2', 'Winner of Match 3'),
      m(3, 'R1', '2026-11-02', '20:00', 'Team 3', 'Winner of Match 3'),
    ] }), ko(3));
    expect(errs(r, 0).join(' ')).toMatch(/Winner of Match 9 points at a match that is not in the list/);
    expect(errs(r, 1).join(' ')).toMatch(/Winner of Match 3 is played at 2026-11-02 20:00, which is not before this match/);
    expect(errs(r, 2).join(' ')).toMatch(/can not depend on itself/);
  });

  it('errors when one winner feeds two matches, or both sides are the same match', () => {
    const r = parseFixtureJson(JSON.stringify({ fixtures: [
      m(1, 'R1', '2026-11-02', '18:00', 'Team 1', 'Team 2'),
      m(2, 'R2', '2026-11-03', '18:00', 'Winner of Match 1', 'Team 3'),
      m(3, 'R2', '2026-11-03', '19:00', 'Winner of Match 1', 'Team 4'),
      m(4, 'R2', '2026-11-03', '20:00', 'Winner of Match 2', 'Winner of Match 2'),
    ] }), ko(4));
    expect(errs(r, 1).join(' ')).toMatch(/Winner of Match 1 is used by more than one match/);
    expect(errs(r, 2).join(' ')).toMatch(/Winner of Match 1 is used by more than one match/);
    expect(errs(r, 3).join(' ')).toMatch(/Both sides point at the same match/);
  });

  it('errors on a repeated match number and on bad byes', () => {
    const r = parseFixtureJson(JSON.stringify({ byes: ['Team 9', 'Team 1', 'Team 1'], fixtures: [
      m(1, 'R1', '2026-11-02', '18:00', 'Team 1', 'Team 2'),
      m(1, 'R1', '2026-11-02', '19:00', 'Team 3', 'Team 4'),
    ] }), ko(4));
    expect(errs(r, 0).join(' ')).toMatch(/Match number 1 is used more than once/);
    expect(r.notes.join(' ')).toMatch(/Bye “Team 9” is not a team/);
    expect(r.notes.join(' ')).toMatch(/Team 1 is listed as a bye twice/);
  });

  it('catches the pasted example: 11 teams, 4 first-round matches and 3 byes leave a quarter-final short', () => {
    // as written: Match 8 reuses Winner of Match 1, so one slot has no team, and 11 matches are listed for 11 teams
    const bad = {
      byes: ['Team 3', 'Team 5', 'Team 8'],
      fixtures: [
        m(1, 'Round 1', '2026-11-02', '18:00', 'Team 7', 'Team 2'),
        m(2, 'Round 1', '2026-11-02', '19:00', 'Team 10', 'Team 4'),
        m(3, 'Round 1', '2026-11-02', '20:00', 'Team 1', 'Team 9'),
        m(4, 'Round 1', '2026-11-02', '21:00', 'Team 6', 'Team 11'),
        m(5, 'Quarter-final', '2026-11-03', '18:00', 'Winner of Match 1', 'Team 3'),
        m(6, 'Quarter-final', '2026-11-03', '19:00', 'Winner of Match 2', 'Team 5'),
        m(7, 'Quarter-final', '2026-11-03', '20:00', 'Winner of Match 3', 'Team 8'),
        m(8, 'Quarter-final', '2026-11-03', '21:00', 'Winner of Match 4', 'Winner of Match 1'),
        m(9, 'Semi-final', '2026-11-04', '18:00', 'Winner of Match 5', 'Winner of Match 6'),
        m(10, 'Semi-final', '2026-11-04', '19:00', 'Winner of Match 7', 'Winner of Match 8'),
        m(11, 'Final', '2026-11-05', '18:00', 'Winner of Match 9', 'Winner of Match 10'),
      ],
    };
    const r = parseFixtureJson(JSON.stringify(bad), ko(11));
    expect(r.counts.error).toBe(2); // Winner of Match 1 is used by Match 5 and Match 8
    expect(errs(r, 4).join(' ')).toMatch(/Winner of Match 1 is used by more than one match/);
    expect(r.notes.join(' ')).toMatch(/11 teams has 10 matches in all.*This list has 11/);
  });

  it('warns when a winner is never used and when a team is nowhere', () => {
    const r = parseFixtureJson(JSON.stringify({ fixtures: [
      m(1, 'R1', '2026-11-02', '18:00', 'Team 1', 'Team 2'),
      m(2, 'R1', '2026-11-02', '19:00', 'Team 3', 'Team 4'),
      m(3, 'Final', '2026-11-03', '18:00', 'Winner of Match 1', 'Team 3'),
    ] }), ko(5));
    expect(r.rows[1]!.issues.map((i) => i.text).join(' ')).toMatch(/Nobody plays the winner of Match 2/);
    expect(r.notes.join(' ')).toMatch(/Team 5 is not in any fixture or bye/);
    expect(r.rows[2]!.issues).toEqual([]); // the final is allowed to be last
  });

  it('skips fixtures already saved in the bracket and refuses reused numbers', () => {
    const saved = { ...ko(3), bracket: [{ no: 1, date: '2026-11-02', time: '18:00', a: { kind: 'team' as const, id: 't1', name: 'Team 1' }, b: { kind: 'team' as const, id: 't2', name: 'Team 2' } }] };
    const same = parseFixtureJson(JSON.stringify({ fixtures: [m(1, 'R1', '2026-11-02', '18:00', 'Team 1', 'Team 2')] }), saved);
    expect(same.rows[0]!.skip).toBe(true);
    expect(same.counts.error).toBe(0);
    const clash = parseFixtureJson(JSON.stringify({ fixtures: [m(1, 'R1', '2026-11-03', '18:00', 'Team 2', 'Team 3')] }), saved);
    expect(errs(clash, 0).join(' ')).toMatch(/Match 1 is already used by a different fixture/);
  });
});

describe('stages', () => {
  const ko = (n: number): FixtureContext => ({
    ...ctx, sportName: 'Foosball', formatKey: 'ko', formatLabel: 'Knockout', overs: undefined, expectedMatches: n - 1,
    teams: Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, name: `Team ${i + 1}` })), venues: [],
  });
  const m = (no: number, round: string | undefined, date: string, time: string, teamA: string, teamB: string) => ({ match: no, ...(round ? { round } : {}), date, time, teamA, teamB });
  const bracket11 = (r: (s: string) => string | undefined) => ({
    version: 2,
    fixtures: [
      m(1, r('Round 1'), '2026-11-02', '18:00', 'Team 7', 'Team 2'), m(2, r('Round 1'), '2026-11-02', '19:00', 'Team 10', 'Team 4'), m(3, r('Round 1'), '2026-11-02', '20:00', 'Team 1', 'Team 9'),
      m(4, r('Quarter-final'), '2026-11-03', '18:00', 'Winner of Match 1', 'Team 3'), m(5, r('Quarter-final'), '2026-11-03', '19:00', 'Winner of Match 2', 'Team 5'),
      m(6, r('Quarter-final'), '2026-11-03', '20:00', 'Winner of Match 3', 'Team 8'), m(7, r('Quarter-final'), '2026-11-03', '21:00', 'Team 6', 'Team 11'),
      m(8, r('Semi-final'), '2026-11-04', '18:00', 'Winner of Match 4', 'Winner of Match 5'), m(9, r('Semi-final'), '2026-11-04', '19:00', 'Winner of Match 6', 'Winner of Match 7'),
      m(10, r('Final'), '2026-11-05', '18:00', 'Winner of Match 8', 'Winner of Match 9'),
    ],
  });

  it('writes the usual spellings of a stage one way', () => {
    for (const x of ['QF', 'quarterfinal', 'Quarter finals', 'Quarter-Finals', 'quarter final', 'Last 8']) expect(canonicalRound(x)).toBe('Quarter-final');
    for (const x of ['SF', 'Semifinals', 'semi final', 'Semi-Final', 'Semis']) expect(canonicalRound(x)).toBe('Semi-final');
    for (const x of ['F', 'final', 'Finals', 'Grand Final', 'the grand final']) expect(canonicalRound(x)).toBe('Final');
    for (const x of ['3rd place', 'Third Place', 'Bronze final', 'third-place play-off']) expect(canonicalRound(x)).toBe('Third place');
    for (const x of ['Round 1', 'Match 3', 'Group A · Match 1', 'Preliminary Round']) expect(canonicalRound(x)).toBe(x);
  });
  it('titles read plural except the final', () => {
    expect([stageTitle('Quarter-final'), stageTitle('Semi-final'), stageTitle('Final'), stageTitle('Round 1'), stageTitle('Third place')]).toEqual(['Quarter-finals', 'Semi-finals', 'Final', 'Round 1', 'Third place']);
  });

  it('keeps the stages apart, in the order they are played, with their counts', () => {
    const r = parseFixtureJson(JSON.stringify(bracket11((x) => x)), ko(11));
    expect(r.stages).toEqual([{ name: 'Round 1', count: 3 }, { name: 'Quarter-final', count: 4 }, { name: 'Semi-final', count: 2 }, { name: 'Final', count: 1 }]);
    expect(r.counts.warn).toBe(0);
  });
  it('spellings in the paste are cleaned up', () => {
    const r = parseFixtureJson(JSON.stringify(bracket11((x) => ({ 'Quarter-final': 'QF', 'Semi-final': 'semi finals', Final: 'GRAND FINAL' } as Record<string, string>)[x] ?? x)), ko(11));
    expect(r.stages.map((s) => s.name)).toEqual(['Round 1', 'Quarter-final', 'Semi-final', 'Final']);
  });
  it('names every stage from the bracket when the paste leaves the rounds out', () => {
    const r = parseFixtureJson(JSON.stringify(bracket11(() => undefined)), ko(11));
    expect(r.rows.map((x) => x.round)).toEqual(['Round 1', 'Round 1', 'Round 1', 'Quarter-final', 'Quarter-final', 'Quarter-final', 'Quarter-final', 'Semi-final', 'Semi-final', 'Final']);
    expect(r.stages.map((s) => `${s.name}:${s.count}`)).toEqual(['Round 1:3', 'Quarter-final:4', 'Semi-final:2', 'Final:1']);
  });
  it('a team that skips round 1 and plays a quarter-final is still a quarter-final', () => {
    const r = parseFixtureJson(JSON.stringify(bracket11(() => undefined)), ko(11));
    expect(r.rows[6]).toMatchObject({ no: 7, round: 'Quarter-final', labelA: 'Team 6', labelB: 'Team 11' });
  });
  it('warns when a label does not fit where the match sits in the bracket', () => {
    const doc = bracket11((x) => x);
    doc.fixtures[9]!.round = 'Semi-final'; // the last match called a semi-final
    doc.fixtures[7]!.round = 'Final';      // a semi-final called the final
    const r = parseFixtureJson(JSON.stringify(doc), ko(11));
    expect(r.rows[9]!.issues.map((i) => i.text).join(' ')).toMatch(/Labelled Semi-final, but by the bracket this is the Final \(the last match\)/);
    expect(r.rows[7]!.issues.map((i) => i.text).join(' ')).toMatch(/Labelled Final, but by the bracket this is the Semi-final \(1 step from the final\)/);
    expect(r.counts.error).toBe(0);
  });
  it('the other 11-team shape (4 + 3 + 2 + 1) is named by its steps from the final', () => {
    const alt = { version: 2, fixtures: [
      m(1, undefined, '2026-11-02', '18:00', 'Team 7', 'Team 2'), m(2, undefined, '2026-11-02', '19:00', 'Team 10', 'Team 4'), m(3, undefined, '2026-11-02', '20:00', 'Team 1', 'Team 9'), m(4, undefined, '2026-11-02', '21:00', 'Team 6', 'Team 11'),
      m(5, undefined, '2026-11-03', '18:00', 'Winner of Match 1', 'Team 3'), m(6, undefined, '2026-11-03', '19:00', 'Winner of Match 2', 'Team 5'), m(7, undefined, '2026-11-03', '20:00', 'Winner of Match 3', 'Winner of Match 4'),
      m(8, undefined, '2026-11-04', '18:00', 'Winner of Match 5', 'Winner of Match 6'), m(9, undefined, '2026-11-04', '19:00', 'Winner of Match 7', 'Team 8'), m(10, undefined, '2026-11-05', '18:00', 'Winner of Match 8', 'Winner of Match 9'),
    ] };
    const r = parseFixtureJson(JSON.stringify(alt), ko(11));
    expect(r.stages.map((s) => `${s.name}:${s.count}`)).toEqual(['Round 1:4', 'Quarter-final:3', 'Semi-final:2', 'Final:1']);
  });
  it('a match between two losers is the third-place match, not the final', () => {
    const r = parseFixtureJson(JSON.stringify({ fixtures: [
      m(1, undefined, '2026-11-02', '18:00', 'Team 1', 'Team 2'), m(2, undefined, '2026-11-02', '19:00', 'Team 3', 'Team 4'),
      m(3, undefined, '2026-11-03', '18:00', 'Loser of Match 1', 'Loser of Match 2'), m(4, undefined, '2026-11-03', '19:00', 'Winner of Match 1', 'Winner of Match 2'),
    ] }), ko(4));
    expect(r.rows.map((x) => x.round)).toEqual(['Semi-final', 'Semi-final', 'Third place', 'Final']);
  });
  it('a plain league is left alone', () => {
    const r = parseFixtureJson(wrap(fx({ round: 'Match 1' }), fx({ round: 'Match 2', date: '2026-11-03', teamA: 'Gamma', teamB: 'Alpha' })), ctx);
    expect(r.stages).toEqual([{ name: 'Match 1', count: 1 }, { name: 'Match 2', count: 1 }]);
  });
  it('the knockout prompt asks for the standard stage names', () => {
    const k = buildFixturePrompt({ ...ctx, formatKey: 'ko', formatLabel: 'Knockout' });
    expect(k).toContain('"Quarter-final", "Semi-final" and "Final"');
    expect(k).toContain('"Third place"');
    expect(buildFixturePrompt(ctx)).not.toContain('Quarter-final');
  });
});

describe('groups (version 3)', () => {
  const g = {
    ...ctx, formatKey: 'custom' as const,
    teams: ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'].map((n) => ({ id: n, name: `T${n}` })),
  };
  const groups = [{ name: 'Group A', teams: ['TA1', 'TA2', 'TA3'] }, { name: 'Group B', teams: ['TB1', 'TB2', 'TB3'] }];
  const m = (no: number, group: string | undefined, a: string, b: string, time: string, date = '2026-11-02') => ({ match: no, ...(group ? { group } : {}), date, time, teamA: a, teamB: b });
  const groupStage = [
    m(1, 'Group A', 'TA1', 'TA2', '18:00'), m(2, 'Group B', 'TB1', 'TB2', '18:00'),
    m(3, 'Group A', 'TA1', 'TA3', '19:00'), m(4, 'Group B', 'TB1', 'TB3', '19:00'),
    m(5, 'Group A', 'TA2', 'TA3', '20:00'), m(6, 'Group B', 'TB2', 'TB3', '20:00'),
  ];
  const ko = [
    { match: 7, round: 'Semi-final', date: '2026-11-03', time: '18:00', teamA: 'Group A Rank 1', teamB: 'Group B Rank 2' },
    { match: 8, round: 'Semi-final', date: '2026-11-03', time: '19:00', teamA: 'Group B Rank 1', teamB: 'Group A Rank 2' },
    { match: 9, round: 'Final', date: '2026-11-04', time: '18:00', teamA: 'Winner of Match 7', teamB: 'Winner of Match 8' },
  ];
  const run = (fixtures: unknown[], gr: unknown = groups) => parseFixtureJson(JSON.stringify({ version: 3, groups: gr, fixtures }), g);
  const allErrs = (r: ReturnType<typeof parseFixtureJson>) => r.rows.flatMap((x) => x.issues.filter((i) => i.level === 'error').map((i) => i.text));

  it('reads groups, group matches under their group and knockout places', () => {
    const r = run([...groupStage, ...ko]);
    expect(r.fatal).toBeNull();
    expect(allErrs(r)).toEqual([]);
    expect(r.groups.map((x) => [x.name, x.teams.length])).toEqual([['Group A', 3], ['Group B', 3]]);
    expect(r.rows[0]!.group).toBe('Group A');
    expect(r.rows[0]!.round).toBe('Group A');
    expect(r.rows[6]!.a).toEqual({ kind: 'rank', pos: 1, group: 'Group A' });
    expect(r.rows[6]!.labelA).toBe('Group A Rank 1');
    expect(r.stages.map((s) => s.name)).toEqual(['Group A', 'Group B', 'Semi-final', 'Final']);
  });
  it('infers the group when both teams are in the same one', () => {
    const r = run([{ ...groupStage[0], group: undefined }, ...groupStage.slice(1), ...ko]);
    expect(r.rows[0]!.group).toBe('Group A');
  });
  it('refuses a team in two groups, a team in none, and an unknown team', () => {
    expect(run(groupStage, [{ name: 'Group A', teams: ['TA1', 'TA2', 'TA3'] }, { name: 'Group B', teams: ['TB1', 'TB2', 'TB3', 'TA1'] }]).fatal).toMatch(/only one group/);
    expect(run(groupStage, [{ name: 'Group A', teams: ['TA1', 'TA2', 'TA3'] }, { name: 'Group B', teams: ['TB1', 'TB2'] }]).fatal).toMatch(/TB3 is not in any group/);
    expect(run(groupStage, [{ name: 'Group A', teams: ['TA1', 'Nobody'] }]).fatal).toMatch(/not a team/);
  });
  it('flags mixed groups, repeated pairs and incomplete round robins', () => {
    expect(allErrs(run([m(1, 'Group A', 'TA1', 'TB1', '18:00'), ...groupStage.slice(1)]))).toContain('Both sides must be in Group A; do not mix groups in the group stage.');
    const dup = run([...groupStage, m(10, 'Group A', 'TA2', 'TA1', '21:00', '2026-11-02')]);
    expect(allErrs(dup).some((e) => /already play each other in Group A/.test(e))).toBe(true);
    const short = run(groupStage.slice(1));
    expect(allErrs(short).some((e) => /Group A must be a full round robin/.test(e))).toBe(true);
  });
  it('never lets a group match winner decide a knockout place', () => {
    const r = run([...groupStage, { match: 7, round: 'Semi-final', date: '2026-11-03', time: '18:00', teamA: 'Winner of Match 1', teamB: 'Group B Rank 2' }]);
    expect(allErrs(r).some((e) => /never from a group match winner/.test(e))).toBe(true);
  });
  it('checks places: real group, within its size, used once, after the group ends', () => {
    expect(allErrs(run([...groupStage, { ...ko[0], teamA: 'Group C Rank 1' }])).some((e) => /not one of the groups/.test(e))).toBe(true);
    expect(allErrs(run([...groupStage, { ...ko[0], teamA: 'Group A Rank 4' }])).some((e) => /only 3 teams/.test(e))).toBe(true);
    expect(allErrs(run([...groupStage, ko[0], { ...ko[1], teamA: 'Group A Rank 1' }])).some((e) => /only be used by one/.test(e))).toBe(true);
    expect(allErrs(run([...groupStage, { ...ko[0], date: '2026-11-02', time: '19:30' }])).some((e) => /only known after Group A finishes/.test(e))).toBe(true);
  });
  it('refuses a group place when the file has no groups', () => {
    const r = parseFixtureJson(JSON.stringify({ version: 3, fixtures: [ko[0]] }), g);
    expect(allErrs(r).some((e) => /needs a "groups" list/.test(e))).toBe(true);
  });
  it('custom prompts explain groups; others do not', () => {
    expect(buildFixturePrompt({ ...g, expectedMatches: 0 })).toContain('Group A Rank 1');
    expect(buildFixturePrompt({ ...ctx, expectedMatches: 3 })).not.toContain('GROUPS (use only');
  });
});

describe('strict prompt types', () => {
  it('spells out the exact types, and only custom prompts mention groups', () => {
    const custom = buildFixturePrompt({ ...ctx, formatKey: 'custom', expectedMatches: 0 });
    expect(custom).toContain('type Reply = {');
    expect(custom).toContain('version: 4;');
    expect(custom).toContain('match: number;');
    expect(custom).toContain('groups?: Group[];');
    expect(custom).toContain('{ name: string; from: string[] }');
    expect(custom).toContain('group?: string;');
    expect(custom).toContain('no trailing commas');
    const plain = buildFixturePrompt(ctx);
    expect(plain).toContain('type Fixture = {');
    expect(plain).not.toContain('groups?:');
  });
});

describe('a second stage built from places (version 4)', () => {
  const g = { ...ctx, formatKey: 'custom' as const, teams: ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'].map((n) => ({ id: n, name: `T${n}` })) };
  const base = [{ name: 'Group A', teams: ['TA1', 'TA2', 'TA3'] }, { name: 'Group B', teams: ['TB1', 'TB2', 'TB3'] }];
  const sup = { name: 'Super Four', from: ['Group A Rank 1', 'Group A Rank 2', 'Group B Rank 1', 'Group B Rank 2'] };
  const f = (match: number, group: string, a: string, b: string, date: string, time: string) => ({ match, group, date, time, teamA: a, teamB: b });
  const stage1 = [
    f(1, 'Group A', 'TA1', 'TA2', '2026-11-01', '18:00'), f(2, 'Group B', 'TB1', 'TB2', '2026-11-01', '19:00'),
    f(3, 'Group A', 'TA1', 'TA3', '2026-11-02', '18:00'), f(4, 'Group B', 'TB1', 'TB3', '2026-11-02', '19:00'),
    f(5, 'Group A', 'TA2', 'TA3', '2026-11-03', '18:00'), f(6, 'Group B', 'TB2', 'TB3', '2026-11-03', '19:00'),
  ];
  const A1 = 'Group A Rank 1', A2 = 'Group A Rank 2', B1 = 'Group B Rank 1', B2 = 'Group B Rank 2';
  const pairs: [string, string][] = [[A1, A2], [A1, B1], [A1, B2], [A2, B1], [A2, B2], [B1, B2]];
  const stage2 = pairs.map(([a, b], i) => f(7 + i, 'Super Four', a, b, `2026-11-0${4 + Math.floor(i / 2)}`, i % 2 ? '19:00' : '18:00'));
  const finals = [
    { match: 13, round: 'Semi-final', date: '2026-11-07', time: '18:00', teamA: 'Super Four Rank 1', teamB: 'Super Four Rank 4' },
    { match: 14, round: 'Semi-final', date: '2026-11-07', time: '19:00', teamA: 'Super Four Rank 2', teamB: 'Super Four Rank 3' },
    { match: 15, round: 'Final', date: '2026-11-08', time: '18:00', teamA: 'Winner of Match 13', teamB: 'Winner of Match 14' },
  ];
  const run = (fixtures: unknown[], groups: unknown[] = [...base, sup]) => parseFixtureJson(JSON.stringify({ version: 4, groups, fixtures }), g);
  const errs2 = (r: ReturnType<typeof parseFixtureJson>) => r.rows.flatMap((x) => x.issues.filter((i) => i.level === 'error').map((i) => i.text));

  it('reads a group made of places, its round robin and the knockouts after it', () => {
    const r = run([...stage1, ...stage2, ...finals]);
    expect(r.fatal).toBeNull();
    expect(errs2(r)).toEqual([]);
    expect(r.groups.map((x) => [x.name, x.from?.length ?? x.teams.length])).toEqual([['Group A', 3], ['Group B', 3], ['Super Four', 4]]);
    expect(r.rows[6]!.group).toBe('Super Four');
    expect(r.rows[6]!.round).toBe('Super Four');
    expect(r.rows[6]!.a).toEqual({ kind: 'rank', pos: 1, group: 'Group A' });
    expect(r.rows[12]!.a).toEqual({ kind: 'rank', pos: 1, group: 'Super Four' });
    expect(r.stages.map((s) => s.name)).toEqual(['Group A', 'Group B', 'Super Four', 'Semi-final', 'Final']);
  });
  it('infers the second-stage group from its places', () => {
    const r = run([...stage1, ...stage2.map((x) => ({ ...x, group: undefined })), ...finals]);
    expect(r.rows[6]!.group).toBe('Super Four');
  });
  it('refuses bad "from" lists', () => {
    expect(run(stage1, [...base, { name: 'S', from: ['Group C Rank 1', 'Group A Rank 1'] }]).fatal).toMatch(/earlier group/);
    expect(run(stage1, [...base, { name: 'S', from: ['Group A Rank 4', 'Group A Rank 1'] }]).fatal).toMatch(/only 3 places/);
    expect(run(stage1, [{ name: 'S', from: [A1, B1] }, ...base]).fatal).toMatch(/earlier group/);
    expect(run(stage1, [...base, { name: 'S', from: [A1, A1] }]).fatal).toMatch(/listed twice/);
    expect(run(stage1, [...base, { name: 'S', teams: ['TA1'], from: [A1, B1] }]).fatal).toMatch(/both "teams" and "from"/);
  });
  it('needs the second stage to be a full round robin of its places', () => {
    expect(errs2(run([...stage1, ...stage2.slice(1), ...finals])).some((e) => /Super Four must be a full round robin/.test(e))).toBe(true);
  });
  it('a place goes to one thing only, and must be played after its group ends', () => {
    expect(errs2(run([...stage1, ...stage2, ...finals, { match: 16, round: 'Final', date: '2026-11-09', time: '18:00', teamA: A1, teamB: 'Super Four Rank 1' }])).some((e) => /only be used once/.test(e))).toBe(true);
    const early = stage2.map((x, i) => (i === 0 ? { ...x, date: '2026-11-03', time: '17:30' } : x));
    expect(errs2(run([...stage1, ...early, ...finals])).some((e) => /only known after Group A finishes/.test(e))).toBe(true);
  });
  it('a second-stage match must use that group’s places', () => {
    const r = run([...stage1, { ...stage2[0], teamA: 'TA1' }, ...stage2.slice(1), ...finals]);
    expect(errs2(r).some((e) => /made of places from earlier groups/.test(e))).toBe(true);
  });
});
