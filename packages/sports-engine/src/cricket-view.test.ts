import { describe, expect, it } from 'vitest';
import { decide, replay, type LoggedEvent, type MatchContext, type SportEvent } from './index';
import { cricketEngine as engine, currentInnings, type CricketState } from './cricket';
import { chase, chipText, completedOvers, overSummaries, currentOverRuns, describeBall, economy, lastOutLine, oversLeftFor, projected, surname } from './cricket-view';

const squad = (p: string) => [1, 2, 3, 4].map((n) => ({ id: `${p}${n}`, name: `${p.toUpperCase()} Player${n}` }));
const ctx: MatchContext = { matchId: 'm', teams: [{ id: 'A', name: 'Alpha' }, { id: 'B', name: 'Beta' }], players: { A: squad('a'), B: squad('b') }, config: { overs: 3 } };
const names = Object.fromEntries([...squad('a'), ...squad('b')].map((p) => [p.id, p.name]));
const ev = (type: string, payload: Record<string, unknown> = {}): SportEvent => ({ type, payload });
const ball = (runs = 0, extra?: Record<string, unknown>) => ev('ball', { runs, ...extra });

function play(events: SportEvent[]) {
  const log: LoggedEvent[] = [];
  for (const e of events) {
    const d = decide(engine, ctx, log, e);
    if (!d.ok) throw new Error(d.error);
    log.push({ seq: log.length + 1, ...d.value.event });
  }
  return replay(engine, ctx, log) as CricketState;
}
const setup = [ev('toss', { winnerTeamId: 'A', decision: 'bat' }), ev('start_innings', { strikerId: 'a1', nonStrikerId: 'a2', bowlerId: 'b1' })];

describe('cricket view helpers', () => {
  it('chip text: bullet for dots, lowercase extras, wickets untouched', () => {
    expect(chipText({ label: '0', kind: 'dot' })).toBe('•');
    expect(chipText({ label: 'Nb+4', kind: 'extra' })).toBe('nb+4');
    expect(chipText({ label: 'W+1', kind: 'wicket' })).toBe('W+1');
    expect(chipText({ label: '4', kind: 'four' })).toBe('4');
  });

  it('surnames', () => {
    expect(surname('Rohan Das')).toBe('Das');
    expect(surname('Madonna')).toBe('Madonna');
  });

  it('previous overs only include completed ones, with runs and chips', () => {
    const s = play([...setup, ball(1), ball(0), ball(4), ball(0), ball(0), ball(2), ev('new_bowler', { playerId: 'b2' }), ball(6), ball(1)]);
    const inn = currentInnings(s)!;
    const done = completedOvers(inn);
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ no: 1, runs: 7 });
    expect(done[0]!.chips.map(chipText)).toEqual(['1', '•', '4', '•', '•', '2']);
    expect(currentOverRuns(inn)).toBe(7); // 6 + 1 in over 2
  });

  it('counts wides in the over that they were bowled in', () => {
    const s = play([...setup, ball(0, { extra: 'wd' }), ball(0), ball(0), ball(0), ball(0), ball(0), ball(1)]);
    const done = completedOvers(currentInnings(s)!);
    expect(done[0]!.chips.map(chipText)).toEqual(['wd', '•', '•', '•', '•', '•', '1']);
    expect(done[0]!.runs).toBe(2);
  });

  it('describes balls', () => {
    const s = play([...setup, ball(0), ball(4), ball(6), ball(2), ball(1, { extra: 'lb' }), ball(0, { wicket: { kind: 'caught', playerId: 'a2', fielderId: 'b3' } })]);
    const inn = currentInnings(s)!;
    const text = inn.log.map((l) => describeBall(l, names, inn));
    expect(text[0]).toBe('Dot ball to Player1.');
    expect(text[1]).toBe('Player1 finds the rope. Four.');
    expect(text[2]).toBe('Player1 clears the boundary. Six.');
    expect(text[3]).toBe('Player1 takes 2.');
    expect(text[4]).toBe('Leg byes, 1 to the total.');
    // a1 faced the leg bye, then strike swapped, so a2 has faced only the wicket ball
    expect(text[5]).toBe('A Player2 c B Player3 b B Player1. 0 (1).');
  });

  it('says who left the crease for the new-batter prompt', () => {
    const s = play([...setup, ball(2), ball(0, { wicket: { kind: 'bowled', playerId: 'a1' } })]);
    expect(s.awaiting).toBe('batter');
    expect(lastOutLine(s, names)).toBe('A Player1 b B Player1. 2 (2).');
  });

  it('chase maths, projection, economy and overs left', () => {
    const s = play([...setup, ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ev('new_bowler', { playerId: 'b2' }), ball(0), ball(0), ball(0), ball(0), ball(0), ball(0), ev('new_bowler', { playerId: 'b1' }), ball(0), ball(0), ball(0), ball(0), ball(0), ball(0),
      ev('start_innings', { strikerId: 'b1', nonStrikerId: 'b2', bowlerId: 'a1' }), ball(4)]);
    const inn = currentInnings(s)!;
    const c = chase(s, inn)!;
    expect(c.need).toBe(33);
    expect(c.left).toBe(17);
    expect(c.rrr).toBeCloseTo((33 / 17) * 6, 5);
    expect(projected(inn, s.overs)).toBe(72); // 4 off 1 ball => 24/over * 3
    expect(economy({ legalBalls: 6, runs: 9 })).toBe('9.00');
    expect(oversLeftFor({ legalBalls: 7 }, 4)).toBe(2);
    expect(oversLeftFor({ legalBalls: 7 }, null)).toBeNull();
  });

  it('no chase equation in the first innings', () => {
    const s = play(setup);
    expect(chase(s, currentInnings(s)!)).toBeNull();
  });

  it('over summaries: done / live / future, with runs and wickets per over', () => {
    const s = play([...setup, ball(1), ball(0), ball(4), ball(0), ball(0), ball(2), ev('new_bowler', { playerId: 'b2' }), ball(6), ball(0, { wicket: { kind: 'bowled', playerId: 'a1' } })]);
    const o = overSummaries(currentInnings(s)!, 3);
    expect(o.map((x) => x.state)).toEqual(['done', 'live', 'future']);
    expect(o[0]).toMatchObject({ no: 1, runs: 7, wickets: 0 });
    expect(o[1]).toMatchObject({ no: 2, runs: 6, wickets: 1 });
    expect(o[2]).toMatchObject({ runs: 0, wickets: 0 });
  });

  it('over summaries: a closed innings has no live over', () => {
    const s = play([...setup, ev('end_innings')]);
    expect(overSummaries(currentInnings(s)!, 3).every((x) => x.state !== 'live')).toBe(true);
  });
});
