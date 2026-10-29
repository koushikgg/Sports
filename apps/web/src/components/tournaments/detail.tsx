'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { TournamentDetail } from '@sports/scoring';
import { minTeamsFor } from '@sports/shared';
import { Leaderboards } from './leaderboards';
import { STAGES, stageTitle } from '@sports/sports-engine/src/fixture-import';
import { EditMatchSchedule, EditPendingFixture } from '@/components/match/edit-schedule';
import { EditTournament } from './edit-tournament';
import { FixturesImport } from './fixtures-import';
import { TableFixturesPanel } from './table-fixtures-panel';
import { ManagersTab } from './managers-tab';
import { TeamsTab } from './teams-tab';
import { sportColor, statusGroup } from '@/components/matches/model';
import { useHydrated } from '@/components/matches/time';
import { StandingsTable } from './standings-table';

type Tab = 'standings' | 'fixtures' | 'teams' | 'managers' | 'bracket' | 'leaders';
const TABS: [string, Tab][] = [['STANDINGS', 'standings'], ['FIXTURES', 'fixtures'], ['TEAMS', 'teams'], ['MANAGERS', 'managers'], ['BRACKET', 'bracket'], ['LEADERS', 'leaders']];
const dateLabel = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }).toUpperCase() : '—');

export function TournamentPanel({ t, isAdmin, candidates, fixturePrompt, venues, canEditMatches }: { t: TournamentDetail; isAdmin: boolean; /** Admin only: teams that can still be added. */ candidates?: { id: string; name: string }[]; /** Admin only: the text the fixture JSON import asks them to copy. */ fixturePrompt?: string; /** Admin only: every venue, for the editor. */ venues?: { id: string; name: string }[]; /** Admins, and this tournament's managers: they can edit a match's time and venue. */ canEditMatches?: boolean }) {
  const hasBracket = !!t.bracket;
  const [tab, setTab] = useState<Tab>('standings');
  const [hover, setHover] = useState<number | null>(null);
  const ready = useHydrated();
  const color = sportColor(t.sportKey);
  const cricket = t.sportKey === 'cricket';
  const tabs = TABS.filter(([, v]) => (v === 'teams' ? !!t.meta : v === 'bracket' ? hasBracket : v === 'leaders' ? !!t.boards : true));
  const active = tabs.some(([, v]) => v === tab) ? tab : 'standings';

  const leader = t.standings.find((s) => s.played > 0);
  const stage = t.status === 'up' ? (t.startsAt && ready ? `Starts ${dateLabel(t.startsAt)}` : 'Upcoming') : t.status === 'done' ? 'Completed' : t.formatKey === 'ko' ? 'Knockouts' : 'League phase';
  const kpis: [string, string][] = [
    ['STAGE', stage],
    ['MATCHES', `${t.played} / ${t.total}`],
    [t.status === 'done' ? 'CHAMPION' : 'LEADER', leader ? leader.name : '—'],
    ['DATES', ready ? `${dateLabel(t.startsAt)} – ${dateLabel(t.endsAt)}` : '—'],
  ];

  // Fixtures are grouped by stage (Round 1, Semi-finals, Final) when they carry stage names, and by local day otherwise,
  // oldest first. A Table tournament shows its league rounds, then Semi-finals and the Final, each under its own heading.
  // Imported fixtures still waiting on a result sit alongside real matches.
  type Item = { at: string; m?: (typeof t.matches)[number]; p?: (typeof t.pending)[number] };
  const venueNames = (t.meta?.venues ?? []).map((v) => v.name);
  const stageLike = (r: string | null | undefined): r is string => !!r && ((STAGES as readonly string[]).includes(r) || /^Round \d+$/i.test(r));
  const dayText = (at: string) => (at === '9999' ? 'DATE TO BE CONFIRMED' : new Date(at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase());
  const roundOf = (it: Item) => it.m?.round ?? it.p?.round ?? null;
  const days = useMemo(() => {
    const items: Item[] = [
      ...t.matches.map((m) => ({ at: m.scheduledAt ?? '9999', m })),
      ...t.pending.map((p) => ({ at: new Date(`${p.date}T${p.time}:00`).toISOString(), p })),
    ].sort((a, b) => a.at.localeCompare(b.at));
    const map = new Map<string, Item[]>();
    for (const it of items) {
      const key = stageLike(roundOf(it)) ? `s:${roundOf(it)}` : `d:${dayText(it.at)}`;
      map.set(key, [...(map.get(key) ?? []), it]);
    }
    return [...map]; // groups come out in the order they are first played
  }, [t.matches, t.pending]);

  return (
    <section className="tn-detail" aria-label={`${t.name} details`} style={{ ['--tn' as string]: color }}>
      <div className="tn-hero">
        <div className="tn-hero-top">
          <div>
            <div className="tn-meta"><span style={{ color }} className="lbl">{t.sportName.toUpperCase()}</span><span className="lbl">{t.formatLabel}{t.venues.length ? ` · ${t.venues.join(' & ')}` : ''}</span></div>
            <h2>{t.name}</h2>
          </div>
          <div className="tn-actions">
            {isAdmin && t.meta && venues && <EditTournament id={t.id} name={t.name} meta={t.meta} cricket={cricket} venues={venues} started={t.started} fixtureCount={t.fixtureCount} teamCount={t.meta.teams.length} />}
            {isAdmin && cricket && t.meta?.formatKey !== 'lk' && !t.started && <Link href={`/tournaments/${t.id}/create`} className="mx-btn mx-btn-lg" data-variant="amber">CREATE A MATCH</Link>}
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

        {active === 'fixtures' && isAdmin && t.meta?.formatKey === 'lk' && (
          <TableFixturesPanel tournamentId={t.id} teamCount={t.meta.teams.length} qualify={t.meta.qualify} matchesPerTeam={t.meta.matchesPerTeam} fixtureCount={t.fixtureCount} started={t.started} />
        )}

        {active === 'fixtures' && isAdmin && t.meta && t.meta.formatKey !== 'lk' && fixturePrompt && (
          <FixturesImport tournamentId={t.id} prompt={fixturePrompt} teamCount={t.meta.teams.length} fixtureCount={t.fixtureCount} started={t.started} />
        )}

        {active === 'fixtures' && t.byes.length > 0 && (
          <p className="tn-note">BYE · {t.byes.join(', ')} {t.byes.length === 1 ? 'goes' : 'go'} straight into {t.byes.length === 1 ? 'its' : 'their'} first match.</p>
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
                  <div className="tn-dayhead lbl">{day.startsWith('s:') ? `${stageTitle(day.slice(2)).toUpperCase()} · ${items.length} MATCH${items.length === 1 ? '' : 'ES'}` : day.slice(2)}</div>
                  {items.map((it) => {
                    if (it.p) {
                      const p = it.p;
                      return (
                        <div key={`p${p.no}`} className="tn-fx">
                          <span className="tn-st" data-g="up"><i />UPCOMING<small className="tn-round">{day.startsWith('s:') ? dayText(it.at) : (p.round ?? `MATCH ${p.no}`).toUpperCase()}</small></span>
                          <b className="tn-a" data-dim={p.openA ? 'true' : undefined}>{p.labelA}</b>
                          <span className="tn-score">{p.time}</span>
                          <b data-dim={p.openB ? 'true' : undefined}>{p.labelB}</b>
                          <span style={{ display: 'flex', gap: 10, alignItems: 'center', justifySelf: 'end' }}>
                            <span className="lbl">{p.openA || p.openB ? 'TEAMS TBD' : `MATCH ${p.no}`}</span>
                            {isAdmin && <EditPendingFixture tournamentId={t.id} no={p.no} date={p.date} time={p.time} venue={p.venue} venues={venueNames} small />}
                          </span>
                        </div>
                      );
                    }
                    const m = it.m!;
                    const g = statusGroup(m.status);
                    const sa = m.summary.sides.find((s) => s.name === m.teamA)?.score, sb = m.summary.sides.find((s) => s.name === m.teamB)?.score;
                    const started = m.summary.sides.some((s) => s.score !== '—');
                    const time = m.scheduledAt ? new Date(m.scheduledAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : 'TBC';
                    return (
                      <div key={m.id} className="tn-fx">
                        <span className="tn-st" data-g={g}><i />{g === 'live' ? 'LIVE' : g === 'up' ? 'UPCOMING' : 'RESULT'}{(day.startsWith('s:') || m.round) && <small className="tn-round">{day.startsWith('s:') ? dayText(it.at) : m.round!.toUpperCase()}</small>}</span>
                        <b className="tn-a" data-dim={m.winner === 'b' ? 'true' : undefined}>{m.teamA}</b>
                        <span className="tn-score">{g === 'up' || !started ? time : `${(sa ?? '').split(' ')[0]} – ${(sb ?? '').split(' ')[0]}`}</span>
                        <b data-dim={m.winner === 'a' ? 'true' : undefined}>{m.teamB}</b>
                        <span style={{ display: 'flex', gap: 8, alignItems: 'center', justifySelf: 'end' }}>
                          {(isAdmin || canEditMatches) && m.status === 'scheduled' && m.seq === 0 && <EditMatchSchedule matchId={m.id} scheduledAt={m.scheduledAt} venue={m.venue} venues={venueNames} label="EDIT" small />}
                                                  <Link href={`/tournaments/${t.id}/matches/${m.id}`} className="mx-btn" data-variant={g === 'live' ? 'blue' : 'gray'}>{g === 'live' ? 'WATCH' : g === 'up' ? 'DETAILS' : 'SCORECARD'}</Link>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )
        )}

        {active === 'teams' && t.meta && (
          <TeamsTab
            tournamentId={t.id}
            teams={t.meta.teams.map((x) => ({ id: x.id, name: x.name, matches: t.matches.filter((m) => m.teamA === x.name || m.teamB === x.name).length }))}
            candidates={isAdmin && !t.started ? (candidates ?? []) : null}
            adminLocked={isAdmin && t.started}
            table={t.meta.formatKey === 'lk'}
            minTeams={minTeamsFor(t.meta.formatKey, t.meta.qualify)}
            sportName={t.sportName}
            fixtureCount={t.fixtureCount}
            started={t.started}
          />
        )}

        {active === 'managers' && <ManagersTab tournamentId={t.id} managers={t.managers} isAdmin={isAdmin} />}

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
