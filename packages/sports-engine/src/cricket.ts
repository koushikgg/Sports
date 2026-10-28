import { z } from 'zod';
import type { Result, ScoreSummary } from '@sports/shared';
import type { MatchContext, SportEngine, SportEvent } from './index';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const WICKET_KINDS = ['bowled', 'caught', 'lbw', 'stumped', 'hit_wicket', 'run_out', 'retired_out'] as const;
export type WicketKind = (typeof WICKET_KINDS)[number];
/** Dismissals credited to the bowler. */
const BOWLER_WICKETS = new Set<string>(['bowled', 'caught', 'lbw', 'stumped', 'hit_wicket']);

export type Extra = 'wd' | 'nb' | 'b' | 'lb';

export interface Chip {
  label: string;
  kind: 'dot' | 'run' | 'four' | 'six' | 'wicket' | 'extra';
}

export interface BatterStat {
  id: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: null | { kind: WicketKind | 'retired_hurt'; bowlerId?: string; fielderId?: string };
}

export interface BowlerStat {
  id: string;
  legalBalls: number;
  runs: number;
  wickets: number;
  maidens: number;
  wides: number;
  noBalls: number;
  /** Runs conceded in the over in progress, for maiden detection. */
  overRuns: number;
}

export interface LogItem {
  over: string;
  bowlerId: string;
  batterId: string;
  chip: Chip;
  runs: number;
  wicket?: { playerId: string; kind: WicketKind };
}

export interface Innings {
  battingTeamId: string;
  bowlingTeamId: string;
  runs: number;
  wickets: number;
  legalBalls: number;
  extras: { wd: number; nb: number; b: number; lb: number; pen: number };
  batters: Record<string, BatterStat>;
  /** Batting order as players arrived at the crease. */
  order: string[];
  bowlers: Record<string, BowlerStat>;
  striker: string | null;
  nonStriker: string | null;
  bowler: string | null;
  lastBowler: string | null;
  thisOver: Chip[];
  log: LogItem[];
  fow: { runs: number; wickets: number; playerId: string; over: string }[];
  partnership: { runs: number; balls: number };
  closed: boolean;
  closeReason?: 'all_out' | 'overs' | 'target' | 'declared';
}

export type Awaiting = 'toss' | 'innings_start' | 'batter' | 'bowler' | 'ball' | 'complete';

export interface CricketResult {
  winnerTeamId: string | null;
  text: string;
}

export interface CricketState {
  kind: 'cricket';
  overs: number;
  maxOversPerBowler: number | null;
  maxWicketsCfg: number | null;
  teams: { id: string; name: string }[];
  squads: Record<string, string[]>;
  toss: { winnerTeamId: string; decision: 'bat' | 'bowl' } | null;
  innings: Innings[];
  awaiting: Awaiting;
  result: CricketResult | null;
  /** Match rules that change what the engine accepts. */
  rules: { freeHit: boolean };
  /** The next delivery is a free hit (the previous legal-or-not delivery was a no-ball). */
  freeHit: boolean;
  /** The most recent event still in force, so the UI can say what Undo would remove. */
  lastAction: { type: string; label: string; playerId?: string } | null;
}

// ---------------------------------------------------------------------------
// Helpers (exported for the UI)
// ---------------------------------------------------------------------------

export const BALLS_PER_OVER = 6;

export const formatOvers = (legalBalls: number) =>
  `${Math.floor(legalBalls / BALLS_PER_OVER)}.${legalBalls % BALLS_PER_OVER}`;

/** Ball number as scorers write it: the sixth ball of the first over is 0.6, not 1.0. */
export const ballLabel = (legalBalls: number) =>
  legalBalls <= 0
    ? '0.0'
    : `${Math.floor((legalBalls - 1) / BALLS_PER_OVER)}.${((legalBalls - 1) % BALLS_PER_OVER) + 1}`;

export const currentInnings = (s: CricketState): Innings | undefined => s.innings.at(-1);

export function maxWicketsFor(s: CricketState, teamId: string): number {
  const squad = s.squads[teamId]?.length ?? 0;
  return Math.min(s.maxWicketsCfg ?? Infinity, Math.max(squad - 1, 0));
}

export const runRate = (inn: Innings) => (inn.legalBalls ? (inn.runs * BALLS_PER_OVER) / inn.legalBalls : 0);

