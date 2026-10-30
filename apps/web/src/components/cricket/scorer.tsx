'use client';
import '@fontsource-variable/inter';
import '@fontsource-variable/inter-tight';
import '@fontsource-variable/jetbrains-mono';
import './ratch.css';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MatchSnapshot } from '@sports/shared';
import {
  canEditToss,
  chipFor,
  currentInnings,
  formatOvers,
  nextInningsBattingTeam,
  otherTeam,
  runRate,
  type Chip as ChipData,
  type CricketState,
  type Extra,
  type WicketKind,
} from '@sports/sports-engine/src/cricket';
import {
  bowlerFigure,
  chase,
  chipText,
  completedOvers,
  currentOverRuns,
  describeBall,
  economy,
  lastOutLine,
  nameOf,
  oversLeftFor,
  projected,
  strikeRate,
  surnameOf,
  target as targetOf,
} from '@sports/sports-engine/src/cricket-view';
import { Chip } from '@/components/ratch/chip';
import { toast, Toaster } from '@/components/ratch/toast';
import { useScorer } from '@/lib/use-live-match';
import { ScorerCard } from './scorer-card';

type Sheet = 'extras' | '57' | 'wicket' | 'retire' | 'result' | 'toss' | 'openers' | 'revise';
type Active = Sheet | 'batter' | 'bowler' | 'final';
type Credit = 'bat' | 'b' | 'lb';
type Delivery = 'normal' | 'wd' | 'nb';

const TONE: Record<ChipData['kind'], string> = {
  dot: 'var(--text-tertiary)',
  run: 'var(--text-primary)',
  four: '#4d94ff',
  six: 'var(--green)',
  wicket: 'var(--red-text)',
  extra: 'var(--amber)',
};

const EXTRA_COPY: Record<Extra, string> = {
  wd: 'Wide. One penalty run plus any runs taken. Does not count as a ball.',
  nb: 'No ball. One penalty run plus runs scored. Does not count as a ball.',
  b: 'Byes. Runs taken without bat contact. Counts as a ball, not charged to the bowler.',
  lb: 'Leg byes. Runs off the body. Counts as a ball, not charged to the bowler.',
};

const WICKET_LABEL: Partial<Record<WicketKind, string>> = {
  bowled: 'BOWLED', caught: 'CAUGHT', lbw: 'LBW', run_out: 'RUN OUT', stumped: 'STUMPED', hit_wicket: 'HIT WICKET',
};
const KINDS: Record<Delivery, WicketKind[]> = {
  normal: ['bowled', 'caught', 'lbw', 'run_out', 'stumped', 'hit_wicket'],
  wd: ['stumped', 'hit_wicket', 'run_out'],
  nb: ['run_out'],
};

const on = (v: boolean) => (v ? 'true' : 'false');

