'use client';
import Link from 'next/link';
import { EditMatchSchedule } from './edit-schedule';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MatchSnapshot } from '@sports/shared';
import { currentInnings, formatOvers, otherTeam, runRate, type Chip as ChipData, type CricketState } from '@sports/sports-engine/src/cricket';
import { bowlerFigure, chase, chipText, currentOverRuns, describeBall, nameOf, overSummaries, projected, strikeRate } from '@sports/sports-engine/src/cricket-view';
import { ScorerCard } from '@/components/cricket/scorer-card';
import { Avatar } from '@/components/ratch/avatar';
import { Chip } from '@/components/ratch/chip';
import { LocalTime } from '@/components/local-time';
import { displayHref, scoreHref } from '@/lib/match-href';
import type { MatchCardData } from '@/lib/queries';
import { useLiveMatch } from '@/lib/use-live-match';

const TONE: Record<ChipData['kind'], string> = {
  dot: 'var(--text-tertiary)', run: 'var(--text-primary)', four: '#4d94ff', six: 'var(--green)', wicket: 'var(--red-text)', extra: 'var(--amber)',
};
const FLASH = { four: 'FOUR', six: 'SIX', wicket: 'WICKET' } as const;

function Side({ name, right, big }: { name: string; right: React.ReactNode; big?: boolean }) {
  return (
    <div className="mp-side" data-big={big ? 'true' : undefined}>
      <span className="mp-team"><Avatar name={name} size={big ? 44 : 36} /><span>{name}</span></span>
      {right}
    </div>
  );
}

