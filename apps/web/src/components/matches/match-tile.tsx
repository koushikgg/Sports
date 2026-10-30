'use client';
import { matchHref, scoreHref } from '@/lib/match-href';
import Link from 'next/link';
import type { MatchSnapshot, ScoreSummary } from '@sports/shared';
import type { MatchCardData } from '@/lib/queries';
import { useLiveMatch } from '@/lib/use-live-match';
import { hasStarted, sideScore, splitScore, statusGroup, teamCode, teamTint } from './model';
import { dayBadge, kickoffLine } from './time';

function Side({ name, short, score, dim }: { name: string; short: string | null; score: string | undefined; dim: boolean }) {
  const tint = teamTint(name);
  const parts = splitScore(score);
  return (
    <div className="mx-side" data-dim={dim ? 'true' : undefined}>
      <span className="mx-team">
        <span className="mx-code" style={{ background: tint.bg, color: tint.fg }} aria-hidden>{teamCode(name, short)}</span>
        <span className="mx-name">{name}</span>
      </span>
      {parts && (
        <span className="mx-score">
          {parts[0]}
          {parts[1] && <small>{parts[1]}</small>}
        </span>
      )}
    </div>
  );
}

function View({
  m, summary, status, canScore, now,
}: {
  m: MatchCardData;
  summary: ScoreSummary;
  status: MatchCardData['status'];
  canScore: boolean;
  now: Date | null;
}) {
  const group = statusGroup(status);
  const started = hasStarted(summary);
  const badge = group === 'live' ? (status === 'paused' ? 'PAUSED' : 'LIVE') : group === 'up' ? dayBadge(m.scheduledAt, now) : status === 'abandoned' ? 'ABANDONED' : 'RESULT';
  const line = group === 'up' ? kickoffLine(m.scheduledAt, now) : summary.status || (status === 'abandoned' ? 'Match abandoned' : '');
  const open = matchHref(m);
  const canOpenScorer = canScore && group !== 'ft';

  return (
    <article className="mx-card" data-group={group}>
      <div className="mx-card-top">
        <span className="lbl mx-comp">{m.competition ?? m.sportName}</span>
        <span className="mx-badge" data-tone={status === 'paused' ? 'paused' : group}>
          <i />
          {badge}
        </span>
      </div>
      <div className="mx-sides">
        <Side name={m.teamA} short={m.teamAShort} score={started ? sideScore(summary, m.teamA) : undefined} dim={m.winner === 'b'} />
        <Side name={m.teamB} short={m.teamBShort} score={started ? sideScore(summary, m.teamB) : undefined} dim={m.winner === 'a'} />
      </div>
      {line && <div className="mx-line" data-group={group}>{line}</div>}
      <div className="mx-card-foot">
        <span className="mx-venue">{m.venue ?? ''}</span>
        {canOpenScorer && (
          <Link href={scoreHref(m)} className="mx-btn" data-variant="amber">
            {group === 'live' ? 'RESUME SCORING' : 'START SCORING'}
          </Link>
        )}
        <Link href={open} className="mx-btn" data-variant={group === 'live' ? 'blue' : 'gray'}>
          {group === 'live' ? 'WATCH' : group === 'up' ? 'DETAILS' : 'SCORECARD'}
        </Link>
      </div>
    </article>
  );
}

/** A live tile keeps its own score fresh over the socket. */
function LiveTile(props: { m: MatchCardData; canScore: boolean; now: Date | null }) {
  const { m } = props;
  const initial: MatchSnapshot = { matchId: m.id, sportKey: m.sportKey, roster: [], seq: m.seq, status: m.status, state: null, summary: m.summary };
  const { snapshot } = useLiveMatch(initial);
  return <View {...props} summary={snapshot.summary} status={snapshot.status} />;
}

export function MatchTile(props: { m: MatchCardData; canScore: boolean; now: Date | null }) {
  const live = statusGroup(props.m.status) === 'live';
  return live ? <LiveTile {...props} /> : <View {...props} summary={props.m.summary} status={props.m.status} />;
}
