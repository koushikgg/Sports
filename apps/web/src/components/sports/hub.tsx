'use client';
import { useMemo, useState } from 'react';
import type { Leader } from '@sports/scoring';
import { canScoreMatch } from '@sports/shared';
import type { ShellUser } from '@/components/ratch/shell';
import { MatchTile } from '@/components/matches/match-tile';
import { sportColor, statusGroup, type StatusGroup } from '@/components/matches/model';
import { useNow } from '@/components/matches/time';
import type { MatchCardData } from '@/lib/queries';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import { LeaderBoard } from './leaders';

type Filter = 'all' | StatusGroup;
const TABS: [string, Filter][] = [['ALL', 'all'], ['LIVE', 'live'], ['UPCOMING', 'up'], ['RESULTS', 'ft']];
const SECTIONS: { key: StatusGroup; title: string; empty: string }[] = [
  { key: 'live', title: 'Live now', empty: 'No matches are live right now.' },
  { key: 'up', title: 'Upcoming', empty: 'No fixtures scheduled.' },
  { key: 'ft', title: 'Results', empty: 'No results yet.' },
];

export function SportHub({
  sport, matches, leaders, viewer,
}: {
  sport: { key: string; name: string };
  matches: MatchCardData[];
  leaders: { runs: Leader[]; wickets: Leader[] } | null;
  viewer: ShellUser | null;
}) {
  useLiveRefresh();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();

  const visible = useMemo(
    () => matches.filter((m) => !term || [m.teamA, m.teamB, m.venue, m.competition].filter(Boolean).join(' ').toLowerCase().includes(term)),
    [matches, term],
  );
  const by = (g: StatusGroup) => {
    const items = visible.filter((m) => statusGroup(m.status) === g);
    return g === 'up' ? [...items].sort((a, b) => (a.scheduledAt ?? '9999').localeCompare(b.scheduledAt ?? '9999')) : items;
  };
  const count = (g: StatusGroup) => matches.filter((m) => statusGroup(m.status) === g).length;
  const color = sportColor(sport.key);

  return (
    <>
      <div className="mx-head">
        <div className="sh-title">
          <span className="mx-group-icon sh-icon" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)` }}><i style={{ background: color }} /></span>
          <div>
            <span className="lbl">SPORT</span>
            <h1>{sport.name}</h1>
          </div>
        </div>
        <div className="mx-pills">
          <div className="mx-pill" data-tone="live"><i />{count('live')} LIVE NOW</div>
          <div className="mx-pill">{count('up')} UPCOMING</div>
          <div className="mx-pill">{count('ft')} RESULTS</div>
        </div>
      </div>

      <div className="mx-filter-row">
        <div className="mx-statustabs" role="group" aria-label="Status">
          {TABS.map(([label, v]) => (
            <button key={v} aria-pressed={filter === v} data-on={filter === v ? 'true' : undefined} onClick={() => setFilter(v)}>{label}</button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <label className="mx-search">
          <span className="lbl">SEARCH</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Team, venue or tournament" aria-label={`Search ${sport.name} matches`} />
        </label>
      </div>

      <div className={leaders ? 'sh-layout' : undefined}>
        <div className="sh-sections">
          {SECTIONS.filter((s) => filter === 'all' || filter === s.key).map((sec) => {
            const items = by(sec.key);
            if (filter === 'all' && items.length === 0 && count(sec.key) === 0 && sec.key !== 'live') return null;
            return (
              <section key={sec.key} className="mx-group" aria-label={sec.title}>
                <div className="mx-group-head">
                  <h2>{sec.title}</h2>
                  <span className="lbl">{items.length} MATCH{items.length === 1 ? '' : 'ES'}</span>
                </div>
                {items.length === 0 ? (
                  <p className="sh-empty">{term ? 'No matches match your search.' : sec.empty}</p>
                ) : (
                  <div className="mx-grid">{items.map((m) => <MatchTile key={m.id} m={m} canScore={canScoreMatch(viewer, m)} now={now} />)}</div>
                )}
              </section>
            );
          })}
        </div>
        {leaders && (
          <aside className="sh-aside" aria-label="Leaders">
            <LeaderBoard title="TOP RUN-SCORERS" unit="runs" rows={leaders.runs} />
            <LeaderBoard title="TOP WICKET-TAKERS" unit="wkts" rows={leaders.wickets} />
          </aside>
        )}
      </div>
    </>
  );
}
