import { describe, expect, it } from 'vitest';
import { addDays, planTournament, previewRound1, projectKnockout, projectLeagueKnockout, toInstant } from './tournament-plan';
import { computeStandings, type FinishedMatch } from './standings';

const base = { qualify: 4 as const, perDay: 2, restDay: false, startDate: '2026-12-06', endDate: '2026-12-20' };

describe('planTournament', () => {
  it('league: n(n-1)/2 matches, no knockouts', () => {
    const p = planTournament({ ...base, formatKey: 'league', teams: 6 });
    expect(p).toMatchObject({ leagueMatches: 15, knockoutMatches: 0, totalMatches: 15, matchDays: 8, lastMatchDate: '2026-12-13', overrun: false });
  });
  it('league + knockouts: semis and a final for top 4, a final for top 2', () => {
    expect(planTournament({ ...base, formatKey: 'lk', teams: 6 })).toMatchObject({ leagueMatches: 15, knockoutMatches: 3, totalMatches: 18 });
    expect(planTournament({ ...base, formatKey: 'lk', teams: 6, qualify: 2 }).knockoutMatches).toBe(1);
  });
  it('knockout: n-1 matches over ceil(log2 n) rounds', () => {
    expect(planTournament({ ...base, formatKey: 'ko', teams: 8 })).toMatchObject({ totalMatches: 7, rounds: 3 });
  });
  it('rest days add a day between rounds', () => {
    const a = planTournament({ ...base, formatKey: 'league', teams: 6 });
    const b = planTournament({ ...base, formatKey: 'league', teams: 6, restDay: true });
    expect(b.matchDays).toBe(a.matchDays + (b.rounds - 1));
  });
  it('flags a schedule that runs past the end date', () => {
    expect(planTournament({ ...base, formatKey: 'league', teams: 10, perDay: 1 }).overrun).toBe(true);
  });
  it('date maths crosses month and year ends', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });
});

describe('previewRound1', () => {
  it('pairs first v last and spreads matches over days and slots', () => {
    const p = previewRound1(['A', 'B', 'C', 'D', 'E', 'F'], 2, '2026-12-06', '18:00');
    expect(p.map((x) => [x.a, x.b])).toEqual([['A', 'F'], ['B', 'E'], ['C', 'D']]);
    expect(p.map((x) => `${x.date} ${x.time}`)).toEqual(['2026-12-06 18:00', '2026-12-06 21:00', '2026-12-07 18:00']);
  });
  it('an odd number of teams gives one a bye', () => {
    expect(previewRound1(['A', 'B', 'C'], 1, '2026-12-06', '18:00')).toHaveLength(1);
  });
});

describe('toInstant', () => {
  it('turns the organiser local time into the right instant', () => {
    // India is UTC+5:30, so getTimezoneOffset() is -330
    expect(toInstant('2026-12-06', '18:00', -330).toISOString()).toBe('2026-12-06T12:30:00.000Z');
    expect(toInstant('2026-12-06', '18:00', 0).toISOString()).toBe('2026-12-06T18:00:00.000Z');
  });
});