export const otherTeam = (s: CricketState, teamId: string) =>
  s.teams.find((t) => t.id !== teamId)!.id;

export function battingFirstId(s: CricketState): string | null {
  if (!s.toss) return null;
  const { winnerTeamId, decision } = s.toss;
  return decision === 'bat' ? winnerTeamId : otherTeam(s, winnerTeamId);
}

function deriveAwaiting(s: CricketState): Awaiting {
  if (s.result) return 'complete';
  if (!s.toss) return 'toss';
  const inn = currentInnings(s);
  if (!inn || inn.closed) return 'innings_start';
  if (inn.striker === null || inn.nonStriker === null) return 'batter';
  if (inn.bowler === null) return 'bowler';
  return 'ball';
}

// ---------------------------------------------------------------------------
// Event payloads
// ---------------------------------------------------------------------------

const id = z.string().min(1);

const schemas = {
  toss: z.object({ winnerTeamId: id, decision: z.enum(['bat', 'bowl']) }),
  start_innings: z.object({ strikerId: id, nonStrikerId: id, bowlerId: id }),
  new_batter: z.object({ playerId: id }),
  new_bowler: z.object({ playerId: id }),
  ball: z.object({
    runs: z.number().int().min(0).max(7).default(0),
    extra: z.enum(['wd', 'nb', 'b', 'lb']).optional(),
    /** For a no-ball: who the runs belong to. */
    nbKind: z.enum(['bat', 'b', 'lb']).optional(),
    wicket: z.object({ kind: z.enum(WICKET_KINDS), playerId: id, fielderId: id.optional() }).optional(),
  }),
  swap_strike: z.object({}),
  retire: z.object({ playerId: id, kind: z.enum(['retired_hurt', 'retired_out']) }),
  penalty: z.object({ runs: z.number().int().min(1).max(10) }),
  end_innings: z.object({}),
  finish: z.object({ outcome: z.enum(['tie', 'no_result', 'win']), winnerTeamId: id.optional() }),
} as const;

type EventType = keyof typeof schemas;
const isEventType = (t: string): t is EventType => t in schemas;

const fail = (error: string): Result => ({ ok: false, error });
const OK: Result = { ok: true, value: undefined };

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

function initialState(ctx: MatchContext): CricketState {
  const cfg = ctx.config;
  const state: CricketState = {
    kind: 'cricket',
    overs: Number(cfg.overs ?? 5),
    maxOversPerBowler: cfg.maxOversPerBowler ? Number(cfg.maxOversPerBowler) : null,
    maxWicketsCfg: cfg.maxWickets ? Number(cfg.maxWickets) : null,
    teams: ctx.teams,
    squads: Object.fromEntries(ctx.teams.map((t) => [t.id, (ctx.players?.[t.id] ?? []).map((p) => p.id)])),
    toss: null,
    innings: [],
    awaiting: 'toss',
    result: null,
    rules: { freeHit: cfg.freeHit === true },
    freeHit: false,
    lastAction: null,
  };
  return state;
}

