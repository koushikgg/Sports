import { BALLS_PER_OVER, formatOvers, inningsOvers, targetRuns, type BatterStat, type BowlerStat, type Chip, type CricketState, type Innings, type LogItem } from './cricket';

/** Pure helpers behind the scorer UI. No React, no I/O, so they can be tested. */

export type Names = Record<string, string>;

export const nameOf = (names: Names, id: string | null | undefined) => (id ? (names[id] ?? '?') : '');
export const surname = (name: string) => name.trim().split(/\s+/).slice(-1)[0] ?? name;
export const surnameOf = (names: Names, id: string | null | undefined) => surname(nameOf(names, id));

/** Text drawn inside a chip: dots are a bullet, extras are lowercase (wd, nb+4, 2lb). */
export function chipText(chip: Chip): string {
  if (chip.kind === 'dot') return '•';
  return chip.kind === 'extra' ? chip.label.toLowerCase() : chip.label;
}

export const bowlerFigure = (b: Pick<BowlerStat, 'legalBalls' | 'maidens' | 'runs' | 'wickets'>) =>
  `${formatOvers(b.legalBalls)}-${b.maidens}-${b.runs}-${b.wickets}`;

export const economy = (b: Pick<BowlerStat, 'legalBalls' | 'runs'>) =>
  b.legalBalls ? ((b.runs * BALLS_PER_OVER) / b.legalBalls).toFixed(2) : '0.00';

export const strikeRate = (b: Pick<BatterStat, 'runs' | 'balls'>, empty = '0.0') =>
  b.balls ? ((b.runs / b.balls) * 100).toFixed(1) : empty;

export function howOut(b: BatterStat, names: Names, innings: Innings): string {
  const o = b.out;
  if (!o) return innings.striker === b.id || innings.nonStriker === b.id ? 'batting' : 'not out';
  const bowler = nameOf(names, o.bowlerId);
  const fielder = nameOf(names, o.fielderId);
  switch (o.kind) {
    case 'bowled': return `b ${bowler}`;
    case 'caught': return fielder && o.fielderId === o.bowlerId ? `c & b ${bowler}` : `c ${fielder || '?'} b ${bowler}`;
    case 'lbw': return `lbw b ${bowler}`;
    case 'stumped': return `st ${fielder || '?'} b ${bowler}`;
    case 'hit_wicket': return `hit wicket b ${bowler}`;
    case 'run_out': return fielder ? `run out (${fielder})` : 'run out';
    case 'retired_hurt': return 'retired hurt';
    case 'retired_out': return 'retired out';
  }
}

/** Overs that are fully bowled, oldest first, with their runs and chips. */
export function completedOvers(inn: Innings): { no: number; runs: number; chips: Chip[] }[] {
  const done = Math.floor(inn.legalBalls / BALLS_PER_OVER);
  const byOver = new Map<number, LogItem[]>();
  for (const item of inn.log) {
    const idx = Number(item.over.split('.')[0]);
    if (idx < done) byOver.set(idx, [...(byOver.get(idx) ?? []), item]);
  }
  return [...byOver].sort((a, b) => a[0] - b[0]).map(([idx, items]) => ({
    no: idx + 1,
    runs: items.reduce((n, i) => n + i.runs, 0),
    chips: items.map((i) => i.chip),
  }));
}

/** Runs scored in the over in progress. */
export function currentOverRuns(inn: Innings): number {
  const done = Math.floor(inn.legalBalls / BALLS_PER_OVER);
  return inn.log.filter((i) => Number(i.over.split('.')[0]) >= done).reduce((n, i) => n + i.runs, 0);
}

const EXTRA_NAME = (label: string) =>
  /^wd/i.test(label) ? 'Wide' : /^nb/i.test(label) ? 'No ball' : /lb$/i.test(label) ? 'Leg byes' : 'Byes';