describe('computeStandings', () => {
  const pts = { win: 2, tie: 1, noResult: 1 };
  const m = (a: string, b: string, w: string | null, outcome: FinishedMatch['outcome'] = 'win', stats?: FinishedMatch['stats']): FinishedMatch => ({ teamAId: a, teamBId: b, winnerTeamId: w, outcome, stats });

  it('awards points for wins and orders the table by them', () => {
    // A beats B and C, B beats C
    const t = computeStandings(['C', 'B', 'A'], [m('A', 'B', 'A'), m('A', 'C', 'A'), m('B', 'C', 'B')], pts, 'NRR');
    expect(t.map((r) => [r.teamId, r.points, r.won, r.lost])).toEqual([['A', 4, 2, 0], ['B', 2, 1, 1], ['C', 0, 0, 2]]);
  });

  it('ties and no results score their own points and are counted', () => {
    const t = computeStandings(['A', 'B'], [m('A', 'B', null, 'tie'), m('A', 'B', null, 'no_result')], pts, 'WINS');
    expect(t[0]).toMatchObject({ played: 2, tied: 1, noResult: 1, points: 2, won: 0 });
  });

  it('net run rate breaks a points tie', () => {
    const stat = (rf: number, bf: number, ra: number, bb: number) => ({ runsFor: rf, ballsFaced: bf, runsAgainst: ra, ballsBowled: bb });
    // A beat B by a lot, C beat D narrowly; all on 2 points
    const t = computeStandings(['A', 'B', 'C', 'D'], [
      m('A', 'B', 'A', 'win', { A: stat(180, 120, 100, 120), B: stat(100, 120, 180, 120) }),
      m('C', 'D', 'C', 'win', { C: stat(150, 120, 148, 120), D: stat(148, 120, 150, 120) }),
    ], pts, 'NRR');
    expect(t.map((r) => r.teamId).slice(0, 2)).toEqual(['A', 'C']);
    expect(t[0]!.diff).toBeCloseTo(4, 5); // (180-100)/20 overs
  });

  it('head to head ranks the winner of the direct match above a team level on points', () => {
    // A and B both end on 2 points (one win each). B beat A directly, so B is above A under head to head;
    // under WINS neither is ahead (one win each, no stats) so the original order (A first) stands.
    const games = [m('A', 'B', 'B'), m('A', 'C', 'A'), m('B', 'D', 'D')];
    const order = (tb: string) => computeStandings(['A', 'B', 'C', 'D'], games, pts, tb).map((r) => r.teamId);
    const rows = computeStandings(['A', 'B', 'C', 'D'], games, pts, 'WINS');
    expect(rows.find((r) => r.teamId === 'A')!.points).toBe(2);
    expect(rows.find((r) => r.teamId === 'B')!.points).toBe(2);
    expect(order('HEAD TO HEAD').indexOf('B')).toBeLessThan(order('HEAD TO HEAD').indexOf('A'));
    expect(order('WINS').indexOf('A')).toBeLessThan(order('WINS').indexOf('B'));
  });

  it('with the WINS tiebreak, more wins beat more draws on the same points', () => {
    // A: win + no result = 3 points, 1 win. C: three ties = 3 points, 0 wins. C is listed first on purpose.
    const games = [m('A', 'X', 'A'), m('A', 'Y', null, 'no_result'), m('C', 'P', null, 'tie'), m('C', 'Q', null, 'tie'), m('C', 'R', null, 'tie')];
    const t = computeStandings(['C', 'A', 'X', 'Y', 'P', 'Q', 'R'], games, pts, 'WINS');
    expect(t[0]!.teamId).toBe('A');
    expect(t[1]!.teamId).toBe('C');
    expect(t[0]!.points).toBe(t[1]!.points);
  });

  it('form is the last five results, oldest first', () => {
    const winners = ['A', 'B', 'A', 'A', 'B', 'A', 'A'];
    const t = computeStandings(['A', 'B'], winners.map((w) => m('A', 'B', w)), pts, 'WINS');
    expect(t.find((r) => r.teamId === 'A')!.form).toEqual(['W', 'W', 'L', 'W', 'W']);
  });

  it('ignores matches for teams that are not in the table', () => {
    const t = computeStandings(['A', 'B'], [m('A', 'X', 'A')], pts, 'WINS');
    expect(t.find((r) => r.teamId === 'A')).toMatchObject({ played: 1, won: 1 });
  });
});

describe('projected brackets', () => {
  const seeds = (r: ReturnType<typeof projectKnockout>) => r[0]!.ties.map((t) => [t.a.seed, t.b.seed]);

  it('8 teams: standard seeding 1v8, 4v5, 2v7, 3v6 over QF, SF, final', () => {
    const r = projectKnockout(8);
    expect(seeds(r)).toEqual([[0, 7], [3, 4], [1, 6], [2, 5]]);
    expect(r.map((x) => x.name)).toEqual(['QUARTER-FINALS', 'SEMI-FINALS', 'FINAL']);
    expect(r.map((x) => x.ties.length)).toEqual([4, 2, 1]);
  });

  it('4 teams: 1v4 and 2v3', () => {
    expect(seeds(projectKnockout(4))).toEqual([[0, 3], [1, 2]]);
  });

  it('6 teams: the top two seeds get a bye in round one', () => {
    const first = projectKnockout(6)[0]!;
    const byes = first.ties.filter((t) => t.a.bye || t.b.bye);
    expect(byes).toHaveLength(2);
    expect(byes.map((t) => (t.a.bye ? t.b.seed : t.a.seed)).sort()).toEqual([0, 1]);
  });

  it('every real seed appears exactly once in round one', () => {
    const seen = projectKnockout(7)[0]!.ties.flatMap((t) => [t.a.seed, t.b.seed]).filter((x) => x !== null);
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('league + knockouts: semis 1v4 and 2v3, or a straight final for the top two', () => {
    expect(projectLeagueKnockout(4)[0]!.ties.map((t) => [t.a.seed, t.b.seed])).toEqual([[0, 3], [1, 2]]);
    expect(projectLeagueKnockout(2)).toHaveLength(1);
  });

  it('a lone team has no bracket', () => {
    expect(projectKnockout(1)).toEqual([]);
  });
});