export function LiveMatch({ initial, card, canScore }: { initial: MatchSnapshot; card: MatchCardData; canScore: boolean }) {
  const { snapshot, connected } = useLiveMatch(initial);
  const s = snapshot.state as CricketState;
  const cricket = snapshot.sportKey === 'cricket' && s?.kind === 'cricket';
  const inn = cricket ? currentInnings(s) : undefined;
  const live = snapshot.status === 'live';
  const names = useMemo(
    () => Object.fromEntries(snapshot.roster.flatMap((t) => t.players.map((p) => [p.id, p.name]))),
    [snapshot.roster],
  );

  // Boundary / wicket flash on the score card, only when a new ball arrives (not on undo or resync).
  const [flash, setFlash] = useState<keyof typeof FLASH | null>(null);
  const seen = useRef({ innings: inn ? s.innings.length : 0, balls: inn ? inn.log.length : 0 });
  useEffect(() => {
    if (!inn) return;
    const now = { innings: s.innings.length, balls: inn.log.length };
    const grew = now.innings === seen.current.innings && now.balls === seen.current.balls + 1;
    seen.current = now;
    const kind = inn.log.at(-1)?.chip.kind;
    if (grew && (kind === 'four' || kind === 'six' || kind === 'wicket')) {
      setFlash(kind);
      const t = setTimeout(() => setFlash(null), 1100);
      return () => clearTimeout(t);
    }
  }, [snapshot.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  const badge = live ? 'LIVE' : snapshot.status === 'paused' ? 'PAUSED' : snapshot.status === 'scheduled' ? 'UPCOMING' : snapshot.status === 'abandoned' ? 'ABANDONED' : 'RESULT';
  const tone = live ? 'live' : snapshot.status === 'paused' ? 'paused' : snapshot.status === 'scheduled' ? 'up' : 'ft';

  const header = (
    <div className="mp-hero-top">
      <span className="lbl">{[card.competition ?? card.sportName, card.venue].filter(Boolean).join(' · ')}</span>
      <span className="mp-live">
        {live && <span className="mp-conn" data-on={connected ? 'true' : undefined}>{connected ? '● Live updates on' : '○ Connecting…'}</span>}
        <span className="mx-badge" data-tone={tone}><i />{badge}</span>
      </span>
    </div>
  );

  // ---- non-cricket fallback: the summary every sport provides
  if (!cricket || !inn) {
    return (
      <>
        <section className="mp-hero">
          {header}
          {card.teamA && (
            <>
              {snapshot.summary.sides.map((side) => (
                <Side key={side.name} name={side.name} big right={<span className="mp-bigscore">{side.score}</span>} />
              ))}
              <div className="mp-status">{snapshot.summary.status}</div>
            </>
          )}
        </section>
        {cricket && <ScorerCard s={s} names={names} />}
      </>
    );
  }

  const batting = inn.battingTeamId;
  const other = otherTeam(s, batting);
  const teamName = (id: string) => s.teams.find((t) => t.id === id)?.name ?? '';
  const first = s.innings.length === 2 ? s.innings[0]! : null;
  const ch = chase(s, inn);
  const crr = runRate(inn);
  const status = s.result
    ? s.result.text
    : inn.closed
      ? snapshot.summary.status
      : ch
        ? ch.need > 0 ? `Need ${ch.need} run${ch.need === 1 ? '' : 's'} from ${ch.left} ball${ch.left === 1 ? '' : 's'}${ch.rrr !== null ? ` · required rate ${ch.rrr.toFixed(2)}` : ''}` : 'Target reached'
        : inn.legalBalls ? `Projected ${projected(inn, s.overs)} at ${crr.toFixed(2)} an over` : 'Innings in progress';

  const bars = overSummaries(inn, s.overs);
  const peak = Math.max(10, ...bars.map((b) => b.runs));
  const bowler = inn.bowler ? inn.bowlers[inn.bowler] : undefined;
  const recent = inn.log.slice(-12).map((l) => l.chip);
  const bump = snapshot.seq !== initial.seq;

  return (
    <>
      <div className="mp-grid">
        <div className="mp-col">
          <section className="mp-hero" aria-label="Score">
            {header}
            <Side name={teamName(other)} right={<span className="mp-other">{first ? <>{first.runs}/{first.wickets} <small>({formatOvers(first.legalBalls)})</small></> : <small>Yet to bat</small>}</span>} />
            <div className="mp-side" data-big="true">
              <span className="mp-team"><Avatar name={teamName(batting)} size={44} /><span>{teamName(batting)}</span></span>
              <div className="mp-batscore">
                <span key={snapshot.seq} className="mp-runs" data-bump={bump ? 'true' : undefined} aria-live="polite">{inn.runs}/{inn.wickets}</span>
                <span className="lbl">{formatOvers(inn.legalBalls)} OV · CRR {crr.toFixed(2)}</span>
              </div>
            </div>
            <div className="mp-status">{status}</div>
            <div className="mp-flash" data-show={flash ? 'true' : undefined} data-kind={flash ?? undefined} aria-hidden>
              <span>{flash ? FLASH[flash] : ''}</span>
            </div>
          </section>

          <section className="mp-card" aria-label="Recent balls">
            <div className="lbl">RECENT BALLS</div>
            <div className="mp-chips">
              {recent.length === 0 && <span className="mp-muted">No balls yet.</span>}
              {recent.map((c, i) => <Chip key={`${i}-${inn.log.length}`} chip={c} size="md" pop={bump && i === recent.length - 1} />)}
            </div>
          </section>

          <section className="mp-card" aria-label="Runs per over">
            <div className="mp-row lbl"><span>RUNS PER OVER</span><span>{teamName(batting).toUpperCase()} INNINGS</span></div>
            <div className="mp-bars" style={{ gridTemplateColumns: `repeat(${s.overs}, 1fr)` }}>
              {bars.map((b) => (
                <div key={b.no} className="mp-bar" data-state={b.state} data-wicket={b.wickets > 0 ? 'true' : undefined} data-hot={b.runs >= 10 ? 'true' : undefined}
                  style={{ height: b.state === 'future' ? '4%' : `${Math.max(6, (b.runs / peak) * 100)}%` }} title={`Over ${b.no}: ${b.runs} runs${b.wickets ? `, ${b.wickets} wkt` : ''}`} />
              ))}
            </div>
            <div className="mp-axis">{bars.map((b) => <span key={b.no}>{b.no === 1 || b.no % 5 === 0 || b.no === s.overs ? b.no : ''}</span>)}</div>
            <div className="mp-legend"><i data-k="blue" />Over<i data-k="amber" />10+ runs<i data-k="red" />Wicket</div>
          </section>
        </div>

        <div className="mp-col">
          {!inn.closed && !s.result && (
            <section className="mp-card mp-crease" aria-label="At the crease">
              {[inn.striker, inn.nonStriker].map((id, i) => {
                const b = id ? inn.batters[id] : undefined;
                return id && b ? (
                  <div key={id} className="mp-person" data-striker={i === 0 ? 'true' : undefined}>
                    <Avatar name={nameOf(names, id)} size={32} />
                    <span className="mp-pname">{nameOf(names, id)}</span>
                    <span className="mp-tag">{i === 0 ? 'STRIKER' : ''}</span>
                    <span className="mp-pfig">{b.runs} <small>({b.balls})</small></span>
                    <span className="mp-psr lbl">SR {strikeRate(b)}</span>
                  </div>
                ) : null;
              })}
              {inn.bowler && bowler && (
                <div className="mp-person" data-bowler="true">
                  <Avatar name={nameOf(names, inn.bowler)} size={32} />
                  <span className="mp-pname">{nameOf(names, inn.bowler)}</span>
                  <span className="mp-tag lbl">BOWLING</span>
                  <span className="mp-pfig">{bowlerFigure(bowler)}</span>
                  <span className="mp-psr lbl">THIS OVER {currentOverRuns(inn)}</span>
                </div>
              )}
              {inn.partnership.balls > 0 && <div className="mp-muted mp-partner">Partnership {inn.partnership.runs} off {inn.partnership.balls}</div>}
            </section>
          )}

          <section className="mp-card" aria-label="Commentary">
            <div className="lbl mp-comm-head">COMMENTARY</div>
            {inn.log.length === 0 && <span className="mp-muted">Commentary starts with the first ball.</span>}
            {inn.log.slice(-15).reverse().map((l, i) => (
              <div key={`${l.over}-${inn.log.length - i}`} className="mp-comm" data-new={bump && i === 0 ? 'true' : undefined}>
                <span className="mp-comm-ov" style={{ color: TONE[l.chip.kind] }}>{l.over}</span>
                <span className="mp-comm-chip" style={{ color: TONE[l.chip.kind] }}>{chipText(l.chip)}</span>
                <span>{describeBall(l, names, inn)}</span>
              </div>
            ))}
          </section>
        </div>
      </div>

      <section aria-label="Scorecard" className="mp-scorecard">
        <div className="mp-section-head"><h2>Scorecard</h2><span className="lbl">{s.innings.length} INNINGS</span></div>
        <ScorerCard s={s} names={names} />
      </section>
    </>
  );
}

export function MatchHeader({ card, sportName, canScore, scheduleVenues }: { card: MatchCardData; sportName: string; canScore: boolean; /** Set for an admin: venue suggestions for the time and venue editor, shown while the match has not started. */ scheduleVenues?: string[] }) {
  const finished = card.status === 'completed' || card.status === 'abandoned';
  return (
    <>
      <nav className="rx-crumbs" aria-label="Breadcrumb">
        {card.tournamentId
          ? <><Link href="/tournaments">TOURNAMENTS</Link>/<Link href={`/tournaments/${card.tournamentId}`}>{(card.competition ?? 'TOURNAMENT').toUpperCase()}</Link>/</>
          : <><Link href="/matches">MATCHES</Link>/<Link href={`/sports/${card.sportKey}`}>{sportName.toUpperCase()}</Link>/</>}
        <span aria-current="page">{card.teamA.toUpperCase()} VS {card.teamB.toUpperCase()}</span>
      </nav>
      <div className="mp-title">
        <div>
          <span className="lbl"><LocalTime iso={card.scheduledAt} fallback="TIME TO BE CONFIRMED" /></span>
          <h1>{card.teamA} <span>vs</span> {card.teamB}</h1>
        </div>
        <div className="mp-actions">
          {scheduleVenues && card.status === 'scheduled' && card.seq === 0 && <EditMatchSchedule matchId={card.id} scheduledAt={card.scheduledAt} venue={card.venue} venues={scheduleVenues} />}
          {canScore && !finished && <Link href={scoreHref(card)} className="mx-btn mx-btn-lg" data-variant="amber">{card.seq === 0 ? 'START MATCH' : 'OPEN SCORER'}</Link>}
          <Link href={displayHref(card)} target="_blank" className="mx-btn mx-btn-lg" data-variant="gray">TV MODE ↗</Link>
        </div>
      </div>
    </>
  );
}