function validate(s: CricketState, event: SportEvent): Result {
  if (!isEventType(event.type)) return fail(`Unknown cricket event "${event.type}"`);
  const parsed = schemas[event.type].safeParse(event.payload);
  if (!parsed.success) return fail(`Invalid ${event.type}: ${parsed.error.issues[0]?.message ?? 'bad payload'}`);
  const p = parsed.data as any;
  const inn = currentInnings(s);
  const live = !!inn && !inn.closed;

  switch (event.type as EventType) {
    case 'toss': {
      if (s.awaiting !== 'toss') return fail('Toss already done');
      if (!s.teams.some((t) => t.id === p.winnerTeamId)) return fail('Unknown team');
      for (const t of s.teams) {
        if ((s.squads[t.id]?.length ?? 0) < 2) return fail(`${t.name} needs at least 2 players in its roster`);
      }
      return OK;
    }

    case 'start_innings': {
      if (s.awaiting !== 'innings_start') return fail('Not ready to start an innings');
      const batting = s.innings.length === 0 ? battingFirstId(s)! : otherTeam(s, inn!.battingTeamId);
      const bowling = otherTeam(s, batting);
      if (p.strikerId === p.nonStrikerId) return fail('Pick two different openers');
      if (!s.squads[batting]?.includes(p.strikerId) || !s.squads[batting]?.includes(p.nonStrikerId)) {
        return fail('Openers must be in the batting team');
      }
      if (!s.squads[bowling]?.includes(p.bowlerId)) return fail('Bowler must be in the bowling team');
      return OK;
    }

    case 'new_batter': {
      if (s.awaiting !== 'batter' || !inn) return fail('No batter needed right now');
      if (!s.squads[inn.battingTeamId]?.includes(p.playerId)) return fail('Player is not in the batting team');
      if (p.playerId === inn.striker || p.playerId === inn.nonStriker) return fail('Already batting');
      const prev = inn.batters[p.playerId];
      if (prev && prev.out?.kind !== 'retired_hurt') return fail('That player has already batted');
      return OK;
    }

    case 'new_bowler': {
      if (s.awaiting !== 'bowler' || !inn) return fail('No bowler needed right now');
      if (!s.squads[inn.bowlingTeamId]?.includes(p.playerId)) return fail('Player is not in the bowling team');
      if (p.playerId === inn.lastBowler) return fail('A bowler cannot bowl consecutive overs');
      const max = s.maxOversPerBowler;
      if (max && (inn.bowlers[p.playerId]?.legalBalls ?? 0) >= max * BALLS_PER_OVER) {
        return fail(`Bowler has already bowled ${max} overs`);
      }
      return OK;
    }

    case 'ball': {
      if (s.awaiting !== 'ball' || !inn) return fail('Not ready for a ball');
      const { extra, nbKind, wicket } = p;
      if (nbKind && extra !== 'nb') return fail('nbKind only applies to a no-ball');
      if (s.freeHit && wicket && wicket.kind !== 'run_out') return fail('Only a run out is possible on a free hit');
      if (wicket) {
        if (wicket.playerId !== inn.striker && wicket.playerId !== inn.nonStriker) {
          return fail('Dismissed player must be at the crease');
        }
        if (wicket.kind === 'retired_out') return fail('Use retire for retirements');
        if (wicket.kind !== 'run_out' && wicket.playerId !== inn.striker) {
          return fail('Only a run out can dismiss the non-striker');
        }
        const allowedOn: Record<string, string[]> = {
          wd: ['stumped', 'hit_wicket', 'run_out'],
          nb: ['run_out'],
          b: ['run_out'],
          lb: ['run_out'],
        };
        if (extra && !allowedOn[extra]!.includes(wicket.kind)) {
          return fail(`${wicket.kind.replace('_', ' ')} is not possible on this delivery`);
        }
      }
      return OK;
    }

    case 'swap_strike':
      return s.awaiting === 'ball' ? OK : fail('Cannot swap strike now');

    case 'retire': {
      if (s.awaiting !== 'ball' || !inn) return fail('Cannot retire a batter now');
      if (p.playerId !== inn.striker && p.playerId !== inn.nonStriker) return fail('Player is not batting');
      return OK;
    }

    case 'penalty':
      return live ? OK : fail('No innings in progress');

    case 'end_innings':
      return live ? OK : fail('No innings in progress');

    case 'finish': {
      if (!s.toss) return fail('Toss has not happened');
      if (s.result) return fail('Match already finished');
      if (p.outcome === 'win' && !s.teams.some((t) => t.id === p.winnerTeamId)) return fail('Pick the winning team');
      return OK;
    }
  }
}

function closeInnings(s: CricketState, inn: Innings, reason: NonNullable<Innings['closeReason']>) {
  inn.closed = true;
  inn.closeReason = reason;
  if (s.innings.length === 2) s.result = computeResult(s);
}

function computeResult(s: CricketState): CricketResult {
  const [first, second] = s.innings as [Innings, Innings];
  const name = (id: string) => s.teams.find((t) => t.id === id)!.name;
  const target = first.runs + 1;
  if (second.runs >= target) {
    const left = maxWicketsFor(s, second.battingTeamId) - second.wickets;
    return {
      winnerTeamId: second.battingTeamId,
      text: `${name(second.battingTeamId)} won by ${left} wicket${left === 1 ? '' : 's'}`,
    };
  }
  if (second.runs === first.runs) return { winnerTeamId: null, text: 'Match tied' };
  const diff = first.runs - second.runs;
  return { winnerTeamId: first.battingTeamId, text: `${name(first.battingTeamId)} won by ${diff} run${diff === 1 ? '' : 's'}` };
}

