'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { MatchSnapshot } from '@sports/shared';
import {
  currentInnings,
  formatOvers,
  nextInningsBattingTeam,
  otherTeam,
  runRate,
  type CricketState,
  type Extra,
  type Innings,
  type WicketKind,
} from '@sports/sports-engine/src/cricket';
import { Button, Card } from '@/components/ui';
import { useScorer } from '@/lib/use-live-match';
import { cn } from '@/lib/utils';
import { CricketScorecard } from './scorecard';
import { ChipStrip, nameOf } from './shared';

type Send = (type: string, payload?: Record<string, unknown>) => Promise<boolean>;
type Player = { id: string; name: string };

export function CricketScorer({ initial }: { initial: MatchSnapshot }) {
  const { snapshot, connected, send, release, error, busy } = useScorer(initial);
  const s = snapshot.state as CricketState;
  const inn = currentInnings(s);
  const [tab, setTab] = useState<'score' | 'card'>('score');

  const names = useMemo(
    () => Object.fromEntries(snapshot.roster.flatMap((t) => t.players.map((p) => [p.id, p.name]))),
    [snapshot.roster],
  );
  const squad = (teamId: string): Player[] => snapshot.roster.find((t) => t.id === teamId)?.players ?? [];

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-md flex-col">
      <div className="flex items-center justify-between pb-2 text-sm">
        <Link href={`/admin/matches/${snapshot.matchId}`} className="text-muted hover:text-fg">← Match</Link>
        <span className={connected ? 'text-success' : 'text-muted'}>{connected ? '● connected' : '○ connecting…'}</span>
      </div>

      <div className="mb-3 flex gap-1 rounded-lg bg-surface p-1 text-sm">
        {(['score', 'card'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn('flex-1 rounded-md py-1.5', tab === t ? 'bg-surface-2 font-medium' : 'text-muted')}>
            {t === 'score' ? 'Scoring' : 'Scorecard'}
          </button>
        ))}
      </div>

      {tab === 'card' ? (
        <CricketScorecard state={s} names={names} />
      ) : (
        <>
          {inn && <ScoreHeader s={s} inn={inn} names={names} />}
          {error && <p className="mb-2 rounded-md bg-live/15 px-3 py-2 text-sm text-live">{error}</p>}

          {s.awaiting === 'toss' && <TossPanel s={s} send={send} busy={busy} />}
          {s.awaiting === 'innings_start' && <InningsStartPanel s={s} squad={squad} send={send} busy={busy} />}
          {s.awaiting === 'batter' && inn && (
            <PlayerPicker
              title="New batter"
              hint={`${s.teams.find((t) => t.id === inn.battingTeamId)?.name} · wicket ${inn.wickets}`}
              busy={busy}
              options={squad(inn.battingTeamId)
                .filter((p) => !inn.order.includes(p.id) || inn.batters[p.id]?.out?.kind === 'retired_hurt')
                .filter((p) => p.id !== inn.striker && p.id !== inn.nonStriker)
                .map((p) => ({ ...p, hint: inn.batters[p.id] ? 'retired hurt' : undefined }))}
              onPick={(id) => send('new_batter', { playerId: id })}
            />
          )}
          {s.awaiting === 'bowler' && inn && (
            <PlayerPicker
              title={`Over ${Math.floor(inn.legalBalls / 6) + 1} · choose bowler`}
              hint={inn.lastBowler ? `${nameOf(names, inn.lastBowler)} cannot bowl consecutive overs` : undefined}
              busy={busy}
              options={squad(inn.bowlingTeamId).map((p) => {
                const b = inn.bowlers[p.id];
                const capped = !!s.maxOversPerBowler && (b?.legalBalls ?? 0) >= s.maxOversPerBowler * 6;
                return {
                  ...p,
                  disabled: p.id === inn.lastBowler || capped,
                  hint: b ? `${formatOvers(b.legalBalls)}-${b.maidens}-${b.runs}-${b.wickets}` : undefined,
                };
              })}
              onPick={(id) => send('new_bowler', { playerId: id })}
            />
          )}
          {s.awaiting === 'ball' && inn && <ScoringPad s={s} inn={inn} names={names} send={send} busy={busy} release={release} />}
          {s.awaiting === 'complete' && (
            <Card className="space-y-2 py-8 text-center">
              <div className="text-xl font-semibold">{s.result?.text}</div>
              <Link href={`/admin/matches/${snapshot.matchId}`} className="text-sm text-accent">Back to match</Link>
            </Card>
          )}
          {/* Undo is always reachable, even between prompts */}
          {s.awaiting !== 'ball' && snapshot.seq > 0 && (
            <Button variant="ghost" className="mt-3" disabled={busy} onClick={() => send('undo')}>Undo last action</Button>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ScoreHeader({ s, inn, names }: { s: CricketState; inn: Innings; names: Record<string, string> }) {
  const team = s.teams.find((t) => t.id === inn.battingTeamId)!;
  const crr = runRate(inn);
  const chasing = s.innings.length === 2 && !s.result;
  const ballsLeft = s.overs * 6 - inn.legalBalls;
  const need = chasing ? s.innings[0]!.runs + 1 - inn.runs : 0;

  return (
    <div className="mb-3 rounded-xl bg-surface px-4 py-5 text-center">
      <div className="text-sm text-muted">{team.name}</div>
      <div className="font-mono text-5xl font-bold">
        {inn.runs}/{inn.wickets}{' '}
        <span className="text-lg font-normal text-muted">({formatOvers(inn.legalBalls)}/{s.overs})</span>
      </div>
      <div className="mt-1 text-xs text-muted">
        CRR: {crr.toFixed(2)}
        {!chasing && inn.legalBalls > 0 && <> · Projected Score: {Math.round(crr * s.overs)} (at {crr.toFixed(0)} RPO)</>}
        {chasing && <> · Need {Math.max(need, 0)} from {ballsLeft} ball{ballsLeft === 1 ? '' : 's'}</>}
      </div>
      {s.awaiting === 'ball' && (
        <div className="mt-4 grid grid-cols-2 gap-2 text-left text-sm">
          {[inn.striker, inn.nonStriker].map((id, i) => {
            const b = id ? inn.batters[id] : null;
            return (
              <div key={i} className={cn('rounded-lg border px-3 py-2', i === 0 ? 'border-brand/60' : 'border-border')}>
                <div className={cn('truncate', i === 0 && 'font-semibold text-brand')}>{nameOf(names, id)}{i === 0 && ' *'}</div>
                <div className="font-mono text-muted">{b ? `${b.runs}(${b.balls})` : '—'}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </Card>
  );
}

function PlayerPicker({
  title, hint, options, onPick, busy,
}: {
  title: string;
  hint?: string;
  options: (Player & { disabled?: boolean; hint?: string })[];
  onPick: (id: string) => void;
  busy: boolean;
}) {
  return (
    <Panel title={title} hint={hint}>
      <div className="grid gap-2">
        {options.length === 0 && <p className="text-sm text-muted">No eligible players. Add players to the team roster.</p>}
        {options.map((p) => (
          <button
            key={p.id}
            disabled={busy || p.disabled}
            onClick={() => onPick(p.id)}
            className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-4 py-3 text-left disabled:opacity-40"
          >
            <span>{p.name}</span>
            {p.hint && <span className="font-mono text-xs text-muted">{p.hint}</span>}
          </button>
        ))}
      </div>
    </Panel>
  );
}

function TossPanel({ s, send, busy }: { s: CricketState; send: Send; busy: boolean }) {
  const [winner, setWinner] = useState(s.teams[0]!.id);
  const [decision, setDecision] = useState<'bat' | 'bowl'>('bat');
  return (
    <Panel title="Toss" hint={`${s.overs}-over match`}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {s.teams.map((t) => (
            <Toggle key={t.id} on={winner === t.id} onClick={() => setWinner(t.id)}>{t.name} won</Toggle>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Toggle on={decision === 'bat'} onClick={() => setDecision('bat')}>Elected to bat</Toggle>
          <Toggle on={decision === 'bowl'} onClick={() => setDecision('bowl')}>Elected to bowl</Toggle>
        </div>
        <Button className="w-full" disabled={busy} onClick={() => send('toss', { winnerTeamId: winner, decision })}>Continue</Button>
      </div>
    </Panel>
  );
}

function InningsStartPanel({ s, squad, send, busy }: { s: CricketState; squad: (id: string) => Player[]; send: Send; busy: boolean }) {
  const batting = nextInningsBattingTeam(s)!;
  const bowling = otherTeam(s, batting);
  const bats = squad(batting);
  const bowls = squad(bowling);
  const [striker, setStriker] = useState(bats[0]?.id ?? '');
  const [non, setNon] = useState(bats[1]?.id ?? '');
  const [bowler, setBowler] = useState(bowls[0]?.id ?? '');
  const second = s.innings.length === 1;
  const teamName = (id: string) => s.teams.find((t) => t.id === id)!.name;

  const select = (value: string, set: (v: string) => void, list: Player[]) => (
    <select value={value} onChange={(e) => set(e.target.value)} className="w-full rounded-md border border-border bg-surface-2 px-3 py-3">
      {list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );

  return (
    <Panel
      title={second ? 'Second innings' : 'First innings'}
      hint={second ? `${teamName(batting)} need ${s.innings[0]!.runs + 1} to win` : `${teamName(batting)} to bat`}
    >
      <div className="space-y-3 text-sm">
        <label className="block space-y-1"><span className="text-muted">Striker</span>{select(striker, setStriker, bats)}</label>
        <label className="block space-y-1"><span className="text-muted">Non-striker</span>{select(non, setNon, bats)}</label>
        <label className="block space-y-1"><span className="text-muted">Opening bowler ({teamName(bowling)})</span>{select(bowler, setBowler, bowls)}</label>
        <Button
          className="w-full"
          disabled={busy || !striker || !non || !bowler || striker === non}
          onClick={() => send('start_innings', { strikerId: striker, nonStrikerId: non, bowlerId: bowler })}
        >
          Start innings
        </Button>
      </div>
    </Panel>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn('rounded-lg border px-3 py-3 text-sm', on ? 'border-brand bg-brand/15 text-brand' : 'border-border bg-surface-2')}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------

type Sheet =
  | null
  | { kind: 'extra'; extra: Extra }
  | { kind: 'more' }
  | { kind: 'wicket' }
  | { kind: 'retire' };

function ScoringPad({
  s, inn, names, send, busy, release,
}: {
  s: CricketState;
  inn: Innings;
  names: Record<string, string>;
  send: Send;
  busy: boolean;
  release: () => void;
}) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const close = () => setSheet(null);
  const submit = async (type: string, payload: Record<string, unknown>) => {
    if (await send(type, payload)) close();
  };
  const bowler = inn.bowler ? inn.bowlers[inn.bowler] : null;

  return (
    <>
      <div className="rounded-xl bg-surface px-4 py-3">
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="font-medium">{nameOf(names, inn.bowler)}</span>
          {bowler && (
            <span className="font-mono text-muted">
              {formatOvers(bowler.legalBalls)}-{bowler.maidens}-{bowler.runs}-{bowler.wickets}
            </span>
          )}
        </div>
        <ChipStrip chips={inn.thisOver} />
      </div>

      <div className="mt-auto pt-4">
        <div className="flex h-72 gap-px overflow-hidden rounded-xl bg-border">
          <div className="grid flex-[3] grid-cols-3 grid-rows-3 gap-px">
            {[0, 1, 2, 3].map((n) => (
              <Key key={n} disabled={busy} onClick={() => submit('ball', { runs: n })}>{n}</Key>
            ))}
            <Key disabled={busy} sub="FOUR" onClick={() => submit('ball', { runs: 4 })}>4</Key>
            <Key disabled={busy} sub="SIX" onClick={() => submit('ball', { runs: 6 })}>6</Key>
            <Key disabled={busy} small onClick={() => setSheet({ kind: 'extra', extra: 'wd' })}>WD</Key>
            <Key disabled={busy} small onClick={() => setSheet({ kind: 'extra', extra: 'nb' })}>NB</Key>
            <Key disabled={busy} small onClick={() => setSheet({ kind: 'extra', extra: 'b' })}>BYE</Key>
          </div>
          <div className="grid flex-1 grid-rows-4 gap-px">
            <Key disabled={busy} small tone="undo" onClick={() => send('undo')}>UNDO</Key>
            <Key disabled={busy} small onClick={() => setSheet({ kind: 'more' })}>5, 7</Key>
            <Key disabled={busy} small tone="out" onClick={() => setSheet({ kind: 'wicket' })}>OUT</Key>
            <Key disabled={busy} small onClick={() => setSheet({ kind: 'extra', extra: 'lb' })}>LB</Key>
          </div>
        </div>

        <details className="mt-2 rounded-xl bg-surface text-sm">
          <summary className="cursor-pointer select-none px-4 py-2.5 text-center text-muted">Scoring shortcuts</summary>
          <div className="grid grid-cols-2 gap-2 p-3">
            <Button variant="ghost" disabled={busy} onClick={() => send('swap_strike')}>Swap strike</Button>
            <Button variant="ghost" disabled={busy} onClick={() => setSheet({ kind: 'retire' })}>Retire batter</Button>
            <Button variant="ghost" disabled={busy} onClick={() => send('penalty', { runs: 5 })}>Penalty +5</Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => confirm('End this innings now?') && send('end_innings')}
            >
              End innings
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => confirm('Finish the match as a tie?') && send('finish', { outcome: 'tie' })}
            >
              Call a tie
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => confirm('Finish with no result?') && send('finish', { outcome: 'no_result' })}
            >
              No result
            </Button>
            <Button variant="ghost" className="col-span-2" onClick={release}>Release scorer lock</Button>
          </div>
        </details>
      </div>

      {sheet?.kind === 'extra' && <ExtraSheet extra={sheet.extra} busy={busy} onClose={close} onPick={(runs, nbKind) => submit('ball', { runs, extra: sheet.extra, ...(nbKind && { nbKind }) })} />}
      {sheet?.kind === 'more' && (
        <Sheet title="Runs" onClose={close}>
          <RunGrid values={[5, 7]} busy={busy} onPick={(n) => submit('ball', { runs: n })} />
        </Sheet>
      )}
      {sheet?.kind === 'wicket' && <WicketSheet s={s} inn={inn} names={names} busy={busy} onClose={close} onSubmit={(p) => submit('ball', p)} />}
      {sheet?.kind === 'retire' && (
        <Sheet title="Retire which batter?" onClose={close}>
          <div className="grid gap-2">
            {[inn.striker, inn.nonStriker].map((id) =>
              id ? (
                <div key={id} className="grid grid-cols-2 gap-2">
                  <Button variant="ghost" disabled={busy} onClick={() => submit('retire', { playerId: id, kind: 'retired_hurt' })}>{nameOf(names, id)} · hurt</Button>
                  <Button variant="danger" disabled={busy} onClick={() => submit('retire', { playerId: id, kind: 'retired_out' })}>{nameOf(names, id)} · out</Button>
                </div>
              ) : null,
            )}
          </div>
        </Sheet>
      )}
    </>
  );
}

function Key({
  children, sub, small, tone, disabled, onClick,
}: {
  children: React.ReactNode;
  sub?: string;
  small?: boolean;
  tone?: 'undo' | 'out';
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center bg-surface-2 active:bg-border disabled:opacity-50',
        small ? 'text-sm font-semibold tracking-wide' : 'text-2xl',
        tone === 'undo' && 'text-success',
        tone === 'out' && 'text-live',
        !small && !tone && 'text-fg',
        small && !tone && 'text-muted',
      )}
    >
      {children}
      {sub && <span className="text-[10px] tracking-widest text-muted">{sub}</span>}
    </button>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div className="max-h-[85dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-2xl border border-border bg-surface p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="text-muted" aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RunGrid({ values, onPick, busy }: { values: number[]; onPick: (n: number) => void; busy: boolean }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {values.map((n) => (
        <button key={n} disabled={busy} onClick={() => onPick(n)} className="rounded-lg border border-border bg-surface-2 py-4 text-xl disabled:opacity-50">{n}</button>
      ))}
    </div>
  );
}

const EXTRA_LABEL: Record<Extra, string> = { wd: 'Wide', nb: 'No ball', b: 'Byes', lb: 'Leg byes' };

function ExtraSheet({ extra, busy, onClose, onPick }: { extra: Extra; busy: boolean; onClose: () => void; onPick: (runs: number, nbKind?: 'bat' | 'b' | 'lb') => void }) {
  const [nbKind, setNbKind] = useState<'bat' | 'b' | 'lb'>('bat');
  const values = extra === 'b' || extra === 'lb' ? [1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5, 6];
  return (
    <Sheet title={EXTRA_LABEL[extra]} onClose={onClose}>
      <p className="text-sm text-muted">
        {extra === 'wd' && 'Extra runs run on top of the 1-run penalty.'}
        {extra === 'nb' && 'Runs scored on top of the 1-run penalty.'}
        {(extra === 'b' || extra === 'lb') && 'How many runs were taken?'}
      </p>
      {extra === 'nb' && (
        <div className="grid grid-cols-3 gap-2">
          <Toggle on={nbKind === 'bat'} onClick={() => setNbKind('bat')}>Off the bat</Toggle>
          <Toggle on={nbKind === 'b'} onClick={() => setNbKind('b')}>Byes</Toggle>
          <Toggle on={nbKind === 'lb'} onClick={() => setNbKind('lb')}>Leg byes</Toggle>
        </div>
      )}
      <RunGrid values={values} busy={busy} onPick={(n) => onPick(n, extra === 'nb' ? nbKind : undefined)} />
    </Sheet>
  );
}

const KIND_LABEL: Record<string, string> = {
  bowled: 'Bowled', caught: 'Caught', lbw: 'LBW', stumped: 'Stumped', hit_wicket: 'Hit wicket', run_out: 'Run out',
};
const KINDS_BY_DELIVERY: Record<'normal' | 'wd' | 'nb', WicketKind[]> = {
  normal: ['bowled', 'caught', 'lbw', 'stumped', 'hit_wicket', 'run_out'],
  wd: ['stumped', 'hit_wicket', 'run_out'],
  nb: ['run_out'],
};

function WicketSheet({
  s, inn, names, busy, onClose, onSubmit,
}: {
  s: CricketState;
  inn: Innings;
  names: Record<string, string>;
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const [delivery, setDelivery] = useState<'normal' | 'wd' | 'nb'>('normal');
  const [kind, setKind] = useState<WicketKind>('bowled');
  const [out, setOut] = useState(inn.striker!);
  const [fielder, setFielder] = useState('');
  const [runs, setRuns] = useState(0);

  const kinds = KINDS_BY_DELIVERY[delivery];
  const activeKind = kinds.includes(kind) ? kind : kinds[0]!;
  const fielders = s.squads[inn.bowlingTeamId] ?? [];
  const bowlingPlayers = fielders.map((id) => ({ id, name: nameOf(names, id) }));
  const isRunOut = activeKind === 'run_out';
  const needsFielder = activeKind === 'caught' || activeKind === 'stumped' || isRunOut;

  return (
    <Sheet title="Wicket" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div>
          <div className="mb-1 text-muted">Delivery</div>
          <div className="grid grid-cols-3 gap-2">
            <Toggle on={delivery === 'normal'} onClick={() => setDelivery('normal')}>Normal</Toggle>
            <Toggle on={delivery === 'wd'} onClick={() => setDelivery('wd')}>Wide</Toggle>
            <Toggle on={delivery === 'nb'} onClick={() => setDelivery('nb')}>No ball</Toggle>
          </div>
        </div>

        <div>
          <div className="mb-1 text-muted">How out</div>
          <div className="grid grid-cols-3 gap-2">
            {kinds.map((k) => (
              <Toggle key={k} on={activeKind === k} onClick={() => setKind(k)}>{KIND_LABEL[k]}</Toggle>
            ))}
          </div>
        </div>

        {isRunOut && (
          <>
            <div>
              <div className="mb-1 text-muted">Who is out</div>
              <div className="grid grid-cols-2 gap-2">
                {[inn.striker!, inn.nonStriker!].map((id) => (
                  <Toggle key={id} on={out === id} onClick={() => setOut(id)}>{nameOf(names, id)}</Toggle>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-muted">Runs completed</div>
              <div className="grid grid-cols-4 gap-2">
                {[0, 1, 2, 3].map((n) => <Toggle key={n} on={runs === n} onClick={() => setRuns(n)}>{n}</Toggle>)}
              </div>
            </div>
          </>
        )}

        {needsFielder && (
          <label className="block space-y-1">
            <span className="text-muted">{activeKind === 'caught' ? 'Caught by' : activeKind === 'stumped' ? 'Keeper' : 'Fielder'} (optional)</span>
            <select value={fielder} onChange={(e) => setFielder(e.target.value)} className="w-full rounded-md border border-border bg-surface-2 px-3 py-3">
              <option value="">—</option>
              {bowlingPlayers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}

        <Button
          variant="danger"
          className="w-full py-3"
          disabled={busy}
          onClick={() =>
            onSubmit({
              runs: isRunOut ? runs : 0,
              ...(delivery !== 'normal' && { extra: delivery }),
              wicket: {
                kind: activeKind,
                playerId: isRunOut ? out : inn.striker,
                ...(needsFielder && fielder && { fielderId: fielder }),
              },
            })
          }
        >
          Confirm wicket
        </Button>
      </div>
    </Sheet>
  );
}
