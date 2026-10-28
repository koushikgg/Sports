'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { MatchSnapshot } from '@sports/shared';
import type { MatchCardData } from '@/lib/queries';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import { Featured } from './featured';
import { MatchTile } from './match-tile';
import { sportColor, statusGroup, type StatusGroup } from './model';
import { inThisWeek, isToday, todayLabel, useNow } from './time';

type StatusFilter = 'all' | StatusGroup;
const STATUS_TABS: [string, StatusFilter][] = [['ALL', 'all'], ['LIVE', 'live'], ['UPCOMING', 'up'], ['RESULTS', 'ft']];
const ORDER: Record<StatusGroup, number> = { live: 0, up: 1, ft: 2 };

export function MatchesBoard({
  matches, sports, featured, featuredCompetition, canScore,
}: {
  matches: MatchCardData[];
  sports: { key: string; name: string }[];
  featured: MatchSnapshot | null;
  featuredCompetition: string | null;
  canScore: boolean;
}) {
  const now = useNow();
  const [sport, setSport] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [q, setQ] = useState('');

  useLiveRefresh();

  const term = q.trim().toLowerCase();
  const list = useMemo(
    () =>
      matches
        .filter((m) => (sport === 'all' || m.sportKey === sport) && (status === 'all' || statusGroup(m.status) === status))
        .filter((m) => !term || [m.teamA, m.teamB, m.venue, m.competition].filter(Boolean).join(' ').toLowerCase().includes(term))
        .map((m, i) => ({ m, i }))
        .sort((x, y) => {
          const gx = statusGroup(x.m.status), gy = statusGroup(y.m.status);
          if (gx !== gy) return ORDER[gx] - ORDER[gy];
          if (gx === 'up') return (x.m.scheduledAt ?? '9999').localeCompare(y.m.scheduledAt ?? '9999');
          return x.i - y.i; // already newest first
        })
        .map((x) => x.m),
    [matches, sport, status, term],
  );

  const groups = useMemo(
    () =>
      sports
        .map((s) => {
          const items = list.filter((m) => m.sportKey === s.key);
          return { ...s, items, live: items.filter((m) => statusGroup(m.status) === 'live').length };
        })
        .filter((g) => g.items.length)
        .sort((a, b) => Number(b.live > 0) - Number(a.live > 0)),
    [list, sports],
  );

  const liveCount = matches.filter((m) => statusGroup(m.status) === 'live').length;
  const todayCount = now ? matches.filter((m) => statusGroup(m.status) === 'live' || isToday(m.scheduledAt, now)).length : null;
  const weekCount = now ? matches.filter((m) => statusGroup(m.status) === 'live' || inThisWeek(m.scheduledAt, now)).length : null;
  const showFeatured = !!featured && (sport === 'all' || sport === 'cricket') && (status === 'all' || status === 'live') && !term;
  const clear = () => { setSport('all'); setStatus('all'); setQ(''); };

  return (
    <>
      <div className="mx-head">
        <div>
          <span className="lbl" suppressHydrationWarning>{now ? todayLabel(now) : ' '}</span>
          <h1>Matches</h1>
        </div>
        <div className="mx-pills">
          <div className="mx-pill" data-tone="live"><i />{liveCount} LIVE NOW</div>
          <div className="mx-pill">{todayCount ?? '–'} TODAY</div>
          <div className="mx-pill">{weekCount ?? '–'} THIS WEEK</div>
        </div>
      </div>

      {showFeatured && <Featured key={featured.matchId} initial={featured} competition={featuredCompetition} canScore={canScore} />}

      <div className="mx-filters">
        <div className="mx-filter-row">
          <div className="mx-tabs-sport" role="group" aria-label="Sport">
            {[{ key: 'all', name: 'All sports' }, ...sports].map((s) => {
              const on = sport === s.key;
              const n = s.key === 'all' ? matches.length : matches.filter((m) => m.sportKey === s.key).length;
              return (
                <button key={s.key} className="mx-sporttab" aria-pressed={on} data-on={on ? 'true' : undefined} onClick={() => setSport(s.key)}>
                  <i style={{ background: s.key === 'all' ? 'var(--text-secondary)' : sportColor(s.key) }} />
                  {s.name.toUpperCase()}
                  <span>{n}</span>
                </button>
              );
            })}
          </div>
          <label className="mx-search">
            <span className="lbl">SEARCH</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Team, venue or tournament" aria-label="Search matches" />
          </label>
        </div>
        <div className="mx-statustabs" role="group" aria-label="Status">
          {STATUS_TABS.map(([label, v]) => (
            <button key={v} aria-pressed={status === v} data-on={status === v ? 'true' : undefined} onClick={() => setStatus(v)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="mx-list" key={`${sport}|${status}|${term}`}>
        {groups.map((g) => (
          <section key={g.key} className="mx-group" aria-label={g.name}>
            <div className="mx-group-head">
              <span className="mx-group-icon" style={{ background: `color-mix(in srgb, ${sportColor(g.key)} 16%, transparent)` }}>
                <i style={{ background: sportColor(g.key) }} />
              </span>
              <h2>{g.name}</h2>
              <span className="lbl">{g.items.length} MATCH{g.items.length === 1 ? '' : 'ES'}{g.live ? ` · ${g.live} LIVE` : ''}</span>
              <span style={{ flex: 1 }} />
              <Link href={`/sports/${g.key}`} className="mx-viewall">VIEW ALL</Link>
            </div>
            <div className="mx-grid">
              {g.items.map((m) => <MatchTile key={m.id} m={m} canScore={canScore} now={now} />)}
            </div>
          </section>
        ))}
        {groups.length === 0 && (
          <div className="mx-empty">
            {matches.length === 0 ? (
              <>
                <span className="mx-empty-title">No matches yet</span>
                <span>Matches appear here as soon as they are scheduled.</span>
              </>
            ) : (
              <>
                <span className="mx-empty-title">No matches here</span>
                <span>Try another sport or status, or clear the search.</span>
                <button onClick={clear}>CLEAR FILTERS</button>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