export type BallPayload = z.infer<typeof schemas.ball>;

/** The chip a delivery produces. Exported so the scorer UI can preview it before sending. */
export function chipFor(p: BallPayload): Chip {
  const { runs, extra, wicket } = p;
  const nbKind = p.nbKind ?? 'bat';
  const plus = (n: number, suffix = '') => (n ? `+${n}${suffix}` : '');
  if (wicket) {
    const prefix = extra === 'wd' ? 'Wd+' : extra === 'nb' ? 'Nb+' : '';
    return { label: `${prefix}W${runs && !extra ? `+${runs}` : ''}`, kind: 'wicket' };
  }
  if (extra === 'wd') return { label: `Wd${plus(runs)}`, kind: 'extra' };
  if (extra === 'nb') return { label: `Nb${plus(runs, nbKind === 'bat' ? '' : nbKind)}`, kind: 'extra' };
  if (extra === 'b') return { label: `${runs}b`, kind: 'extra' };
  if (extra === 'lb') return { label: `${runs}lb`, kind: 'extra' };
  return { label: String(runs), kind: runs === 0 ? 'dot' : runs === 4 ? 'four' : runs === 6 ? 'six' : 'run' };
}

function applyBall(s: CricketState, inn: Innings, p: z.infer<typeof schemas.ball>) {
  const { runs, extra, wicket } = p;
  const nbKind = p.nbKind ?? 'bat';
  const striker = inn.striker!;
  const bowlerId = inn.bowler!;

  let bat = 0, wd = 0, nb = 0, b = 0, lb = 0, charge = 0;
  let legal = true;
  let faced = true;
  switch (extra) {
    case undefined: bat = runs; charge = runs; break;
    case 'wd': wd = 1 + runs; charge = wd; legal = false; faced = false; break;
    case 'nb':
      nb = 1; legal = false;
      if (nbKind === 'bat') bat = runs; else if (nbKind === 'b') b = runs; else lb = runs;
      charge = 1 + bat;
      break;
    case 'b': b = runs; break;
    case 'lb': lb = runs; break;
  }
  const total = bat + wd + nb + b + lb;

  // --- scoreboard
  inn.runs += total;
  inn.extras.wd += wd; inn.extras.nb += nb; inn.extras.b += b; inn.extras.lb += lb;
  if (legal) inn.legalBalls += 1;
  inn.partnership.runs += total;
  if (legal) inn.partnership.balls += 1;

  const batter = inn.batters[striker]!;
  if (faced) batter.balls += 1;
  batter.runs += bat;
  if (bat === 4 && extra !== 'wd') batter.fours += 1;
  if (bat === 6 && extra !== 'wd') batter.sixes += 1;

  const bowler = inn.bowlers[bowlerId]!;
  bowler.runs += charge;
  bowler.overRuns += charge;
  if (legal) bowler.legalBalls += 1;
  if (extra === 'wd') bowler.wides += 1;
  if (extra === 'nb') bowler.noBalls += 1;

  const chip = chipFor(p);
  inn.thisOver.push(chip);

  // Ball number within the over: a legal ball is already counted, an illegal one belongs to the next slot.
  const overLabel = legal
    ? ballLabel(inn.legalBalls)
    : `${Math.floor(inn.legalBalls / BALLS_PER_OVER)}.${(inn.legalBalls % BALLS_PER_OVER) + 1}`;
  inn.log.push({
    over: overLabel,
    bowlerId,
    batterId: striker,
    chip,
    runs: total,
    wicket: wicket ? { playerId: wicket.playerId, kind: wicket.kind } : undefined,
  });

  // --- strike rotation (batters crossed on odd runs), then wicket, then end of over
  let slotS: string | null = striker;
  let slotN: string | null = inn.nonStriker!;
  if (runs % 2 === 1) [slotS, slotN] = [slotN, slotS];

  if (wicket) {
    const out = inn.batters[wicket.playerId]!;
    out.out = {
      kind: wicket.kind,
      bowlerId: BOWLER_WICKETS.has(wicket.kind) ? bowlerId : undefined,
      fielderId: wicket.fielderId,
    };
    inn.wickets += 1;
    if (BOWLER_WICKETS.has(wicket.kind)) bowler.wickets += 1;
    inn.fow.push({ runs: inn.runs, wickets: inn.wickets, playerId: wicket.playerId, over: ballLabel(inn.legalBalls) });
    inn.partnership = { runs: 0, balls: 0 };
    if (slotS === wicket.playerId) slotS = null;
    else slotN = null;
  }

  const overDone = legal && inn.legalBalls % BALLS_PER_OVER === 0;
  if (overDone) {
    if (bowler.overRuns === 0) bowler.maidens += 1;
    inn.lastBowler = bowlerId;
    inn.bowler = null;
    inn.thisOver = [];
    [slotS, slotN] = [slotN, slotS];
  }
  inn.striker = slotS;
  inn.nonStriker = slotN;

  // --- free hit: a no-ball gives one to the next delivery; a wide leaves it standing; a fair delivery uses it up
  if (s.rules.freeHit) {
    if (extra === 'nb') s.freeHit = true;
    else if (extra !== 'wd') s.freeHit = false;
  }

  // --- innings end conditions
  const second = s.innings.length === 2;
  if (second && inn.runs > s.innings[0]!.runs) closeInnings(s, inn, 'target');
  else if (inn.wickets >= maxWicketsFor(s, inn.battingTeamId)) closeInnings(s, inn, 'all_out');
  else if (inn.legalBalls >= s.overs * BALLS_PER_OVER) closeInnings(s, inn, 'overs');
}

