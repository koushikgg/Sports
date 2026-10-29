import { describe, expect, it } from 'vitest';
import { fitMatchesPerTeam, matchesPerTeamOptions, minTeamsFor } from './index';

describe('matches per team', () => {
  it('an even number of teams can play any number up to everyone else', () => {
    expect(matchesPerTeamOptions(8)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(matchesPerTeamOptions(4)).toEqual([1, 2, 3]);
  });
  it('an odd number of teams needs an even number, since every match has two teams', () => {
    expect(matchesPerTeamOptions(7)).toEqual([2, 4, 6]);
    expect(matchesPerTeamOptions(5)).toEqual([2, 4]);
  });
  it('nothing fits fewer than two teams', () => {
    expect(matchesPerTeamOptions(1)).toEqual([]);
    expect(matchesPerTeamOptions(0)).toEqual([]);
  });
  it('left out, or everyone-plays-everyone, means the full round robin', () => {
    expect(fitMatchesPerTeam(8)).toBeUndefined();
    expect(fitMatchesPerTeam(8, null)).toBeUndefined();
    expect(fitMatchesPerTeam(8, 7)).toBeUndefined();
    expect(fitMatchesPerTeam(8, 30)).toBeUndefined();
    expect(fitMatchesPerTeam(7, 6)).toBeUndefined();
  });
  it('a value that fits is kept', () => {
    expect(fitMatchesPerTeam(8, 3)).toBe(3);
    expect(fitMatchesPerTeam(7, 4)).toBe(4);
  });
  it('a value that does not fit drops to the nearest that does', () => {
    expect(fitMatchesPerTeam(7, 3)).toBe(2);
    expect(fitMatchesPerTeam(7, 5)).toBe(4);
    expect(fitMatchesPerTeam(7, 1)).toBe(2);
    expect(fitMatchesPerTeam(6, 5)).toBeUndefined(); // 5 is everyone else
    expect(fitMatchesPerTeam(1, 3)).toBeUndefined();
  });
  it('a Table that sends 2 teams on needs 3 teams, sending 4 on needs 4', () => {
    expect(minTeamsFor('lk', 2)).toBe(3);
    expect(minTeamsFor('lk', 4)).toBe(4);
    expect(minTeamsFor('custom')).toBe(2);
  });
});
