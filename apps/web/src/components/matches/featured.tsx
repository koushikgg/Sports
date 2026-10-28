'use client';
import Link from 'next/link';
import type { MatchSnapshot } from '@sports/shared';
import { currentInnings, formatOvers, otherTeam, runRate, type CricketState } from '@sports/sports-engine/src/cricket';
import { chase, projected } from '@sports/sports-engine/src/cricket-view';
import { Chip } from '@/components/ratch/chip';
import { useLiveMatch } from '@/lib/use-live-match';

/** The big card for the live cricket match with the most activity. */
export function Featured({ initial, competition, canScore }: { initial: MatchSnapshot; competition: string | null; canScore: boolean }) {
  const { snapshot } = useLiveMatch(initial);
  const s = snapshot.state as CricketState;
  const inn = currentInnings(s);
  const name = (id: string) => s.teams.find((t) => t.id === id)?.name ?? '';
  const batting = inn ? inn.battingTeamId : s.teams[0]!.id;
  const other = otherTeam(s, batting);
  const first = s.innings.length === 2 ? s.innings[0]! : null;
  const ch = inn ? chase(s, inn) : null;
  const crr = inn ? runRate(inn) : 0;

  const status = (() => {
    if (!inn) return snapshot.summary.status;
    if (s.result) return s.result.text;
    if (inn.closed) return snapshot.summary.status;
    if (ch) return ch.need > 0 ? `Need ${ch.need} runs from ${ch.left} balls${ch.rrr !== null ? ` · required rate ${ch.rrr.toFixed(2)}` : ''}` : 'Target reached';
    return inn.legalBalls ? `Projected ${projected(inn, s.overs)} at ${crr.toFixed(2)} an over` : 'Innings in progress';
  })();

  const slots = inn ? 6 - (inn.legalBalls % 6) : 6;
  const watch = `/sports/${snapshot.sportKey}/matches/${snapshot.matchId}`;

  return (
    <section className="mx-feature" aria-label="Featured live match">
      <div className="mx-feature-main">
        <div className="mx-feature-tags">
          <span className="mx-badge" data-tone="live"><i />LIVE</span>
          <span className="lbl">FEATURED · CRICKET{competition ? ` · ${competition.toUpperCase()}` : ''}</span>
        </div>
        <div className="mx-feature-rows">
          <div className="mx-feature-other">
            <span>{name(other)}</span>
            <span className="mono">
              {first ? <>{first.runs}/{first.wickets} <small>({formatOvers(first.legalBalls)})</small></> : <small>Yet to bat</small>}
            </span>
          </div>
          <div className="mx-feature-bat">
            <span className="mx-feature-team">{name(batting)}</span>
            <span key={snapshot.seq} className="mx-feature-score" data-bump={snapshot.seq !== initial.seq ? 'true' : undefined}>
              {inn ? `${inn.runs}/${inn.wickets}` : '—'}
              {inn && <small>({formatOvers(inn.legalBalls)})</small>}
            </span>
          </div>
        </div>
        <div className="mx-feature-status">{status}</div>
      </div>
      <div className="mx-feature-side">
        <div className="mx-row lbl"><span>THIS OVER</span><span>{inn ? `CRR ${crr.toFixed(2)}` : ''}</span></div>
        <div className="mx-chips">
          {inn?.thisOver.map((c, i, a) => <Chip key={`${i}-${i === a.length - 1 ? snapshot.seq : ''}`} chip={c} pop={snapshot.seq !== initial.seq && i === a.length - 1} />)}
          {Array.from({ length: slots }, (_, i) => <Chip key={`e${i}`} chip={null} />)}
        </div>
        <div className="mx-feature-actions">
          <Link href={watch} className="mx-btn mx-btn-lg" data-variant="blue">WATCH LIVE</Link>
          {canScore && <Link href={`/admin/matches/${snapshot.matchId}/score`} className="mx-btn mx-btn-lg" data-variant="amber">OPEN SCORER</Link>}
          <Link href={watch} className="mx-btn mx-btn-lg" data-variant="gray">SCORECARD</Link>
        </div>
      </div>
    </section>
  );
}