function apply(prev: CricketState, event: SportEvent): CricketState {
  const s = structuredClone(prev);
  const inn = currentInnings(s);

  switch (event.type as EventType) {
    case 'toss':
      s.toss = schemas.toss.parse(event.payload);
      break;

    case 'start_innings': {
      const p = schemas.start_innings.parse(event.payload);
      const batting = s.innings.length === 0 ? battingFirstId(s)! : otherTeam(s, inn!.battingTeamId);
      s.freeHit = false;
      const stat = (id: string): BatterStat => ({ id, runs: 0, balls: 0, fours: 0, sixes: 0, out: null });
      s.innings.push({
        battingTeamId: batting,
        bowlingTeamId: otherTeam(s, batting),
        runs: 0, wickets: 0, legalBalls: 0,
        extras: { wd: 0, nb: 0, b: 0, lb: 0, pen: 0 },
        batters: { [p.strikerId]: stat(p.strikerId), [p.nonStrikerId]: stat(p.nonStrikerId) },
        order: [p.strikerId, p.nonStrikerId],
        bowlers: { [p.bowlerId]: { id: p.bowlerId, legalBalls: 0, runs: 0, wickets: 0, maidens: 0, wides: 0, noBalls: 0, overRuns: 0 } },
        striker: p.strikerId,
        nonStriker: p.nonStrikerId,
        bowler: p.bowlerId,
        lastBowler: null,
        thisOver: [], log: [], fow: [],
        partnership: { runs: 0, balls: 0 },
        closed: false,
      });
      break;
    }

    case 'new_batter': {
      const { playerId } = schemas.new_batter.parse(event.payload);
      const i = inn!;
      if (!i.batters[playerId]) {
        i.batters[playerId] = { id: playerId, runs: 0, balls: 0, fours: 0, sixes: 0, out: null };
        i.order.push(playerId);
      } else {
        i.batters[playerId]!.out = null; // returning after retiring hurt
      }
      if (i.striker === null) i.striker = playerId;
      else i.nonStriker = playerId;
      break;
    }

    case 'new_bowler': {
      const { playerId } = schemas.new_bowler.parse(event.payload);
      const i = inn!;
      i.bowler = playerId;
      i.bowlers[playerId] ??= { id: playerId, legalBalls: 0, runs: 0, wickets: 0, maidens: 0, wides: 0, noBalls: 0, overRuns: 0 };
      i.bowlers[playerId]!.overRuns = 0;
      break;
    }

    case 'ball':
      applyBall(s, inn!, schemas.ball.parse(event.payload));
      break;

    case 'swap_strike':
      [inn!.striker, inn!.nonStriker] = [inn!.nonStriker, inn!.striker];
      break;

    case 'retire': {
      const p = schemas.retire.parse(event.payload);
      const i = inn!;
      i.batters[p.playerId]!.out = { kind: p.kind };
      if (i.striker === p.playerId) i.striker = null;
      else i.nonStriker = null;
      if (p.kind === 'retired_out') {
        i.wickets += 1;
        i.fow.push({ runs: i.runs, wickets: i.wickets, playerId: p.playerId, over: ballLabel(i.legalBalls) });
        if (i.wickets >= maxWicketsFor(s, i.battingTeamId)) closeInnings(s, i, 'all_out');
      }
      i.partnership = { runs: 0, balls: 0 };
      break;
    }

    case 'penalty': {
      const { runs } = schemas.penalty.parse(event.payload);
      const i = inn!;
      i.runs += runs;
      i.extras.pen += runs;
      if (s.innings.length === 2 && i.runs > s.innings[0]!.runs) closeInnings(s, i, 'target');
      break;
    }

    case 'end_innings':
      closeInnings(s, inn!, 'declared');
      break;

    case 'finish': {
      const p = schemas.finish.parse(event.payload);
      const name = (id?: string) => s.teams.find((t) => t.id === id)?.name ?? '';
      s.result =
        p.outcome === 'win'
          ? { winnerTeamId: p.winnerTeamId!, text: `${name(p.winnerTeamId)} won` }
          : p.outcome === 'tie'
            ? { winnerTeamId: null, text: 'Match tied' }
            : { winnerTeamId: null, text: 'No result' };
      break;
    }
  }

  s.lastAction = describeAction(event);
  s.awaiting = deriveAwaiting(s);
  return s;
}

