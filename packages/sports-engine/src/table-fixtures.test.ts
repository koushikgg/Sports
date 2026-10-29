import { describe, expect, it } from 'vitest';
import { gapMinutesFor, generateTableFixtures, type TableInput } from './table-fixtures';

const teams = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, name: `Team ${i + 1}` }));
const base = (n: number, o: Partial<TableInput> = {}): TableInput => ({ teams: teams(n), qualify: 4, startDate: '2026-11-02', perDay: 2, firstMatchTime: '18:00', restDay: false, gapMinutes: 120, venues: [], tz: -330, ...o });
const league = (f: ReturnType<typeof generateTableFixtures>) => f.filter((x) => x.a.kind === 'team');
const id = (s: any) => s.id as string;

describe('table fixtures: the league', () => {
  it('everyone plays everyone exactly once', () => {
    for (const n of [3, 4, 5, 6, 8, 11]) {
      const l = league(generateTableFixtures(base(n)));
      expect(l).toHaveLength((n * (n - 1)) / 2);
      const pairs = new Set(l.map((x) => [id(x.a), id(x.b)].sort().join('|')));
      expect(pairs.size).toBe(l.length);
    }
  });
  it('nobody plays twice in a round, and an odd field gives each team one rest round', () => {
    const f = league(generateTableFixtures(base(5)));
    const rounds = new Map<string, string[]>();
    for (const x of f) rounds.set(x.round!, [...(rounds.get(x.round!) ?? []), id(x.a), id(x.b)]);
    expect(rounds.size).toBe(5);
    for (const ids of rounds.values()) expect(new Set(ids).size).toBe(ids.length);
    const sat = [...rounds.values()].map((ids) => teams(5).find((t) => !ids.includes(t.id))!.id);
    expect(new Set(sat).size).toBe(5);
  });
  it('numbers the matches in order and labels the rounds', () => {
    const f = generateTableFixtures(base(4));
    expect(f.map((x) => x.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(f.slice(0, 6).map((x) => x.round)).toEqual(['Round 1', 'Round 1', 'Round 2', 'Round 2', 'Round 3', 'Round 3']);
  });
  it('shares home and away: nobody is far from even', () => {
    for (const n of [4, 5, 6, 8, 11]) {
      const f = league(generateTableFixtures(base(n)));
      for (const t of teams(n)) {
        const diff = f.filter((x) => id(x.a) === t.id).length - f.filter((x) => id(x.b) === t.id).length;
        expect(Math.abs(diff)).toBeLessThanOrEqual(2);
      }
    }
  });
});

describe('table fixtures: the schedule', () => {
  it('puts perDay matches on each day from the first match time, spaced by the gap', () => {
    const f = generateTableFixtures(base(4));
    expect(f.slice(0, 6).map((x) => `${x.date} ${x.time}`)).toEqual([
      '2026-11-02 18:00', '2026-11-02 20:00', '2026-11-03 18:00', '2026-11-03 20:00', '2026-11-04 18:00', '2026-11-04 20:00',
    ]);
  });
  it('shrinks the gap so the last match of a day starts before 23:00', () => {
    const f = generateTableFixtures(base(4, { perDay: 4, gapMinutes: 200 }));
    expect(f.slice(0, 4).map((x) => x.time)).toEqual(['18:00', '19:40', '21:20', '23:00']);
    expect(f.every((x) => x.time <= '23:59')).toBe(true);
  });
  it('one match a day uses one day each', () => {
    const f = generateTableFixtures(base(3, { perDay: 1, qualify: 2 }));
    expect(f.map((x) => x.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);
  });
  it('a rest day leaves an empty day after each round', () => {
    const f = generateTableFixtures(base(4, { restDay: true }));
    expect(league(f).map((x) => x.date)).toEqual(['2026-11-02', '2026-11-02', '2026-11-04', '2026-11-04', '2026-11-06', '2026-11-06']);
  });
  it('gives each day one venue, rotating through the venues', () => {
    const f = generateTableFixtures(base(4, { venues: ['Main', 'Nets'] }));
    expect(f.slice(0, 6).map((x) => x.venue)).toEqual(['Main', 'Main', 'Nets', 'Nets', 'Main', 'Main']);
    expect(generateTableFixtures(base(4))[0]!.venue).toBeNull();
  });
  it('stores the timezone with every fixture and starts none of them as a match', () => {
    const f = generateTableFixtures(base(4));
    expect(f.every((x) => x.tz === -330 && x.matchId === null)).toBe(true);
  });
  it('gap by sport: cricket follows the overs', () => {
    expect(gapMinutesFor('cricket', 20)).toBe(200);
    expect(gapMinutesFor('cricket', 10)).toBe(120);
    expect(gapMinutesFor('cricket', 2)).toBe(60);
    expect(gapMinutesFor('foosball')).toBe(60);
  });
});

describe('table fixtures: the knockouts', () => {
  it('top 4: semi-finals are 1st v 4th and 2nd v 3rd, then a final between their winners', () => {
    const f = generateTableFixtures(base(6));
    expect(f).toHaveLength(15 + 3);
    const [s1, s2, fin] = f.slice(15);
    expect(s1).toMatchObject({ no: 16, round: 'Semi-final', a: { kind: 'rank', pos: 1 }, b: { kind: 'rank', pos: 4 } });
    expect(s2).toMatchObject({ no: 17, round: 'Semi-final', a: { kind: 'rank', pos: 2 }, b: { kind: 'rank', pos: 3 } });
    expect(fin).toMatchObject({ no: 18, round: 'Final', a: { kind: 'winner', match: 16 }, b: { kind: 'winner', match: 17 } });
  });
  it('top 2: only a final, between 1st and 2nd', () => {
    const f = generateTableFixtures(base(5, { qualify: 2 }));
    expect(f).toHaveLength(10 + 1);
    expect(f[10]).toMatchObject({ no: 11, round: 'Final', a: { kind: 'rank', pos: 1 }, b: { kind: 'rank', pos: 2 } });
  });
  it('the knockouts start the day after the league ends, the semis share a day, the final is the day after', () => {
    const f = generateTableFixtures(base(4));
    expect(f[5]!.date).toBe('2026-11-04');
    expect(f.slice(6).map((x) => `${x.round} ${x.date} ${x.time}`)).toEqual(['Semi-final 2026-11-05 18:00', 'Semi-final 2026-11-05 20:00', 'Final 2026-11-06 18:00']);
  });
  it('with one match a day the semis take two days', () => {
    const f = generateTableFixtures(base(4, { perDay: 1 }));
    expect(f.slice(6).map((x) => x.date)).toEqual(['2026-11-08', '2026-11-09', '2026-11-10']);
  });
  it('a rest day also sits before the final', () => {
    const f = generateTableFixtures(base(4, { restDay: true }));
    const [s1, s2, fin] = f.slice(6);
    expect(s1!.date).toBe(s2!.date);
    expect(new Date(fin!.date).getTime() - new Date(s1!.date).getTime()).toBe(2 * 86400000);
  });
  it('a knockout never starts before its sources are played', () => {
    const f = generateTableFixtures(base(8));
    const when = (x: { date: string; time: string }) => `${x.date} ${x.time}`;
    const lastLeague = league(f).map(when).sort().at(-1)!;
    for (const x of f.filter((y) => y.a.kind !== 'team')) expect(when(x) > lastLeague).toBe(true);
    expect(when(f.at(-1)!) > when(f.at(-3)!)).toBe(true);
  });
  it('makes nothing for fewer than two teams', () => {
    expect(generateTableFixtures(base(1))).toEqual([]);
  });
});
