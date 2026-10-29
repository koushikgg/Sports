'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { TournamentDetail } from '@sports/scoring';
import { Leaderboards } from './leaderboards';
import { sportColor, statusGroup } from '@/components/matches/model';
import { useHydrated } from '@/components/matches/time';
import { StandingsTable } from './standings-table';

type Tab = 'standings' | 'fixtures' | 'bracket' | 'leaders';
const TABS: [string, Tab][] = [['STANDINGS', 'standings'], ['FIXTURES', 'fixtures'], ['BRACKET', 'bracket'], ['LEADERS', 'leaders']];
const dateLabel = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }).toUpperCase() : '—');

export function TournamentPanel({ t, isAdmin }: { t: TournamentDetail; isAdmin: boolean }) {
  const hasBracket = !!t.bracket;
  const [tab, setTab] = useState<Tab>('standings');
  const [hover, setHover] = useState<number | null>(null);
  const ready = useHydrated();
  const color = sportColor(t.sportKey);
  const cricket = t.sportKey === 'cricket';
  const tabs = TABS.filter(([, v]) => (v === 'bracket' ? hasBracket : v === 'leaders' ? !!t.boards : true));
  const active = tabs.some(([, v]) => v === tab) ? tab : 'standings';

  const leader = t.standings.find((s) => s.played > 0);
  const stage = t.status === 'up' ? (t.startsAt && ready ? `Starts ${dateLabel(t.startsAt)}` : 'Upcoming') : t.status === 'done' ? 'Completed' : t.formatKey === 'ko' ? 'Knockouts' : 'League phase';
  const kpis: [string, string][] = [
    ['STAGE', stage],
    ['MATCHES', `${t.played} / ${t.total}`],
    [t.status === 'done' ? 'CHAMPION' : 'LEADER', leader ? leader.name : '—'],
    ['DATES', ready ? `${dateLabel(t.startsAt)} – ${dateLabel(t.endsAt)}` : '—'],
  ];

  // fixtures grouped by local day, oldest first
  const days = useMemo(() => {
    const sorted = [...t.matches].sort((a, b) => (a.scheduledAt ?? '9999').localeCompare(b.scheduledAt ?? '9999'));
    const map = new Map<string, typeof sorted>();
    for (const m of sorted) {
      const key = m.scheduledAt ? new Date(m.scheduledAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase() : 'DATE TO BE CONFIRMED';
      map.set(key, [...(map.get(key) ?? []), m]);
    }
    return [...map];
  }, [t.matches]);

  return (
    <section className="tn-detail" aria-label={`${t.name} details`} style={{ ['--tn' as string]: color }}>
      <div className="tn-hero">
        <div className="tn-hero-top">
          <div>
            <div className="tn-meta"><span style={{ color }} className="lbl">{t.sportName.toUpperCase()}</span><span className="lbl">{t.formatLabel}{t.venues.length ? ` · ${t.venues.join(' & ')}` : ''}</span></div>
            <h2>{t.name}</h2>
          </div>
          <div className="tn-actions">
            {isAdmin && cricket && <Link href={`/tournaments/${t.id}/create`} className="mx-btn mx-btn-lg" data-variant="amber">CREATE A MATCH</Link>}
          </div>
        </div>
        <div className="tn-kpis">{kpis.map(([k, v]) => <div key={k}><span className="lbl lbl-sm">{k}</span><b>{v}</b></div>)}</div>
        <div className="tn-tabs" role="tablist">
          {tabs.map(([l, v]) => <button key={v} role="tab" aria-selected={active === v} data-on={active === v ? 'true' : undefined} onClick={() => setTab(v)}>{l}</button>)}
        </div>
      </div>

      <div className="tn-pane">
        {active === 'standings' && (
          <StandingsTable rows={t.standings} qualify={t.qualify} showQualify={t.formatKey === 'lk' || t.formatKey === 'groups'} cricket={cricket} />
        )}

        {active === 'fixtures' && (
          days.length === 0 ? (
            <div className="tn-empty">
              <b>No fixtures yet</b>
              <span>Matches created for this tournament appear here. {isAdmin ? 'Create the first one from the button above.' : 'Check back soon.'}</span>
            </div>
          ) : (
            <div className="tn-days">
              {days.map(([day, items]) => (
                <div key={day} className="tn-day">
                  <div className="tn-dayhead lbl">{day}</div>
                  {items.map((m) => {
                    const g = statusGroup(m.status);
                    const sa = m.summary.sides.find((s) => s.name === m.teamA)?.score, sb = m.summary.sides.find((s) => s.name === m.teamB)?.score;
                    const started = m.summary.sides.some((s) => s.score !== '—');
                    const time = m.scheduledAt ? new Date(m.scheduledAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : 'TBC';
                    return (
                      <div key={m.id} className="tn-fx">
                        <span className="tn-st" data-g={g}><i />{g === 'live' ? 'LIVE' : g === 'up' ? 'UPCOMING' : 'RESULT'}</span>
                        <b className="tn-a" data-dim={m.winner === 'b' ? 'true' : undefined}>{m.teamA}</b>
                        <span className="tn-score">{g === 'up' || !started ? time : `${(sa ?? '').split(' ')[0]} – ${(sb ?? '').split(' ')[0]}`}</span>
                        <b data-dim={m.winner === 'a' ? 'true' : undefined}>{m.teamB}</b>
                        <Link href={`/sports/${m.sportKey}/matches/${m.id}`} className="mx-btn" data-variant={g === 'live' ? 'blue' : 'gray'}>{g === 'live' ? 'WATCH' : g === 'up' ? 'DETAILS' : 'SCORECARD'}</Link>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )
        )}

        {active === 'bracket' && t.bracket && (
          <>
            <p className="tn-note">{t.bracket.projected ? 'Projected from the current standings. Fixtures for these rounds are planned separately.' : 'Seeded from the standings.'} Hover or tap a team to trace it.</p>
            <div className="tn-scroll">
              <div className="tn-bracket" style={{ gridTemplateColumns: `repeat(${t.bracket.rounds.length}, minmax(220px, 1fr))` }}>
                {t.bracket.rounds.map((round) => (
                  <div key={round.name} className="tn-col">
                    <span className="lbl">{round.name}{t.bracket!.projected ? ' · PROJECTED' : ''}</span>
                    <div className="tn-ties">
                      {round.ties.map((tie, i) => (
                        <div key={i} className="tn-tie">
                          {[tie.a, tie.b].map((side, k) => {
                            const known = side.seed !== null;
                            const name = side.bye ? 'Bye' : known ? t.bracket!.seeds[side.seed!] ?? 'To be decided' : 'To be decided';
                            const on = known && hover === side.seed;
                            return (
                              <button key={k} type="button" data-on={on ? 'true' : undefined} data-dim={hover !== null && !on ? 'true' : undefined} data-tbd={!known ? 'true' : undefined}
                                onMouseEnter={() => known && setHover(side.seed)} onMouseLeave={() => setHover(null)} onClick={() => known && setHover(side.seed === hover ? null : side.seed)}>
                                <span className="tn-seed">{known ? side.seed! + 1 : ''}</span><span className="tn-bname">{name}</span>
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {active === 'leaders' && t.boards && <Leaderboards boards={t.boards} />}
      </div>
    </section>
  );
}