function describeAction(event: SportEvent): CricketState['lastAction'] {
  const p = event.payload as Record<string, any>;
  switch (event.type as EventType) {
    case 'ball': {
      const ball = schemas.ball.parse(event.payload);
      return { type: 'ball', label: chipFor(ball).label, playerId: ball.wicket?.playerId };
    }
    case 'toss': return { type: 'toss', label: 'TOSS' };
    case 'start_innings': return { type: 'start_innings', label: 'INNINGS START' };
    case 'new_batter': return { type: 'new_batter', label: 'NEW BATTER' };
    case 'new_bowler': return { type: 'new_bowler', label: 'NEW BOWLER' };
    case 'swap_strike': return { type: 'swap_strike', label: 'SWAP STRIKE' };
    case 'retire': return { type: 'retire', label: 'RETIRE', playerId: p.playerId };
    case 'penalty': return { type: 'penalty', label: `PENALTY +${p.runs}` };
    case 'end_innings': return { type: 'end_innings', label: 'END INNINGS' };
    case 'finish': return { type: 'finish', label: 'RESULT' };
  }
}

function summary(s: CricketState, ctx: MatchContext): ScoreSummary {
  const sides = ctx.teams.map((t) => {
    const inn = s.innings.find((i) => i.battingTeamId === t.id);
    return {
      name: t.name,
      score: inn ? `${inn.runs}/${inn.wickets} (${formatOvers(inn.legalBalls)}/${s.overs})` : '—',
    };
  });

  const name = (id: string) => s.teams.find((t) => t.id === id)?.name ?? '';
  const inn = currentInnings(s);
  let status: string;
  if (s.result) status = s.result.text;
  else if (!s.toss) status = 'Waiting for toss';
  else if (!inn) status = `${name(s.toss.winnerTeamId)} won the toss and chose to ${s.toss.decision}`;
  else if (inn.closed) {
    status = `Innings break · ${name(otherTeam(s, inn.battingTeamId))} need ${inn.runs + 1} to win`;
  } else if (s.innings.length === 2) {
    const need = s.innings[0]!.runs + 1 - inn.runs;
    const left = s.overs * BALLS_PER_OVER - inn.legalBalls;
    status = `${name(inn.battingTeamId)} need ${need} run${need === 1 ? '' : 's'} from ${left} ball${left === 1 ? '' : 's'}`;
  } else {
    status = `CRR ${runRate(inn).toFixed(2)}`;
  }
  return { sides, status };
}

export const cricketEngine: SportEngine<CricketState> = {
  key: 'cricket',
  initialState,
  validate,
  apply,
  summary,
  outcome: (s) => ({ complete: !!s.result, result: s.result ? { ...s.result } : undefined }),
};

/** Which team bats in the innings that has not started yet. */
export function nextInningsBattingTeam(s: CricketState): string | null {
  const last = currentInnings(s);
  return last ? otherTeam(s, last.battingTeamId) : battingFirstId(s);
}