/** One line of commentary for the ball log. */
export function describeBall(item: LogItem, names: Names, innings: Innings): string {
  const bat = surnameOf(names, item.batterId);
  const { chip } = item;
  if (item.wicket) {
    const out = innings.batters[item.wicket.playerId];
    const detail = out ? howOut(out, names, innings) : item.wicket.kind.replace('_', ' ');
    return `${nameOf(names, item.wicket.playerId)} ${detail}.${out ? ` ${out.runs} (${out.balls}).` : ''}`;
  }
  if (chip.kind === 'extra') return `${EXTRA_NAME(chip.label)}, ${item.runs} to the total.`;
  if (chip.kind === 'dot') return `Dot ball to ${bat}.`;
  if (chip.kind === 'four') return `${bat} finds the rope. Four.`;
  if (chip.kind === 'six') return `${bat} clears the boundary. Six.`;
  return `${bat} takes ${item.runs}.`;
}

/** Who just left the crease, for the new-batter prompt. */
export function lastOutLine(s: CricketState, names: Names): string {
  const inn = s.innings.at(-1);
  const id = s.lastAction?.playerId;
  if (!inn || !id) return '';
  const b = inn.batters[id];
  if (!b) return '';
  const how = b.out ? howOut(b, names, inn) : '';
  return `${nameOf(names, id)} ${how}. ${b.runs} (${b.balls}).`;
}

export const target = (s: CricketState) => targetRuns(s);

export function chase(s: CricketState, inn: Innings) {
  if (s.innings.length !== 2) return null;
  const need = target(s) - inn.runs;
  const left = s.overs * BALLS_PER_OVER - inn.legalBalls;
  return { need, left, rrr: need > 0 && left > 0 ? (need / left) * BALLS_PER_OVER : null };
}

export const projected = (inn: Innings, overs: number) =>
  inn.legalBalls ? Math.round((inn.runs / inn.legalBalls) * BALLS_PER_OVER * overs) : 0;

export const oversLeftFor = (b: Pick<BowlerStat, 'legalBalls'> | undefined, max: number | null) =>
  max ? Math.max(0, max - Math.ceil((b?.legalBalls ?? 0) / BALLS_PER_OVER)) : null;

export interface OverSummary {
  no: number;
  runs: number;
  wickets: number;
  /** done: fully bowled; live: in progress; future: not started. */
  state: 'done' | 'live' | 'future';
}

/** One entry per over of the innings, for the runs-per-over chart. */
export function overSummaries(inn: Innings, totalOvers: number): OverSummary[] {
  const doneOvers = Math.floor(inn.legalBalls / BALLS_PER_OVER);
  return Array.from({ length: totalOvers }, (_, i) => {
    const items = inn.log.filter((l) => Number(l.over.split('.')[0]) === i);
    return {
      no: i + 1,
      runs: items.reduce((n, l) => n + l.runs, 0),
      wickets: items.filter((l) => l.wicket).length,
      state: i < doneOvers ? 'done' : i === doneOvers && items.length > 0 && !inn.closed ? 'live' : 'future',
    };
  });
}

/**
 * Per-team figures for net run rate from a finished two-innings match.
 * A side that was bowled out is charged the full quota of overs, as the rules say.
 */
export function matchTeamStats(s: CricketState): Record<string, { runsFor: number; ballsFaced: number; runsAgainst: number; ballsBowled: number }> | null {
  if (s.innings.length < 2) return null;
  const out: Record<string, { runsFor: number; ballsFaced: number; runsAgainst: number; ballsBowled: number }> = {};
  const get = (id: string) => (out[id] ??= { runsFor: 0, ballsFaced: 0, runsAgainst: 0, ballsBowled: 0 });
  for (const inn of s.innings) {
    const faced = inn.closeReason === 'all_out' ? inningsOvers(s, inn) * BALLS_PER_OVER : inn.legalBalls;
    const bat = get(inn.battingTeamId), bowl = get(inn.bowlingTeamId);
    bat.runsFor += inn.runs; bat.ballsFaced += faced;
    bowl.runsAgainst += inn.runs; bowl.ballsBowled += faced;
  }
  return out;
}