function Opt({
  children, selected, onClick, tone, text, big, num, disabled,
}: {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
  tone?: 'red' | 'gold';
  text?: boolean;
  big?: boolean;
  num?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="sc-opt"
      aria-pressed={selected}
      data-on={on(selected)}
      data-tone={tone}
      data-text={text ? 'true' : undefined}
      data-big={big ? 'true' : undefined}
      data-num={num ? 'true' : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Btn({ variant, children, onClick, disabled }: { variant: 'primary' | 'danger' | 'gray'; children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="sc-btn" data-variant={variant} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => <div className="lbl">{children}</div>;

// ---------------------------------------------------------------------------

export function CricketScorer({ initial, venue, backHref: backTo }: { initial: MatchSnapshot; venue?: string | null; /** The match page, so Cancel and the back arrow go straight to it (under its tournament when it has one). */ backHref?: string }) {
  const { snapshot, connected, send, release, error, busy } = useScorer(initial);
  const s = snapshot.state as CricketState;
  const inn = currentInnings(s);

  const names = useMemo(
    () => Object.fromEntries(snapshot.roster.flatMap((t) => t.players.map((p) => [p.id, p.name]))),
    [snapshot.roster],
  );
  const squad = useCallback((teamId: string) => snapshot.roster.find((t) => t.id === teamId)?.players ?? [], [snapshot.roster]);
  const teamName = (id: string) => s.teams.find((t) => t.id === id)?.name ?? '';

  // ---- connection
  const everConnected = useRef(false);
  if (connected) everConnected.current = true;
  const conn = connected ? 'live' : everConnected.current ? 'off' : 'wait';

  // ---- ui state
  const [tab, setTab] = useState<'score' | 'card'>('score');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [ackFinal, setAckFinal] = useState(false);
  const flash = useCallback((text: string) => toast.success(text), []);
  useEffect(() => { if (error) toast.error(error); }, [error]);

  // ---- sheet forms
  const [ex, setEx] = useState<{ type: Extra; runs: number; nbKind: Credit }>({ type: 'wd', runs: 0, nbKind: 'bat' });
  const [fs, setFs] = useState<{ runs: number; src: Credit }>({ runs: 5, src: 'bat' });
  const [wk, setWk] = useState<{ delivery: Delivery; kind: WicketKind; who: 0 | 1; runs: number; fielder: string }>({ delivery: 'normal', kind: 'bowled', who: 0, runs: 0, fielder: '' });
  const [rt, setRt] = useState<{ who: 0 | 1; type: 'hurt' | 'out' }>({ who: 0, type: 'hurt' });
  const router = useRouter();
  // Cancelling the very first toss leaves the console: there is nothing to score without one, and nothing has been saved.
  const backHref = backTo ?? `/sports/${snapshot.sportKey}/matches/${snapshot.matchId}`;
  const [toss, setToss] = useState<{ win: string; choice: 'bat' | 'bowl' }>({ win: s.teams[0]!.id, choice: 'bat' });
  const [open, setOpen] = useState<{ striker: string; non: string; bowler: string; step: 'striker' | 'non' | 'bowler' }>({ striker: '', non: '', bowler: '', step: 'striker' });
  const [res, setRes] = useState<string>('tie');
  const [margin, setMargin] = useState('');
  const [rv, setRv] = useState<{ overs: string; target: string }>({ overs: '', target: '' });

  useEffect(() => { if (s.awaiting !== 'complete') setAckFinal(false); }, [s.awaiting]);
  useEffect(() => { setOpen({ striker: '', non: '', bowler: '', step: 'striker' }); }, [s.innings.length]);

  // The engine says what it needs next; those prompts cannot be dismissed.
  // (while the toss is being corrected, the toss sheet stands in front of the openers prompt)
  const forced: Active | null =
    sheet === 'toss' ? null
    : s.awaiting === 'toss' ? 'toss'
    // the very first innings is set up straight after the toss; after that the innings break shows the normal screen,
    // so the last ball can still be undone before the next innings is started
    : s.awaiting === 'innings_start' ? (s.innings.length === 0 ? 'openers' : null)
    : s.awaiting === 'batter' ? 'batter'
    : s.awaiting === 'bowler' ? 'bowler'
    : s.awaiting === 'complete' && !ackFinal ? 'final'
    : null;
  const active: Active | null = forced ?? sheet;
  const lastShown = useRef<Active>('extras');
  if (active) lastShown.current = active;
  const shown = active ?? lastShown.current;

  // Taps queue while a ball is saving (see useScorer), so keys stay live; `busy` only drives feedback.
  const canScore = s.awaiting === 'ball' && connected;
  const canUndo = !!s.lastAction && connected;
  // what Undo would remove, in words, so nobody has to guess
  const undoTitle = !s.lastAction ? 'NOTHING TO UNDO' : s.lastAction.type === 'ball' ? 'UNDO LAST BALL' : `UNDO ${s.lastAction.label}`;
  const undoNote = !s.lastAction ? 'Nothing has been scored yet' : s.lastAction.type === 'ball' ? `Removes the last ball: ${s.lastAction.label}` : `Removes: ${s.lastAction.label.toLowerCase()}`;
  const slots = inn ? [inn.striker, inn.nonStriker] : [null, null];

  // ---- actions
  const run = useCallback(async (type: string, payload: Record<string, unknown>, message: string) => {
    const ok = await send(type, payload);
    if (ok) { setSheet(null); setDrawer(false); flash(message); }
    return ok;
  }, [send, flash]);

  const scoreBall = (p: { runs: number; extra?: Extra; nbKind?: Credit; wicket?: { kind: WicketKind; playerId: string; fielderId?: string } }) =>
    run('ball', p, `Recorded ${chipText(chipFor(p))}`);

  // one at a time: a second tap while the first is saving would remove another ball
  const undo = () => { if (canUndo && !busy) void run('undo', {}, s.lastAction!.type === 'ball' ? `Last ball removed (${s.lastAction!.label})` : `${s.lastAction!.label.toLowerCase()} removed`); };
  const swap = () => { if (canScore) void run('swap_strike', {}, 'Strike swapped'); };

  /** Fix a wrong toss until the first ball. If the openers were already picked they are cleared and chosen again. */
  const startEditToss = () => {
    if (!s.toss || !canEditToss(s)) return;
    if (s.innings.length > 0 && !confirm('Changing the toss clears the openers you picked. You will pick them again. Continue?')) return;
    setToss({ win: s.toss.winnerTeamId, choice: s.toss.decision });
    setSheet('toss');
    setDrawer(false);
  };

  const openSheet = (kind: Sheet, preset?: () => void) => { preset?.(); setSheet(kind); setDrawer(false); };
  const openEnd = () => openSheet('result', () => { setRes('tie'); setMargin(''); });
  const openRevise = () => openSheet('revise', () => setRv({ overs: String(Math.max(1, s.overs - 1)), target: '' }));
  // reducing the overs: shorter than now, and not shorter than what the current innings has already bowled
  const reviseMin = inn && !inn.closed ? Math.max(1, Math.ceil(inn.legalBalls / 6)) : 1;
  const reviseOvers = Number(rv.overs);
  const reviseTarget = rv.target.trim() ? Number(rv.target) : null;
  const reviseOk = Number.isInteger(reviseOvers) && reviseOvers >= reviseMin && reviseOvers < s.overs && (reviseTarget === null || (Number.isInteger(reviseTarget) && reviseTarget >= 1 && reviseTarget <= 999));
  const canRevise = s.innings.length > 0 && !s.result && s.overs > 1 && connected && !busy;
  const openExtras = (type: Extra) => openSheet('extras', () => setEx({ type, runs: type === 'b' || type === 'lb' ? 1 : 0, nbKind: 'bat' }));
  const openWicket = () => openSheet('wicket', () => setWk({ delivery: 'normal', kind: 'bowled', who: 0, runs: 0, fielder: '' }));

  // ---- keyboard (same map as the design: 0-4,6 runs, W N B L extras, X out, U undo, S swap, Esc)
  const onKey = useRef<(e: KeyboardEvent) => void>(undefined);
  onKey.current = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      if (drawer) setDrawer(false);
      else if (sheet && !forced) setSheet(null);
      return;
    }
    if (active || drawer || tab !== 'score') return;
    if (k.length === 1 && '012346'.includes(k)) { if (!canScore) return; void scoreBall({ runs: Number(k) }); }
    else if (k === 'w') { if (!canScore) return; openExtras('wd'); }
    else if (k === 'n') { if (!canScore) return; openExtras('nb'); }
    else if (k === 'b') { if (!canScore) return; openExtras('b'); }
    else if (k === 'l') { if (!canScore) return; openExtras('lb'); }
    else if (k === 'x') { if (!canScore) return; openWicket(); }
    else if (k === 'u') undo();
    else if (k === 's') swap();
    else return;
    e.preventDefault();
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey.current?.(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // ---- derived view
  const seqChanged = snapshot.seq !== initial.seq;
  const ch = inn ? chase(s, inn) : null;
  const crr = inn ? runRate(inn) : 0;
  const bowler = inn?.bowler ? inn.bowlers[inn.bowler] : undefined;
  const first = s.innings.length === 2 ? s.innings[0]! : null;
  const overs = inn ? completedOvers(inn) : [];
  const prevOvers = overs.slice(-2).reverse();
  const legalInOver = inn ? inn.legalBalls % 6 : 0;
  const placeholders = Math.max(0, 6 - legalInOver);
  const overNo = inn ? Math.min(Math.floor(inn.legalBalls / 6) + 1, s.overs) : 1;

  const statusLine = (() => {
    if (!inn) return snapshot.summary.status;
    if (s.result) return s.result.text;
    if (inn.closed) return `Innings break · ${teamName(otherTeam(s, inn.battingTeamId))} need ${targetOf(s)} to win`;
    if (ch) return ch.need > 0 ? `Need ${ch.need} run${ch.need === 1 ? '' : 's'} from ${ch.left} ball${ch.left === 1 ? '' : 's'}` : 'Target reached';
    return inn.legalBalls ? `Projected ${projected(inn, s.overs)} at ${crr.toFixed(0)} an over` : 'Innings in progress';
  })();

  // ---- sheet content/derived values
  const bowlSquad = inn ? squad(inn.bowlingTeamId) : [];
  const batSquad = inn ? squad(inn.battingTeamId) : [];
  // On a free hit only a run out is possible; the engine enforces it, the sheet just does not offer the rest.
  const kinds = s.freeHit ? KINDS[wk.delivery].filter((k) => k === 'run_out') : KINDS[wk.delivery];
  const wkKind = kinds.includes(wk.kind) ? wk.kind : kinds[0]!;
  const isRunOut = wkKind === 'run_out';
  const needsFielder = wkKind === 'caught' || wkKind === 'stumped' || isRunOut;
  const keeperId = bowlSquad.find((p) => p.isKeeper)?.id ?? '';
  // Stumped defaults to the keeper chosen for the match, until the scorer picks someone else.
  const fielderId = wk.fielder || (wkKind === 'stumped' ? keeperId : '');
  const wkOut = (isRunOut ? slots[wk.who] : slots[0]) ?? slots[0] ?? '';
  const wkDesc = (() => {
    const b = surnameOf(names, inn?.bowler);
    const f = surnameOf(names, fielderId);
    switch (wkKind) {
      case 'bowled': return `b ${b}`;
      case 'caught': return fielderId && fielderId === inn?.bowler ? `c & b ${b}` : `c ${f || '?'} b ${b}`;
      case 'lbw': return `lbw b ${b}`;
      case 'run_out': return f ? `run out (${f})` : 'run out';
      case 'stumped': return `st ${f || '?'} b ${b}`;
      default: return `hit wicket b ${b}`;
    }
  })();

  const exPayload = { runs: ex.runs, extra: ex.type, ...(ex.type === 'nb' && ex.nbKind !== 'bat' ? { nbKind: ex.nbKind } : {}) };
  const fsPayload = { runs: fs.runs, ...(fs.src !== 'bat' ? { extra: fs.src as Extra } : {}) };
  const wkPayload = {
    runs: isRunOut ? wk.runs : 0,
    ...(wk.delivery !== 'normal' ? { extra: wk.delivery as Extra } : {}),
    wicket: { kind: wkKind, playerId: wkOut, ...(needsFielder && fielderId ? { fielderId } : {}) },
  };

  let preview: { chip: ChipData; text: string } | null = null;
  if (shown === 'extras') {
    const add = ex.type === 'wd' || ex.type === 'nb' ? ex.runs + 1 : ex.runs;
    preview = {
      chip: chipFor(exPayload),
      text: `Adds ${add} to the total. ${ex.type === 'wd' || ex.type === 'nb' ? 'Ball is re-bowled.' : `Counts as ball ${legalInOver + 1} of the over.`}`,
    };
  } else if (shown === '57') {
    preview = {
      chip: chipFor(fsPayload),
      text: fs.src === 'bat'
        ? `${fs.runs} to ${surnameOf(names, slots[0])}. Strike changes.`
        : `${fs.runs} ${fs.src === 'b' ? 'byes' : 'leg byes'} to extras. Strike changes.`,
    };
  } else if (shown === 'wicket') {
    preview = { chip: chipFor(wkPayload), text: `${nameOf(names, wkOut)} ${wkDesc}` };
  }

  const nextBat = nextInningsBattingTeam(s);
  const openBowlers = nextBat ? squad(otherTeam(s, nextBat)) : [];
  // nobody is chosen for you: the opening bowler must be picked like the openers
  const openBowler = open.bowler;
  const [pickS, pickN] = [open.striker, open.non];
  const openersReady = !!(pickS && pickN && openBowler);
  const tossWinnerName = teamName(toss.win);

  const lastOver = overs.at(-1);
  const meta: Record<Active, { kicker: string; title: string; w: number; primary?: string; secondary?: string; variant?: 'primary' | 'danger'; closable: boolean }> = {
    extras: { kicker: 'EXTRAS', title: 'Record an extra', w: 520, primary: 'RECORD', secondary: 'CANCEL', closable: true },
    '57': { kicker: 'RUNS', title: '5 or 7 runs', w: 480, primary: 'RECORD', secondary: 'CANCEL', closable: true },
    wicket: { kicker: 'WICKET', title: 'How was the batter out?', w: 600, primary: 'RECORD WICKET', variant: 'danger', secondary: 'CANCEL', closable: true },
    retire: { kicker: 'RETIRE', title: 'Retire a batter', w: 520, primary: 'CONFIRM', secondary: 'CANCEL', closable: true },
    result: { kicker: 'END OF MATCH', title: 'End the match', w: 560, primary: 'PUBLISH RESULT', secondary: 'BACK TO SCORING', closable: true },
    revise: { kicker: 'RAIN OR BAD LIGHT', title: 'Reduce the overs', w: 520, primary: 'REDUCE OVERS', secondary: 'CANCEL', closable: true },
    toss: sheet === 'toss'
      ? { kicker: 'CORRECT THE TOSS', title: 'Edit toss', w: 560, primary: 'SAVE TOSS', secondary: 'CANCEL', closable: true }
      : { kicker: 'BEFORE THE MATCH', title: 'Toss', w: 560, primary: 'CONTINUE', secondary: 'CANCEL', closable: false },
    openers: { kicker: `INNINGS ${s.innings.length + 1} · ${nextBat ? teamName(nextBat).toUpperCase() : ''} BAT`, title: 'Who starts the innings?', w: 760, primary: 'START INNINGS', secondary: sheet === 'openers' ? 'CANCEL' : undefined, closable: sheet === 'openers' },
    batter: { kicker: s.lastAction?.type === 'retire' ? 'BATTER RETIRED' : 'WICKET FELL', title: 'Who is the new batter?', w: 560, secondary: 'UNDO', closable: false },
    bowler: { kicker: `OVER ${lastOver?.no ?? Math.max(1, Math.floor((inn?.legalBalls ?? 0) / 6))} COMPLETE · ${lastOver?.runs ?? 0} RUNS`, title: 'Who bowls next?', w: 560, secondary: 'UNDO', closable: false },
    final: { kicker: 'END OF MATCH', title: 'Result', w: 560, primary: 'DONE', secondary: 'UNDO LAST BALL', closable: true },
  };
  const m = meta[shown];
  const showPrimary = !!m.primary;

  const primary = () => {
    switch (shown) {
      case 'extras': return void scoreBall(exPayload);
      case '57': return void scoreBall(fsPayload);
      case 'wicket': return void scoreBall(wkPayload);
      case 'retire': {
        const id = slots[rt.who];
        if (id) void run('retire', { playerId: id, kind: rt.type === 'hurt' ? 'retired_hurt' : 'retired_out' }, 'Batter retired');
        return;
      }
      case 'toss': return void run('toss', { winnerTeamId: toss.win, decision: toss.choice }, sheet === 'toss' ? 'Toss corrected' : 'Toss recorded');
      case 'openers': return void run('start_innings', { strikerId: pickS, nonStrikerId: pickN, bowlerId: openBowler }, 'Innings started');
      case 'result': {
        const body = res === 'tie' ? { outcome: 'tie' } : res === 'nr' ? { outcome: 'no_result' } : { outcome: 'win', winnerTeamId: res.split(':')[1], ...(res.startsWith('dls:') ? { method: 'dls' } : {}), ...(margin.trim() ? { margin: margin.trim() } : {}) };
        return void run('finish', body, 'Result published to live view');
      }
      case 'revise': {
        const overs = Number(rv.overs);
        const target = rv.target.trim() ? Number(rv.target) : undefined;
        return void run('revise_overs', { overs, ...(target ? { target } : {}) }, `Match reduced to ${overs} overs`);
      }
      case 'final': return setAckFinal(true);
    }
  };
  const secondary = () => {
    if (shown === 'batter' || shown === 'bowler' || shown === 'final') return undo();
    if (shown === 'toss' && forced === 'toss') return router.push(backHref);
    setSheet(null);
  };

  // ---- render
  const resultSummary = s.innings.map((i) => ({ team: teamName(i.battingTeamId), score: `${i.runs}/${i.wickets} (${formatOvers(i.legalBalls)})` }));

  return (
    <div className="ratch sc-root" data-theme="dark">
      <div className="sc-top">
        <div className="sc-brand">
          <Link href={backHref} aria-label="Back to match" className="mono" style={{ color: 'var(--text-tertiary)', fontSize: 16, marginRight: 4 }}>←</Link>
          <span className="sc-brand-dot" />
          <span className="sc-brand-name">Ratchet</span>
          <span className="sc-tag">SCORER</span>
        </div>
        <Link href="/matches" className="sc-allmatches">ALL MATCHES</Link>
        <div className="sc-matchmeta">
          <b>{s.teams.map((t) => t.name).join(' vs ')}</b>
          <span className="lbl" style={{ letterSpacing: '0.04em' }}>
            {s.overs} OVERS · {inn ? `INNINGS ${s.innings.length}` : 'NOT STARTED'}{venue ? ` · ${venue.toUpperCase()}` : ''}
          </span>
          {canEditToss(s) && s.awaiting === 'ball' && <button type="button" className="sc-textbtn" onClick={startEditToss}>Wrong toss? Edit it</button>}
        </div>
        <div className="sc-conn" data-state={conn} role="status">
          <i />
          {conn === 'live' ? (busy ? 'SAVING…' : 'LIVE · SYNCED') : conn === 'off' ? 'OFFLINE' : 'CONNECTING'}
        </div>
        <div className="sc-tabs" role="tablist">
          {(['score', 'card'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className="sc-tab" onClick={() => setTab(t)}>
              {t === 'score' ? 'SCORE' : 'SCORECARD'}
            </button>
          ))}
        </div>
      </div>

      {conn === 'off' && (
        <div className="sc-banner" role="alert">
          <span>Offline. Scoring is paused until the connection returns. Nothing is saved on this device.</span>
          <span className="mono" style={{ fontSize: 11, fontWeight: 700 }}>RECONNECTING</span>
        </div>
      )}

      {tab === 'card' ? (
        <ScorerCard s={s} names={names} />
      ) : (
        <div className="sc-body">
          <div className="sc-main">
            {inn && s.awaiting === 'innings_start' && s.innings.length > 0 && !s.result && (
              <div className="sc-card sc-break" role="status">
                <div className="sc-break-text">
                  <span className="lbl">INNINGS {s.innings.length} COMPLETE</span>
                  <b>{teamName(inn.battingTeamId)} {inn.runs}/{inn.wickets} ({formatOvers(inn.legalBalls)})</b>
                  <small>
                    {nextBat && s.innings.length === 1 ? `${teamName(nextBat)} need ${targetOf(s)} to win. ` : ''}
                    Scoring is paused. If the last ball was a mistake, undo it first.
                  </small>
                </div>
                <Btn variant="primary" onClick={() => openSheet('openers')}>START INNINGS {s.innings.length + 1}</Btn>
              </div>
            )}
            <div className="sc-card sc-hero">
              {inn ? (
                <>
                  <div className="sc-row">
                    <span className="sc-hero-team">{teamName(inn.battingTeamId)} <span>batting</span></span>
                    <span className="lbl" style={{ letterSpacing: '0.04em' }}>
                      {first ? `${teamName(first.battingTeamId)} ${first.runs}/${first.wickets} (${formatOvers(first.legalBalls)})` : `INNINGS ${s.innings.length} · ${s.overs} OVERS`}
                    </span>
                  </div>
                  <div className="sc-score-row">
                    <span key={snapshot.seq} className="sc-score" data-bump={on(seqChanged)} aria-live="polite">{inn.runs}/{inn.wickets}</span>
                    <div className="sc-stats">
                      <div className="sc-stat"><span className="lbl">OVERS</span><b>{formatOvers(inn.legalBalls)}<small> /{s.overs}</small></b></div>
                      <div className="sc-stat"><span className="lbl">CRR</span><b>{crr.toFixed(2)}</b></div>
                      <div className="sc-stat">
                        <span className="lbl">{ch ? 'RRR' : 'PROJ'}</span>
                        <b data-accent="true">{ch ? (ch.rrr !== null ? ch.rrr.toFixed(2) : '—') : inn.legalBalls ? projected(inn, s.overs) : '—'}</b>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="sc-score-row">
                  <span className="sc-score">0/0</span>
                  <span className="lbl">{s.teams.map((t) => t.name).join(' · ')}</span>
                </div>
              )}
              <div className="sc-status">{statusLine}</div>
            </div>

            {inn && (
              <>
                <div className="sc-grid2">
                  <div className="sc-card sc-crease">
                    <div className="sc-crease-head lbl lbl-sm">
                      <span>AT THE CREASE</span><span>R (B)</span><span>4S</span><span>6S</span><span>SR</span>
                    </div>
                    {slots.map((id, slot) => {
                      const b = id ? inn.batters[id] : undefined;
                      return (
                        <button
                          key={slot}
                          className="sc-bat"
                          data-striker={on(slot === 0)}
                          title={slot === 1 ? 'Set on strike' : 'On strike'}
                          disabled={slot === 0 || !canScore}
                          onClick={swap}
                        >
                          <span className="sc-bat-name"><i /><span>{id ? nameOf(names, id) : '—'}</span></span>
                          <span className="r">{b ? b.runs : '—'} {b && <small>({b.balls})</small>}</span>
                          <span className="n">{b ? b.fours : ''}</span>
                          <span className="n">{b ? b.sixes : ''}</span>
                          <span className="n">{b ? strikeRate(b) : ''}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="sc-card sc-bowl">
                    <div className="sc-row" style={{ flexWrap: 'nowrap' }}>
                      <span className="lbl lbl-sm">BOWLING</span><span className="lbl lbl-sm">O-M-R-W</span>
                    </div>
                    <div className="top">
                      <b>{inn.bowler ? nameOf(names, inn.bowler) : '—'}</b>
                      <span className="mono">{bowler ? bowlerFigure(bowler) : '—'}</span>
                    </div>
                    <div className="foot">
                      <span>ECON {bowler ? economy(bowler) : '—'}</span>
                      <span>{oversLeftFor(bowler, s.maxOversPerBowler) !== null ? `${oversLeftFor(bowler, s.maxOversPerBowler)} OVERS LEFT` : ''}</span>
                    </div>
                  </div>
                </div>

                <div className="sc-card sc-over">
                  <div className="sc-row" style={{ flexWrap: 'nowrap' }}>
                    <span className="lbl">THIS OVER · {overNo}{s.freeHit && <span className="sc-freehit"> · FREE HIT</span>}</span>
                    <span className="sc-row" style={{ gap: 10, flexWrap: 'nowrap' }}>
                      <span className="lbl">{currentOverRuns(inn)} RUNS</span>
                      {s.lastAction?.type === 'ball' && <button type="button" className="sc-undo-mini" disabled={!canUndo || busy} onClick={undo}>↶ UNDO LAST BALL</button>}
                    </span>
                  </div>
                  <div className="sc-over-chips">
                    {inn.thisOver.map((c, i) => (
                      <Chip key={`${i}-${i === inn.thisOver.length - 1 ? snapshot.seq : ''}`} chip={c} pop={seqChanged && i === inn.thisOver.length - 1} />
                    ))}
                    {Array.from({ length: placeholders }, (_, i) => <Chip key={`e${i}`} chip={null} />)}
                  </div>
                  {prevOvers.length > 0 && (
                    <div className="sc-prev">
                      {prevOvers.map((p) => (
                        <div key={p.no}>
                          <span className="lbl no">OV {p.no}</span>
                          <div className="chips">{p.chips.map((c, i) => <Chip key={i} chip={c} size="sm" />)}</div>
                          <span className="tot">{p.runs}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="sc-card sc-log">
                  <div className="lbl" style={{ paddingBottom: 6 }}>BALL LOG</div>
                  {inn.log.length === 0 && <div className="sc-log-row"><span className="txt">No balls yet.</span></div>}
                  {inn.log.slice(-5).reverse().map((l, i) => (
                    <div key={`${l.over}-${inn.log.length - i}`} className="sc-log-row" data-new={on(seqChanged && i === 0)}>
                      <span className="ov">{l.over}</span>
                      <span className="lab" style={{ color: TONE[l.chip.kind] }}>{chipText(l.chip)}</span>
                      <span className="txt">{describeBall(l, names, inn)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="sc-side">
            <div className="sc-pad" role="group" aria-label="Scoring keypad">
              {([
                ['0', 'run', '0', () => scoreBall({ runs: 0 })], ['1', 'run', '1', () => scoreBall({ runs: 1 })],
                ['2', 'run', '2', () => scoreBall({ runs: 2 })], ['3', 'run', '3', () => scoreBall({ runs: 3 })],
                ['4', 'four', '4', () => scoreBall({ runs: 4 })], ['6', 'six', '6', () => scoreBall({ runs: 6 })],
                ['5/7', 'fs', '', () => openSheet('57', () => setFs({ runs: 5, src: 'bat' }))], ['OUT', 'out', 'X', openWicket],
                ['WD', 'ex', 'W', () => openExtras('wd')], ['NB', 'ex', 'N', () => openExtras('nb')],
                ['BYE', 'ex', 'B', () => openExtras('b')], ['LB', 'ex', 'L', () => openExtras('lb')],
              ] as const).map(([label, kind, hint, fn]) => (
                <button key={label} className="sc-key" data-kind={kind === 'run' ? undefined : kind} disabled={!canScore} onClick={() => void fn()}>
                  {label}
                  {hint && <sup aria-hidden>{hint}</sup>}
                </button>
              ))}
            </div>
            <button type="button" className="sc-undo" disabled={!canUndo || busy} onClick={undo} aria-label={`${undoTitle}. ${undoNote}`}>
              <span className="sc-undo-ico" aria-hidden>↶</span>
              <span className="sc-undo-text"><b>{undoTitle}</b><small>{undoNote}</small></span>
              <kbd aria-hidden>U</kbd>
            </button>
            <div className="sc-pills">
              <button className="sc-pill" disabled={!canScore} onClick={swap}>SWAP STRIKE · S</button>
              <button className="sc-pill" disabled={!canRevise} onClick={openRevise}>REDUCE OVERS</button>
              <button className="sc-pill" data-tone="danger" disabled={!s.toss || !!s.result} onClick={openEnd}>END MATCH</button>
              <button className="sc-pill" data-solid="card" onClick={() => setDrawer(true)}>MORE ACTIONS</button>
            </div>
            <div className="sc-kbd">
              <span className="lbl lbl-sm">KEYBOARD</span>
              <span>0–4, 6 RUNS · W WIDE · N NO BALL · B BYE · L LEG BYE · X WICKET · U UNDO · S SWAP · ESC CLOSE</span>
            </div>
          </div>
        </div>
      )}

      <Toaster />

      {/* modal sheets */}
      <div className="sc-scrim" data-open={on(!!active)} onClick={() => { if (sheet && !forced) setSheet(null); }}>
        <div className="sc-sheet" role="dialog" aria-modal aria-label={m.title} style={{ maxWidth: m.w }} onClick={(e) => e.stopPropagation()}>
          <div className="sc-sheet-head">
            <div>
              <div className="lbl" style={{ color: shown === 'wicket' ? 'var(--red-text)' : 'var(--amber)' }}>{m.kicker}</div>
              <div className="sc-sheet-title">{m.title}</div>
            </div>
            {m.closable && !forced && <button className="sc-x" aria-label="Close" onClick={() => setSheet(null)}>×</button>}
            {shown === 'toss' && forced === 'toss' && <button className="sc-x" aria-label="Cancel and go back to the match" onClick={() => router.push(backHref)}>×</button>}
            {shown === 'final' && <button className="sc-x" aria-label="Close" onClick={() => setAckFinal(true)}>×</button>}
          </div>

          {shown === 'extras' && (
            <>
              <div className="sc-opts" data-cols="4">
                {(['wd', 'nb', 'b', 'lb'] as Extra[]).map((t) => (
                  <Opt key={t} tone="gold" selected={ex.type === t} onClick={() => setEx({ ...ex, type: t, runs: (t === 'b' || t === 'lb') && ex.runs === 0 ? 1 : ex.runs })}>
                    {t === 'b' ? 'BYE' : t.toUpperCase()}
                  </Opt>
                ))}
              </div>
              <div className="sc-note">{EXTRA_COPY[ex.type]}</div>
              <Label>{ex.type === 'nb' ? 'RUNS SCORED' : ex.type === 'wd' ? 'RUNS TAKEN (BEYOND THE WIDE)' : 'RUNS TAKEN'}</Label>
              <div className="sc-opts" data-cols="7">
                {[0, 1, 2, 3, 4, 5, 6].map((r) => (
                  <Opt key={r} num selected={ex.runs === r} onClick={() => setEx({ ...ex, runs: r })}>{r}</Opt>
                ))}
              </div>
              {ex.type === 'nb' && (
                <>
                  <Label>CREDITED TO</Label>
                  <div className="sc-opts" data-cols="3">
                    {([['OFF THE BAT', 'bat'], ['BYES', 'b'], ['LEG BYES', 'lb']] as const).map(([l, v]) => (
                      <Opt key={v} selected={ex.nbKind === v} onClick={() => setEx({ ...ex, nbKind: v })}>{l}</Opt>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {shown === '57' && (
            <>
              <div className="sc-opts" data-cols="2">
                {[5, 7].map((r) => (
                  <Opt key={r} big selected={fs.runs === r} onClick={() => setFs({ ...fs, runs: r })}>{r}</Opt>
                ))}
              </div>
              <Label>CREDITED TO</Label>
              <div className="sc-opts" data-cols="3">
                {([['OFF THE BAT', 'bat'], ['BYES', 'b'], ['LEG BYES', 'lb']] as const).map(([l, v]) => (
                  <Opt key={v} selected={fs.src === v} onClick={() => setFs({ ...fs, src: v })}>{l}</Opt>
                ))}
              </div>
              <div className="sc-note">For overthrows that reach the boundary or all-run fives and sevens. A boundary four plus overthrows stays off the bat.</div>
            </>
          )}

          {shown === 'wicket' && (
            <>
              <Label>DELIVERY</Label>
              <div className="sc-opts" data-cols="3">
                {([['NORMAL', 'normal'], ['WIDE', 'wd'], ['NO BALL', 'nb']] as const).map(([l, v]) => (
                  <Opt key={v} tone="red" selected={wk.delivery === v} onClick={() => setWk({ ...wk, delivery: v })}>{l}</Opt>
                ))}
              </div>
              <Label>HOW OUT</Label>
              <div className="sc-opts" data-cols="3">
                {kinds.map((k) => (
                  <Opt key={k} tone="red" selected={wkKind === k} onClick={() => setWk({ ...wk, kind: k })}>{WICKET_LABEL[k]}</Opt>
                ))}
              </div>
              {isRunOut && (
                <>
                  <Label>WHO IS OUT</Label>
                  <div className="sc-opts" data-cols="2">
                    {slots.map((id, i) => id && (
                      <Opt key={id} text tone="red" selected={wk.who === i} onClick={() => setWk({ ...wk, who: i as 0 | 1 })}>
                        {nameOf(names, id)}{i === 0 ? ' · striker' : ''}
                      </Opt>
                    ))}
                  </div>
                  <Label>RUNS COMPLETED</Label>
                  <div className="sc-opts" data-cols="4">
                    {[0, 1, 2, 3].map((r) => <Opt key={r} num selected={wk.runs === r} onClick={() => setWk({ ...wk, runs: r })}>{r}</Opt>)}
                  </div>
                </>
              )}
              {needsFielder && (
                <>
                  <Label>{wkKind === 'stumped' ? 'KEEPER' : wkKind === 'caught' ? 'CAUGHT BY' : 'FIELDER'}</Label>
                  <div className="sc-opts" data-wrap="true">
                    {bowlSquad.map((p) => (
                      <Opt key={p.id} text selected={fielderId === p.id} onClick={() => setWk({ ...wk, fielder: fielderId === p.id ? '' : p.id })}>
                        {surnameOf(names, p.id)}{p.id === inn?.bowler ? ' (bowler)' : ''}{p.isKeeper ? ' (wk)' : ''}
                      </Opt>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {shown === 'retire' && (
            <>
              <Label>BATTER</Label>
              <div className="sc-opts" data-cols="2">
                {slots.map((id, i) => id && (
                  <Opt key={id} text selected={rt.who === i} onClick={() => setRt({ ...rt, who: i as 0 | 1 })}>{nameOf(names, id)}</Opt>
                ))}
              </div>
              <div className="sc-list sc-stack">
                {([['RETIRED HURT', 'hurt', 'Not out. Can return later in the innings.'], ['RETIRED OUT', 'out', 'Counts as a wicket. Cannot return.']] as const).map(([l, v, d]) => (
                  <button
                    key={v}
                    type="button"
                    className="sc-row-btn"
                    style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2, background: rt.type === v ? 'var(--blue-soft)' : undefined }}
                    onClick={() => setRt({ ...rt, type: v })}
                  >
                    <span className="mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', color: rt.type === v ? '#7fb2ff' : undefined }}>{l}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 400 }}>{d}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {shown === 'toss' && (
            <>
              <Label>WON THE TOSS</Label>
              <div className="sc-opts" data-cols="2">
                {s.teams.map((t) => <Opt key={t.id} big selected={toss.win === t.id} onClick={() => setToss({ ...toss, win: t.id })}>{t.name}</Opt>)}
              </div>
              <Label>ELECTED TO</Label>
              <div className="sc-opts" data-cols="2">
                {([['BAT', 'bat'], ['BOWL', 'bowl']] as const).map(([l, v]) => (
                  <Opt key={v} num selected={toss.choice === v} onClick={() => setToss({ ...toss, choice: v })}>{l}</Opt>
                ))}
              </div>
              <div className="sc-amberline">{tossWinnerName} won the toss and chose to {toss.choice} first.</div>
              {sheet === 'toss' && s.innings.length > 0 && <div className="sc-note">You already picked the openers. Saving a new toss clears them, and you pick them again.</div>}
            </>
          )}

          {shown === 'openers' && nextBat && (() => {
            const batTeam = nextBat, bowlTeam = otherTeam(s, nextBat);
            const first = s.innings.length === 0;
            const slots = [
              { key: 'striker' as const, n: 1, label: 'STRIKER', hint: 'Faces the first ball', id: open.striker, team: batTeam },
              { key: 'non' as const, n: 2, label: 'NON-STRIKER', hint: 'At the other end', id: open.non, team: batTeam },
              { key: 'bowler' as const, n: 3, label: 'OPENING BOWLER', hint: `${teamName(bowlTeam)} bowl`, id: open.bowler, team: bowlTeam },
            ];
            const active = slots.find((x) => x.key === open.step)!;
            const nameOfId = (id: string) => (id ? squad(batTeam).concat(squad(bowlTeam)).find((p) => p.id === id)?.name ?? '' : '');
            const taken = (id: string) => slots.find((x) => x.team === active.team && x.key !== active.key && x.id === id);
            const choose = (id: string) => setOpen((x) => {
              const next = { ...x, [active.key]: x[active.key] === id ? '' : id } as typeof x;
              // move on to the next empty slot after a pick
              const order: ('striker' | 'non' | 'bowler')[] = ['striker', 'non', 'bowler'];
              const empty = order.find((k) => !next[k]);
              return { ...next, step: next[active.key] && empty ? empty : x.step };
            });
            const missing = slots.find((x) => !x.id);
            return (
              <>
                <div className="so-recap">
                  <span><b>{teamName(batTeam)}</b> {first ? 'bat first' : 'bat'}</span>
                  {first && s.toss && <span>{teamName(s.toss.winnerTeamId)} won the toss and chose to {s.toss.decision}</span>}
                  {canEditToss(s) && <button type="button" className="sc-textbtn" onClick={startEditToss}>Wrong toss? Edit it</button>}
                </div>

                <div className="so-slots" role="group" aria-label="Openers and opening bowler">
                  {slots.map((x, i) => (
                    <div key={x.key} style={{ display: 'contents' }}>
                      <button type="button" className="so-slot" data-active={on(open.step === x.key)} data-filled={on(!!x.id)} aria-pressed={open.step === x.key} onClick={() => setOpen((o) => ({ ...o, step: x.key }))}>
                        <span className="so-n" aria-hidden>{x.id ? '✓' : x.n}</span>
                        <span className="so-slot-text">
                          <small>{x.label}</small>
                          <b>{x.id ? nameOfId(x.id) : 'Tap to choose'}</b>
                          <em>{x.hint}</em>
                        </span>
                      </button>
                      {i === 0 && (
                        <button type="button" className="so-swap" aria-label="Swap striker and non-striker" title="Swap striker and non-striker" disabled={!open.striker || !open.non} onClick={() => setOpen((o) => ({ ...o, striker: o.non, non: o.striker }))}>⇄</button>
                      )}
                    </div>
                  ))}
                </div>

                <Label>{active.key === 'bowler' ? `CHOOSE THE OPENING BOWLER · ${teamName(bowlTeam).toUpperCase()}` : `CHOOSE THE ${active.label} · ${teamName(batTeam).toUpperCase()}`}</Label>
                <div className="so-players">
                  {squad(active.team).map((p) => {
                    const other = taken(p.id);
                    const mine = active.id === p.id;
                    return (
                      <button key={p.id} type="button" className="so-player" data-on={on(mine)} disabled={!!other} onClick={() => choose(p.id)}>
                        <span className="so-ava" aria-hidden>{p.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')}</span>
                        <span className="so-pname">{p.name}</span>
                        <span className="so-tags">
                          {p.isCaptain && <i>C</i>}
                          {p.isKeeper && <i>WK</i>}
                          {other && <i data-on="true">{other.label}</i>}
                          {mine && <i data-on="true">✓</i>}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="so-ready" data-ready={on(openersReady)} role="status">
                  {openersReady
                    ? <>{nameOfId(pickS)} and {nameOfId(pickN)} open the batting. {nameOfId(openBowler)} bowls the first over.</>
                    : <>Next: choose the {missing ? missing.label.toLowerCase() : ''}.</>}
                </div>
              </>
            );
          })()}

          {shown === 'batter' && inn && (
            <>
              {lastOutLine(s, names) && <div className="sc-well sc-note">{lastOutLine(s, names)}</div>}
              <div className="sc-list">
                {batSquad
                  .filter((p) => (!inn.order.includes(p.id) || inn.batters[p.id]?.out?.kind === 'retired_hurt') && p.id !== inn.striker && p.id !== inn.nonStriker)
                  .map((p) => {
                    const prev = inn.batters[p.id];
                    return (
                      <button key={p.id} type="button" className="sc-row-btn" disabled={busy || !connected} onClick={() => void run('new_batter', { playerId: p.id }, `${p.name} is in`)}>
                        <span>{p.name}</span>
                        <span className="tag">{prev ? `RETIRED HURT · ${prev.runs}` : 'YET TO BAT'}</span>
                      </button>
                    );
                  })}
              </div>
            </>
          )}

          {shown === 'bowler' && inn && (
            <div className="sc-list">
              {bowlSquad.map((p) => {
                const b = inn.bowlers[p.id];
                const last = p.id === inn.lastBowler;
                const maxed = !!s.maxOversPerBowler && (b?.legalBalls ?? 0) >= s.maxOversPerBowler * 6;
                return (
                  <button key={p.id} type="button" className="sc-row-btn" disabled={last || maxed || busy || !connected} onClick={() => void run('new_bowler', { playerId: p.id }, `${p.name} to bowl`)}>
                    <span>{p.name}</span>
                    <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span className="note">{last ? 'BOWLED LAST OVER' : maxed ? `${s.maxOversPerBowler} OVERS DONE` : ''}</span>
                      <span className="fig">{b?.legalBalls ? bowlerFigure(b) : 'YET TO BOWL'}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {shown === 'result' && (
            <>
              <div className="sc-opts" data-cols="2">
                {s.teams.map((t) => <Opt key={t.id} selected={res === `win:${t.id}`} onClick={() => setRes(`win:${t.id}`)}>{t.name} won</Opt>)}
                {s.innings.length >= 2 && s.teams.map((t) => <Opt key={`d${t.id}`} selected={res === `dls:${t.id}`} onClick={() => setRes(`dls:${t.id}`)}>{t.name} won · DLS</Opt>)}
                <Opt selected={res === 'tie'} onClick={() => setRes('tie')}>TIE</Opt>
                <Opt selected={res === 'nr'} onClick={() => setRes('nr')}>NO RESULT</Opt>
              </div>
              {(res.startsWith('win:') || res.startsWith('dls:')) && (
                <label className="sc-field">
                  <span className="lbl lbl-sm">MARGIN (OPTIONAL)</span>
                  <input value={margin} maxLength={60} placeholder="e.g. 12 runs or 4 wickets" onChange={(e) => setMargin(e.target.value)} />
                </label>
              )}
              <div className="sc-result">
                <h3>{res === 'tie' ? 'Match tied' : res === 'nr' ? 'No result' : `${teamName(res.split(':')[1] ?? '')} won${margin.trim() ? ` by ${margin.trim().replace(/^by\s+/i, '')}` : ''}${res.startsWith('dls:') ? ' (DLS method)' : ''}`}</h3>
                {resultSummary.map((r) => <p key={r.team}><span>{r.team}</span><b>{r.score}</b></p>)}
              </div>
              <div className="sc-note">Publishing locks scoring and updates the live view for every viewer. You can still undo it.</div>
            </>
          )}

          {shown === 'revise' && (
            <>
              <div className="sc-note">The match is {s.overs} overs now. Innings already played keep the overs they were played under; the innings in progress and any still to come use the new number.</div>
              <label className="sc-field">
                <span className="lbl lbl-sm">NEW OVERS PER SIDE · {reviseMin} TO {s.overs - 1}</span>
                <input type="number" inputMode="numeric" min={reviseMin} max={s.overs - 1} step={1} value={rv.overs} onChange={(e) => setRv({ ...rv, overs: e.target.value })} />
              </label>
              {s.innings[0]?.closed && (
                <label className="sc-field">
                  <span className="lbl lbl-sm">REVISED TARGET (OPTIONAL)</span>
                  <input type="number" inputMode="numeric" min={1} step={1} value={rv.target} placeholder={`Now ${targetOf(s)}. Leave empty to keep it`} onChange={(e) => setRv({ ...rv, target: e.target.value })} />
                </label>
              )}
              {s.innings[0]?.closed && <div className="sc-note">The target is the runs the chasing side needs to win, from the DLS table or your own calculation. A chase that ends short of it loses by the gap.</div>}
            </>
          )}

          {shown === 'final' && (
            <>
              <div className="sc-result">
                <h3>{s.result?.text}</h3>
                {resultSummary.map((r) => <p key={r.team}><span>{r.team}</span><b>{r.score}</b></p>)}
              </div>
              <div className="sc-note">The result is published to the live view. Undo the last ball to reopen scoring.</div>
            </>
          )}

          {preview && (
            <div className="sc-preview">
              <Chip chip={preview.chip} />
              <span>{preview.text}</span>
            </div>
          )}

          {(m.secondary || showPrimary) && (
            <div className="sc-sheet-foot">
              {m.secondary && (
                <Btn variant="gray" onClick={secondary} disabled={(shown === 'batter' || shown === 'bowler' || shown === 'final') && !canUndo}>{m.secondary}</Btn>
              )}
              {showPrimary && (
                <Btn variant={m.variant ?? 'primary'} onClick={primary} disabled={busy || (!connected && shown !== 'final') || (shown === 'openers' && !openersReady) || (shown === 'revise' && !reviseOk)}>{m.primary!}</Btn>
              )}
            </div>
          )}
        </div>
      </div>

      {/* more actions drawer */}
      <div className="sc-drawer-scrim" data-open={on(drawer)} onClick={() => setDrawer(false)} />
      <aside className="sc-drawer" data-open={on(drawer)} aria-label="More actions" aria-hidden={!drawer}>
        <div className="sc-row" style={{ paddingBottom: 8, flexWrap: 'nowrap' }}>
          <h2>More actions</h2>
          <button className="sc-x" aria-label="Close" onClick={() => setDrawer(false)} tabIndex={drawer ? 0 : -1}>×</button>
        </div>
        {([
          { l: 'Edit toss', d: 'Fix the toss before the first ball', fn: startEditToss, off: !canEditToss(s) || busy },
          { l: 'Retire batter', d: 'Hurt or retired out', fn: () => openSheet('retire', () => setRt({ who: 0, type: 'hurt' })), off: !canScore },
          { l: 'Penalty runs', d: 'Award 5 to the batting side', fn: () => void run('penalty', { runs: 5 }, '5 penalty runs awarded'), off: !(inn && !inn.closed && connected && !busy) },
          { l: 'End innings', d: 'Declare or close the innings now', fn: () => { if (confirm('End this innings now?')) void run('end_innings', {}, 'Innings ended'); }, off: !(inn && !inn.closed && connected && !busy) },
          { l: 'Reduce overs', d: 'Shorten the match (rain, bad light), either innings', fn: openRevise, off: !canRevise },
          { l: 'End match', d: 'Win, DLS win, tie or no result', fn: openEnd, off: !s.toss || !!s.result, danger: true },
          { l: 'Release scorer lock', d: 'Let another scorer take over', fn: () => { release(); setDrawer(false); flash('Scorer lock released'); }, off: false },
        ]).map((d) => (
          <button key={d.l} className="sc-drawer-item" data-danger={d.danger ? 'true' : undefined} disabled={d.off} style={d.off ? { opacity: 0.45 } : undefined} tabIndex={drawer ? 0 : -1} onClick={d.fn}>
            <b>{d.l}</b>
            <span>{d.d}</span>
          </button>
        ))}
      </aside>
    </div>
  );
}
