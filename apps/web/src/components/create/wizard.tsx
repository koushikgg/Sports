'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { FIXTURE_TYPES, FORMATS, TIEBREAKS, VISIBILITIES, fitMatchesPerTeam, matchesPerTeamOptions, minTeamsFor, type FormatKey, type Visibility } from '@sports/shared';
import { gapMinutesFor, generateTableFixtures } from '@sports/sports-engine/src/table-fixtures';
import { addDays, planTournament } from '@sports/sports-engine/src/tournament-plan';
import { sportColor, teamCode, teamTint } from '@/components/matches/model';
import { Avatar } from '@/components/ratch/avatar';
import { addTeam, addVenue, createMatchAction, publishTournament } from '@/app/tournaments/create/actions';
import { toast } from '@/components/ratch/toast';
import { newMatchHref, scoreHref } from '@/lib/match-href';

type Mode = 'tournament' | 'match';
interface Sport { id: string; key: string; name: string }
interface Team { id: string; name: string; shortName: string | null; sportId: string }
interface Venue { id: string; name: string }
interface TournamentRef { id: string; name: string; sportId: string; overs: number | null; teamIds: string[]; venueIds: string[] }
interface Player { id: string; name: string; role: string | null }
interface Scorer { id: string; name: string; role: string }
type Lineup = { playerIds: string[]; captainId: string | null; keeperId: string | null };

interface Props {
  initialMode: Mode;
  initialTournamentId: string | null;
  /** Set on a tournament's own create page: the match belongs to it, so the mode switch and the picker are hidden. */
  lockedTournament?: { id: string; name: string };
  currentUserId: string | null;
  sports: Sport[];
  teams: Team[];
  venues: Venue[];
  tournaments: TournamentRef[];
  rosters: Record<string, Player[]>;
  scorers: Scorer[];
}

type Done =
  | { kind: 'tournament'; id: string; name: string; teams: number; table: boolean; plan: { totalMatches: number; matchDays: number } }
  | { kind: 'match'; id: string; tournamentId: string | null; title: string; when: string };

const pad = (n: number) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmtD = (s: string) => {
  if (!s) return '—';
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};
const fmtT = (t: string) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number) as [number, number];
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
};
const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const emptyLineup = (): Lineup => ({ playerIds: [], captainId: null, keeperId: null });

// ---------------------------------------------------------------------------
// small controls
// ---------------------------------------------------------------------------

const Label = ({ children }: { children: React.ReactNode }) => <span className="lbl">{children}</span>;

function Pills<T extends string | number>({ options, value, onPick, multi, dot }: {
  options: { v: T; l: string; dot?: string }[];
  value: T | T[];
  onPick: (v: T) => void;
  multi?: boolean;
  dot?: boolean;
}) {
  const on = (v: T) => (multi ? (value as T[]).includes(v) : value === v);
  return (
    <div className="cw-pills" role="group">
      {options.map((o) => (
        <button key={String(o.v)} type="button" className="cw-pill" aria-pressed={on(o.v)} data-on={on(o.v) ? 'true' : undefined} onClick={() => onPick(o.v)}>
          {dot && o.dot && <i style={{ background: o.dot }} />}
          {o.l}
        </button>
      ))}
    </div>
  );
}

function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <span className="cw-stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <b>{value}</b>
      <button type="button" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </span>
  );
}

function ToggleRow({ on, onChange, title, hint }: { on: boolean; onChange: () => void; title: string; hint: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="cw-row" onClick={onChange}>
      <span><b>{title}</b><small>{hint}</small></span>
      <span className="cw-switch" data-on={on ? 'true' : undefined}><i /></span>
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="cw-field"><Label>{label}</Label>{children}</label>;
}

function TeamBadge({ name, short, size = 32 }: { name: string; short?: string | null; size?: number }) {
  const t = teamTint(name);
  return <span className="cw-code" style={{ width: size, height: size, background: t.bg, color: t.fg }} aria-hidden>{teamCode(name, short)}</span>;
}

// ---------------------------------------------------------------------------

export function Wizard(props: Props) {
  const { sports } = props;
  const cricket = sports.find((s) => s.key === 'cricket');

  const [mode, setMode] = useState<Mode>(props.initialMode);
  const [step, setStep] = useState(0);
  const [visited, setVisited] = useState(0);
  const [done, setDone] = useState<Done | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const setServerError = (m: string | null) => { if (m) toast.error(m); };

  const [teamList, setTeamList] = useState(props.teams);
  const [venueList, setVenueList] = useState(props.venues);
  const [newTeam, setNewTeam] = useState('');
  const [newVenue, setNewVenue] = useState('');
  const setAddError = (m: string | null) => { if (m) toast.error(m); };

  const [t, setT] = useState({
    name: '', visibility: 'public' as 'public' | 'private', sportId: cricket?.id ?? sports[0]?.id ?? '', start: '', end: '', venueIds: [] as string[],
    formatKey: 'lk' as FormatKey, overs: 20, points: { win: 2, tie: 1, noResult: 1 }, qualify: 4 as 2 | 4, perTeam: null as number | null,
    tiebreak: 'NRR' as (typeof TIEBREAKS)[number], teamIds: [] as string[], perDay: 2, firstTime: '18:00', rest: false,
  });

  const [m, setM] = useState({
    tournamentId: props.initialTournamentId as string | null, teamAId: '', teamBId: '', venueId: '', date: '', time: '19:30',
    rules: { overs: 20, powerplay: 6, playersPerSide: 11, freeHit: true, wideReball: true, superOver: true, dls: false },
    lineups: { a: emptyLineup(), b: emptyLineup() }, scorerId: '', ump1: '', ump2: '', visibility: 'public' as Visibility,
  });

  // dates default to the organiser's today (computed after mount so the server HTML stays stable)
  useEffect(() => {
    const d = today();
    setT((x) => (x.start ? x : { ...x, start: d, end: addDays(d, 14) }));
    setM((x) => (x.date ? x : { ...x, date: d }));
  }, []);

  const tournament = props.tournaments.find((x) => x.id === m.tournamentId) ?? null;
  const tSport = sports.find((s) => s.id === t.sportId);
  const tIsCricket = tSport?.key === 'cricket';
  const sportTeams = teamList.filter((x) => x.sportId === t.sportId);
  const matchTeams = tournament ? teamList.filter((x) => tournament.teamIds.includes(x.id)) : teamList.filter((x) => x.sportId === cricket?.id);
  const cricketTournaments = props.tournaments.filter((x) => x.sportId === cricket?.id);
  const teamById = (id: string) => teamList.find((x) => x.id === id);
  const rosterOf = (id: string) => props.rosters[id] ?? [];
  const scorerName = props.scorers.find((x) => x.id === m.scorerId)?.name ?? '';

  // choosing a tournament fills the match rules from it
  const chooseTournament = (id: string | null) => {
    const picked = props.tournaments.find((x) => x.id === id);
    setM((x) => ({
      ...x,
      tournamentId: id,
      rules: picked?.overs ? { ...x.rules, overs: picked.overs, powerplay: Math.min(x.rules.powerplay, picked.overs) } : x.rules,
      ...(picked && (!picked.teamIds.includes(x.teamAId) || !picked.teamIds.includes(x.teamBId))
        ? { teamAId: picked.teamIds.includes(x.teamAId) ? x.teamAId : '', teamBId: picked.teamIds.includes(x.teamBId) ? x.teamBId : '', lineups: { a: picked.teamIds.includes(x.teamAId) ? x.lineups.a : emptyLineup(), b: picked.teamIds.includes(x.teamBId) ? x.lineups.b : emptyLineup() } }
        : {}),
    }));
  };
  useEffect(() => { if (props.initialTournamentId) chooseTournament(props.initialTournamentId); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pickTeam = (side: 'a' | 'b', id: string) =>
    setM((x) => ({ ...x, [side === 'a' ? 'teamAId' : 'teamBId']: id, lineups: { ...x.lineups, [side]: emptyLineup() } }));

  const setLineup = (side: 'a' | 'b', f: (l: Lineup) => Lineup) => setM((x) => ({ ...x, lineups: { ...x.lineups, [side]: f(x.lineups[side]) } }));
  const togglePlayer = (side: 'a' | 'b', id: string) =>
    setLineup(side, (l) => {
      if (l.playerIds.includes(id)) return { playerIds: l.playerIds.filter((p) => p !== id), captainId: l.captainId === id ? null : l.captainId, keeperId: l.keeperId === id ? null : l.keeperId };
      return l.playerIds.length >= m.rules.playersPerSide ? l : { ...l, playerIds: [...l.playerIds, id] };
    });
  const setPlayersPerSide = (n: number) =>
    setM((x) => ({ ...x, rules: { ...x.rules, playersPerSide: n }, lineups: { a: trim(x.lineups.a, n), b: trim(x.lineups.b, n) } }));
  const trim = (l: Lineup, n: number): Lineup => {
    const ids = l.playerIds.slice(0, n);
    return { playerIds: ids, captainId: l.captainId && ids.includes(l.captainId) ? l.captainId : null, keeperId: l.keeperId && ids.includes(l.keeperId) ? l.keeperId : null };
  };
  const autoPick = (side: 'a' | 'b', teamId: string) =>
    setLineup(side, (l) => {
      const ids = rosterOf(teamId).slice(0, m.rules.playersPerSide).map((p) => p.id);
      const keeper = rosterOf(teamId).find((p) => ids.includes(p.id) && p.role === 'WK')?.id ?? l.keeperId;
      return { playerIds: ids, captainId: l.captainId && ids.includes(l.captainId) ? l.captainId : ids[0] ?? null, keeperId: keeper && ids.includes(keeper) ? keeper : null };
    });

  // ---- schedule maths (shared with the server)
  const teamCount = t.teamIds.length;
  // matches per team follows the team count: a value that no longer fits drops to the nearest that does
  const perTeam = t.formatKey === 'lk' ? fitMatchesPerTeam(teamCount, t.perTeam) : undefined;
  const perTeamOptions = matchesPerTeamOptions(teamCount);
  const basePlan = planTournament({ formatKey: t.formatKey, teams: teamCount, qualify: t.qualify, matchesPerTeam: perTeam, perDay: t.perDay, restDay: t.rest, startDate: t.start, endDate: t.end });
  // A Table's fixtures are made from these settings, so the preview is the real thing: the same maths the server runs.
  const generated = t.formatKey === 'lk' && teamCount >= 2
    ? generateTableFixtures({
        teams: t.teamIds.map((id) => ({ id, name: teamList.find((x) => x.id === id)?.name ?? '' })), qualify: t.qualify, matchesPerTeam: perTeam, startDate: t.start || today(),
        perDay: t.perDay, firstMatchTime: t.firstTime, restDay: t.rest, gapMinutes: gapMinutesFor(tIsCricket ? 'cricket' : 'other', t.overs), venues: [], tz: 0,
      })
    : [];
  const leagueGen = generated.filter((f) => f.a.kind === 'team');
  const lastGen = generated.at(-1)?.date ?? '';
  const plan = generated.length
    ? { ...basePlan, leagueMatches: leagueGen.length, knockoutMatches: generated.length - leagueGen.length, totalMatches: generated.length, matchDays: new Set(generated.map((f) => f.date)).size, lastMatchDate: lastGen, overrun: !!(t.end && lastGen > t.end) }
    : basePlan;
  const round1 = leagueGen.filter((f) => f.round === 'Round 1').slice(0, 5).map((f) => ({ a: (f.a as { id: string }).id, b: (f.b as { id: string }).id, date: f.date, time: f.time }));

  // ---- validity per step
  const minTeams = minTeamsFor(t.formatKey, t.qualify);
  const invalid: string[] = mode === 'tournament'
    ? [
        !t.name.trim() ? 'Give the tournament a name.' : !t.start || !t.end ? 'Choose the start and end dates.' : t.end < t.start ? 'End date is before the start date.' : '',
        '',
        teamCount < minTeams ? `Add at least ${minTeams} teams. ${teamCount} selected.` : '',
        '',
        '',
      ]
    : (() => {
        const a = m.lineups.a, b = m.lineups.b, n = m.rules.playersPerSide;
        const short = [m.teamAId, m.teamBId].find((id) => id && rosterOf(id).length < n);
        return [
          !m.teamAId || !m.teamBId ? 'Pick both teams.' : m.teamAId === m.teamBId ? 'Home and away must be different teams.' : !m.date ? 'Choose a date.' : '',
          m.rules.powerplay > m.rules.overs ? 'Powerplay cannot be longer than the match.' : '',
          short ? `${teamById(short)?.name} has only ${rosterOf(short).length} players on its roster. Add players or lower the players per side.`
            : a.playerIds.length !== n || b.playerIds.length !== n ? `Each side needs exactly ${n}. ${teamById(m.teamAId)?.name ?? 'Home'}: ${a.playerIds.length}, ${teamById(m.teamBId)?.name ?? 'Away'}: ${b.playerIds.length}.`
            : !a.captainId || !b.captainId ? 'Choose a captain for both sides.' : '',
          !m.scorerId ? 'Assign a scorer.' : '',
          '',
        ];
      })();
  const err = invalid[step] ?? '';
  const last = step === 4;
  const overrun = mode === 'tournament' && plan.overrun;

  const go = (s: number) => { if (s === step) return; setStep(s); setVisited((v) => Math.max(v, s)); setServerError(null); };

  // ---- adding things on the fly
  const makeTeam = async () => {
    setAddError(null);
    const r = await addTeam({ sportId: mode === 'tournament' ? t.sportId : cricket?.id ?? '', name: newTeam });
    if (!r.ok) return setAddError(r.error);
    setTeamList((l) => (l.some((x) => x.id === r.team.id) ? l : [...l, r.team]));
    if (mode === 'tournament') setT((x) => ({ ...x, teamIds: x.teamIds.includes(r.team.id) ? x.teamIds : [...x.teamIds, r.team.id] }));
    setNewTeam('');
  };
  const makeVenue = async () => {
    setAddError(null);
    const r = await addVenue(newVenue);
    if (!r.ok) return setAddError(r.error);
    setVenueList((l) => (l.some((x) => x.id === r.venue.id) ? l : [...l, r.venue].sort((a, b) => a.name.localeCompare(b.name))));
    if (mode === 'tournament') setT((x) => ({ ...x, venueIds: x.venueIds.includes(r.venue.id) ? x.venueIds : [...x.venueIds, r.venue.id] }));
    else setM((x) => ({ ...x, venueId: r.venue.id }));
    setNewVenue('');
  };

  // ---- publish
  const submit = async () => {
    if (err || submitting) return;
    setSubmitting(true); setServerError(null);
    const tzOffset = new Date().getTimezoneOffset();
    try {
      if (mode === 'tournament') {
        const r = await publishTournament({
          name: t.name, visibility: t.visibility, sportId: t.sportId, startDate: t.start, endDate: t.end, venueIds: t.venueIds, formatKey: t.formatKey,
          ...(tIsCricket ? { overs: t.overs } : {}), points: t.points, qualify: t.qualify, ...(perTeam ? { matchesPerTeam: perTeam } : {}), tiebreak: t.tiebreak, teamIds: t.teamIds,
          schedule: { perDay: t.perDay, firstMatchTime: t.firstTime, restDay: t.rest }, tzOffset,
        });
        if (!r.ok) return setServerError(r.error);
        setDone({ kind: 'tournament', id: r.id, name: t.name, teams: teamCount, table: t.formatKey === 'lk', plan: r.plan });
      } else {
        const r = await createMatchAction({
          tournamentId: m.tournamentId, teamAId: m.teamAId, teamBId: m.teamBId, venueId: m.venueId || null, date: m.date, time: m.time, tzOffset,
          rules: m.rules, lineups: m.lineups, scorerId: m.scorerId, umpires: [m.ump1, m.ump2].filter((u) => u.trim()), visibility: m.visibility,
        });
        if (!r.ok) return setServerError(r.error);
        setDone({ kind: 'match', id: r.id, tournamentId: m.tournamentId, title: `${teamById(m.teamAId)?.name} vs ${teamById(m.teamBId)?.name}`, when: `${fmtD(m.date)} · ${fmtT(m.time)}` });
      }
    } catch {
      setServerError('Something went wrong. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- copy
  const isT = mode === 'tournament';
  const steps = isT
    ? [['Basics', t.name || 'Name, sport, dates'], ['Format & rules', FORMATS[t.formatKey].label], ['Teams', `${teamCount} teams`], ['Schedule', `${plan.totalMatches} matches · ${plan.matchDays} days`], ['Review', 'Check and publish']]
    : [['Match details', `${teamCode(teamById(m.teamAId)?.name ?? '—', teamById(m.teamAId)?.shortName)} vs ${teamCode(teamById(m.teamBId)?.name ?? '—', teamById(m.teamBId)?.shortName)}`], ['Rules', `${m.rules.overs} overs · PP ${m.rules.powerplay}`], ['Playing XI', `${m.lineups.a.playerIds.length} + ${m.lineups.b.playerIds.length} selected`], ['Officials', scorerName || 'Assign a scorer'], ['Review', 'Check and create']];
  const titles = isT
    ? [['Name your tournament', 'The basics viewers see first.'], ['Fixture type and rules', 'Pick a Table, where the fixtures are made for you, or Custom, where you bring your own.'], ['Choose the teams', `Select existing teams or add new ones. At least ${minTeams} are needed.`], ['Build the schedule', t.formatKey === 'lk' ? 'Set the pace and timing. Your fixtures are made from this when you publish, and made again if you change teams or settings before the tournament starts.' : 'Set the pace and timing. These guide the fixtures you paste in later; nothing is created from them.'], ['Review and publish', 'Publishing saves the tournament and all of these settings.' + (t.formatKey === 'lk' ? ' Your fixtures are made at once.' : ' Add your fixtures from the Fixtures tab afterwards.') + '']]
    : [['Match details', 'Who is playing, where and when.'], ['Playing conditions', 'These rules drive the scorer console, including over limits and free hits.'], ['Playing XI', `Select ${m.rules.playersPerSide} for each side, then mark the captain and wicketkeeper.`], ['Officials and visibility', 'The assigned scorer opens the console on match day. Only they and admins can score this match.'], ['Review and create', 'Creating the match adds it to the schedule.']];

  const venueName = (id: string) => venueList.find((x) => x.id === id)?.name ?? '';
  const review: [string, string, number][] = isT
    ? [
        ['NAME', t.name || '—', 0], ['SPORT', tSport?.name ?? '—', 0], ['DATES', `${fmtD(t.start)} – ${fmtD(t.end)}`, 0], ['VENUES', t.venueIds.map(venueName).join(', ') || 'None yet', 0], ['WHO CAN SEE IT', t.visibility === 'private' ? 'Private: admins and managers only' : 'Public: everyone', 0],
        ['FORMAT', `${FORMATS[t.formatKey].label}${tIsCricket ? ` · ${t.overs} overs` : ''}${t.formatKey === 'lk' ? ` · top ${t.qualify} qualify` : ''}`, 1],
        ['POINTS', `Win ${t.points.win} · Tie ${t.points.tie} · No result ${t.points.noResult} · Tiebreak ${t.tiebreak}`, 1],
        ['TEAMS', t.teamIds.map((id) => teamById(id)?.name).filter(Boolean).join(', ') || '—', 2],
        ['SCHEDULE', `${plan.totalMatches} matches over ${plan.matchDays} days, ${t.perDay} per day from ${fmtT(t.firstTime)}${t.rest ? ', rest day between rounds' : ''}`, 3],
      ]
    : [
        ['MATCH', `${teamById(m.teamAId)?.name ?? '—'} vs ${teamById(m.teamBId)?.name ?? '—'}`, 0], ['PART OF', tournament?.name ?? 'Friendly', 0], ['WHEN', `${fmtD(m.date)} · ${fmtT(m.time)}`, 0], ['VENUE', venueName(m.venueId) || '—', 0],
        ['FORMAT', `${m.rules.overs} overs per side · powerplay ${m.rules.powerplay} · max ${Math.ceil(m.rules.overs / 5)} per bowler · ${m.rules.playersPerSide} a side`, 1],
        ['RULES', [m.rules.freeHit && 'Free hit', m.rules.superOver && 'Super over', m.rules.dls && 'DLS', m.rules.wideReball && 'Wides re-bowled'].filter(Boolean).join(' · ') || 'Standard', 1],
        ['CAPTAINS', [m.teamAId, m.teamBId].map((id, i) => rosterOf(id).find((p) => p.id === (i === 0 ? m.lineups.a : m.lineups.b).captainId)?.name ?? '—').join(' · '), 2],
        ['SCORER', scorerName || '—', 3], ['VISIBILITY', { public: 'Public live view', link: 'Anyone with the link', private: 'Members only' }[m.visibility], 3],
      ];

  const checklist: [string, boolean][] = isT
    ? [['Name and dates', !invalid[0]], ['Format chosen', true], [`At least ${minTeams} teams`, !invalid[2]], ['Schedule fits the dates', !overrun]]
    : [['Teams and date', !invalid[0]], ['Playing conditions', !invalid[1]], ['Both XIs complete', !invalid[2]], ['Scorer assigned', !invalid[3]]];

  // ---------------------------------------------------------------------------
  if (props.sports.length === 0) {
    return <div className="cw-denied"><h1>No sports yet</h1><p>Run the seed or add a sport in the admin area first.</p></div>;
  }

  const renderStep = () => {
    if (isT && step === 0) return (
      <>
        <Field label="TOURNAMENT NAME"><input className="cw-input cw-input-lg" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="e.g. Winter T20 Cup" maxLength={80} /></Field>
        <div className="cw-block"><Label>SPORT</Label>
          <Pills dot value={t.sportId} onPick={(v) => setT({ ...t, sportId: v, teamIds: [], tiebreak: sports.find((s) => s.id === v)?.key === 'cricket' ? 'NRR' : 'DIFFERENCE' })} options={sports.map((s) => ({ v: s.id, l: s.name.toUpperCase(), dot: sportColor(s.key) }))} /></div>
        <div className="cw-two">
          <Field label="STARTS"><input type="date" className="cw-input" value={t.start} onChange={(e) => setT({ ...t, start: e.target.value })} /></Field>
          <Field label="ENDS"><input type="date" className="cw-input" value={t.end} min={t.start} onChange={(e) => setT({ ...t, end: e.target.value })} /></Field>
        </div>
        <div className="cw-block"><Label>WHO CAN SEE IT</Label>
          <Pills value={t.visibility} onPick={(v) => setT({ ...t, visibility: v })} options={[{ v: 'public' as const, l: 'PUBLIC' }, { v: 'private' as const, l: 'PRIVATE' }]} />
          <p className="cw-muted">{t.visibility === 'private' ? 'Only admins and the managers you add can see this tournament and its matches. Viewers do not see it in any list. Player stats still count its results.' : 'Everyone can see this tournament and its matches.'}</p>
        </div>
        <div className="cw-block"><Label>VENUES · OPTIONAL</Label>
          {venueList.length === 0 && <p className="cw-muted">No venues yet. You can add one below, or skip it and name a venue on each match later.</p>}
          <Pills multi value={t.venueIds} onPick={(v) => setT({ ...t, venueIds: toggleIn(t.venueIds, v) })} options={venueList.map((x) => ({ v: x.id, l: x.name }))} />
          <div className="cw-add"><input className="cw-input" value={newVenue} onChange={(e) => setNewVenue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && makeVenue()} placeholder="Add a new venue" maxLength={80} /><button type="button" className="cw-btn" data-variant="gray" onClick={makeVenue} disabled={!newVenue.trim()}>ADD VENUE</button></div>
        </div>
      </>
    );
    if (isT && step === 1) return (
      <>
        <div className="cw-formats">
          {FIXTURE_TYPES.map((k) => (
            <button key={k} type="button" aria-pressed={t.formatKey === k} data-on={t.formatKey === k ? 'true' : undefined} onClick={() => setT({ ...t, formatKey: k })}><b>{FORMATS[k].label}</b><small>{FORMATS[k].description}</small></button>
          ))}
        </div>
        {tIsCricket && (
          <div className="cw-block"><Label>OVERS PER SIDE</Label>
            <div className="cw-inline">
              <Pills value={t.overs} onPick={(v) => setT({ ...t, overs: v })} options={[{ v: 10, l: 'T10' }, { v: 20, l: 'T20' }, { v: 50, l: '50 OVERS' }]} />
              <Stepper label="overs" value={t.overs} min={1} max={50} onChange={(n) => setT({ ...t, overs: n })} />
            </div>
          </div>
        )}
        <div className="cw-block"><Label>POINTS</Label>
          <div className="cw-points">
            {([['WIN', 'win'], ['TIE', 'tie'], ['NO RESULT', 'noResult']] as const).map(([l, k]) => (
              <div key={k}><span className="lbl">{l}</span><Stepper label={l.toLowerCase()} value={t.points[k]} min={0} max={5} onChange={(n) => setT({ ...t, points: { ...t.points, [k]: n } })} /></div>
            ))}
          </div>
        </div>
        <div className="cw-two">
          {t.formatKey === 'lk' && <div className="cw-block"><Label>QUALIFY FOR KNOCKOUTS</Label><Pills value={t.qualify} onPick={(v) => setT({ ...t, qualify: v })} options={[{ v: 2 as const, l: 'TOP 2' }, { v: 4 as const, l: 'TOP 4' }]} /></div>}
          <div className="cw-block"><Label>TIEBREAK</Label><Pills value={t.tiebreak} onPick={(v) => setT({ ...t, tiebreak: v })} options={(tIsCricket ? ['NRR', 'HEAD TO HEAD', 'WINS'] : ['DIFFERENCE', 'HEAD TO HEAD', 'WINS']).map((v) => ({ v: v as (typeof TIEBREAKS)[number], l: v }))} /></div>
        </div>
      </>
    );
    if (isT && step === 2) return (
      <>
        <div className="cw-row-between">
          <span className="cw-count" data-ok={teamCount >= minTeams ? 'true' : undefined}>{teamCount} TEAMS SELECTED</span>
          {sportTeams.length > 0 && <button type="button" className="cw-link" onClick={() => setT({ ...t, teamIds: teamCount === sportTeams.length ? [] : sportTeams.map((x) => x.id) })}>{teamCount === sportTeams.length ? 'CLEAR ALL' : 'SELECT ALL'}</button>}
        </div>
        {sportTeams.length === 0 && <p className="cw-muted">No {tSport?.name} teams yet. Add the first one below.</p>}
        <div className="cw-teams">
          {sportTeams.map((x) => {
            const on = t.teamIds.includes(x.id);
            return (
              <button key={x.id} type="button" aria-pressed={on} data-on={on ? 'true' : undefined} onClick={() => setT({ ...t, teamIds: toggleIn(t.teamIds, x.id) })}>
                <TeamBadge name={x.name} short={x.shortName} /><span className="cw-tname">{x.name}</span><span className="cw-check">{on ? '✓' : ''}</span>
              </button>
            );
          })}
        </div>
        <div className="cw-add"><input className="cw-input" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && makeTeam()} placeholder="Add a new team" maxLength={60} /><button type="button" className="cw-btn" data-variant="gray" onClick={makeTeam} disabled={!newTeam.trim()}>ADD TEAM</button></div>
      </>
    );
    if (isT && step === 3) return (
      <>
        <div className="cw-two">
          <div className="cw-block"><Label>MATCHES PER DAY</Label><Pills value={t.perDay} onPick={(v) => setT({ ...t, perDay: v })} options={[1, 2, 3, 4].map((v) => ({ v, l: String(v) }))} /></div>
          <Field label="FIRST MATCH STARTS"><input type="time" className="cw-input" value={t.firstTime} onChange={(e) => setT({ ...t, firstTime: e.target.value })} /></Field>
        </div>
        <ToggleRow on={t.rest} onChange={() => setT({ ...t, rest: !t.rest })} title="Rest day between rounds" hint="No team plays on consecutive days" />
        {t.formatKey === 'lk' && teamCount >= 2 && (
          <div className="cw-block">
            <Label>MATCHES EACH TEAM PLAYS IN THE LEAGUE</Label>
            <Pills value={perTeam ?? teamCount - 1} onPick={(v) => setT({ ...t, perTeam: v >= teamCount - 1 ? null : v })} options={perTeamOptions.map((v) => ({ v, l: v === teamCount - 1 ? `${v} · EVERYONE` : String(v) }))} />
            <p className="cw-muted">{perTeam ? `Each team plays ${perTeam} of the other ${teamCount - 1}, so ${leagueGen.length} league matches instead of ${(teamCount * (teamCount - 1)) / 2}.` : `Everyone plays everyone once: ${leagueGen.length} league matches.`}{teamCount % 2 === 1 ? ' With an odd number of teams every team must play an even number of matches.' : ''}</p>
          </div>
        )}
        <div className="cw-kpis">
          {[['LEAGUE MATCHES', String(plan.leagueMatches)], ['KNOCKOUTS', String(plan.knockoutMatches)], ['MATCH DAYS', String(plan.matchDays)], ['LAST MATCH', fmtD(plan.lastMatchDate)]].map(([k, v], i) => (
            <div key={k}><span className="lbl lbl-sm">{k}</span><b data-bad={i === 3 && plan.overrun ? 'true' : undefined}>{v}</b></div>
          ))}
        </div>
        {t.formatKey === 'lk' && <div className="cw-block"><Label>ROUND 1 · YOUR FIXTURES START LIKE THIS</Label>
          <div className="cw-fixtures">
            {round1.length === 0 && <p className="cw-muted">Select teams to preview round one.</p>}
            {round1.map((f, i) => (
              <div key={i}><span>{fmtD(f.date).toUpperCase()} · {fmtT(f.time)}</span><b>{teamById(f.a)?.name}</b><i>VS</i><b>{teamById(f.b)?.name}</b></div>
            ))}
          </div>
          <p className="cw-muted">These are the first pairings of the fixtures made when you publish. They are made again if you change the teams or settings before the tournament starts.</p>
        </div>}
      </>
    );

    // ---- match mode
    if (!isT && step === 0) return (
      <>
        {!props.lockedTournament && (
          <div className="cw-block"><Label>PART OF</Label>
            <Pills value={m.tournamentId ?? 'friendly'} onPick={(v) => chooseTournament(v === 'friendly' ? null : String(v))} options={[{ v: 'friendly', l: 'Friendly' }, ...cricketTournaments.map((x) => ({ v: x.id, l: x.name }))]} /></div>
        )}
        <div className="cw-two">
          {([['HOME · BATS FIRST IF TOSS IS SKIPPED', 'a'], ['AWAY', 'b']] as const).map(([label, side]) => {
            const chosen = side === 'a' ? m.teamAId : m.teamBId, other = side === 'a' ? m.teamBId : m.teamAId;
            return (
              <div key={side} className="cw-side">
                <Label>{label}</Label>
                {matchTeams.length === 0 && <p className="cw-muted">No teams available.</p>}
                <div className="cw-sidelist">
                  {matchTeams.map((x) => (
                    <button key={x.id} type="button" disabled={other === x.id} aria-pressed={chosen === x.id} data-on={chosen === x.id ? 'true' : undefined} onClick={() => pickTeam(side, x.id)}>
                      <TeamBadge name={x.name} short={x.shortName} size={26} /><span className="cw-sname">{x.name}</span><small>{chosen === x.id ? 'SELECTED' : other === x.id ? (side === 'a' ? 'AWAY' : 'HOME') : ''}</small>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {!tournament && <div className="cw-add"><input className="cw-input" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && makeTeam()} placeholder="Add a new cricket team" maxLength={60} /><button type="button" className="cw-btn" data-variant="gray" onClick={makeTeam} disabled={!newTeam.trim()}>ADD TEAM</button></div>}
        <div className="cw-block"><Label>VENUE</Label>
          <Pills value={m.venueId} onPick={(v) => setM({ ...m, venueId: m.venueId === v ? '' : String(v) })} options={venueList.map((x) => ({ v: x.id, l: x.name }))} />
          <div className="cw-add"><input className="cw-input" value={newVenue} onChange={(e) => setNewVenue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && makeVenue()} placeholder="Add a new venue" maxLength={80} /><button type="button" className="cw-btn" data-variant="gray" onClick={makeVenue} disabled={!newVenue.trim()}>ADD VENUE</button></div>
        </div>
        <div className="cw-two">
          <Field label="DATE"><input type="date" className="cw-input" value={m.date} onChange={(e) => setM({ ...m, date: e.target.value })} /></Field>
          <Field label="START TIME"><input type="time" className="cw-input" value={m.time} onChange={(e) => setM({ ...m, time: e.target.value })} /></Field>
        </div>
      </>
    );
    if (!isT && step === 1) return (
      <>
        <div className="cw-block"><Label>OVERS PER SIDE</Label>
          <div className="cw-inline">
            <Pills value={m.rules.overs} onPick={(v) => setM({ ...m, rules: { ...m.rules, overs: v, powerplay: Math.min(m.rules.powerplay, Math.max(1, Math.floor(v * 0.3))) } })} options={[5, 10, 20, 50].map((v) => ({ v, l: String(v) }))} />
            <Stepper label="overs" value={m.rules.overs} min={1} max={50} onChange={(n) => setM({ ...m, rules: { ...m.rules, overs: n, powerplay: Math.min(m.rules.powerplay, n) } })} />
          </div>
          <p className="cw-muted">Each bowler can bowl up to {Math.ceil(m.rules.overs / 5)} overs. The console enforces this.</p>
        </div>
        <div className="cw-two">
          <div className="cw-block"><Label>POWERPLAY OVERS</Label><Stepper label="powerplay overs" value={m.rules.powerplay} min={0} max={m.rules.overs} onChange={(n) => setM({ ...m, rules: { ...m.rules, powerplay: n } })} /></div>
          <div className="cw-block"><Label>PLAYERS PER SIDE</Label><Stepper label="players per side" value={m.rules.playersPerSide} min={2} max={15} onChange={setPlayersPerSide} /></div>
        </div>
        <div className="cw-stack">
          <ToggleRow on={m.rules.freeHit} onChange={() => setM({ ...m, rules: { ...m.rules, freeHit: !m.rules.freeHit } })} title="Free hit after a no ball" hint="The next delivery can only be out by run out. Enforced by the scorer console." />
          <ToggleRow on={m.rules.wideReball} onChange={() => setM({ ...m, rules: { ...m.rules, wideReball: !m.rules.wideReball } })} title="Wides and no balls re-bowled" hint="Saved with the match. The console always re-bowls them for now." />
          <ToggleRow on={m.rules.superOver} onChange={() => setM({ ...m, rules: { ...m.rules, superOver: !m.rules.superOver } })} title="Super over on a tie" hint="Saved with the match. Super overs are not scored by the console yet." />
          <ToggleRow on={m.rules.dls} onChange={() => setM({ ...m, rules: { ...m.rules, dls: !m.rules.dls } })} title="DLS par scores" hint="Saved with the match. Revised targets are not calculated yet." />
        </div>
      </>
    );
    if (!isT && step === 2) return (
      <div className="cw-two cw-xis">
        {(['a', 'b'] as const).map((side) => {
          const teamId = side === 'a' ? m.teamAId : m.teamBId;
          const lineup = m.lineups[side];
          const roster = rosterOf(teamId);
          const n = m.rules.playersPerSide;
          return (
            <div key={side} className="cw-xi">
              <div className="cw-xi-head">
                <b>{teamById(teamId)?.name ?? 'Pick a team'}</b>
                <span className="cw-count" data-ok={lineup.playerIds.length === n ? 'true' : undefined}>{lineup.playerIds.length} / {n}</span>
              </div>
              {roster.length === 0 ? (
                <p className="cw-muted">This team has no players. <Link href={`/teams/${teamId}`} target="_blank" className="cw-link">Add players ↗</Link></p>
              ) : (
                <>
                  <button type="button" className="cw-link cw-auto" onClick={() => autoPick(side, teamId)}>AUTO-PICK FIRST {n}</button>
                  {roster.map((p) => {
                    const on = lineup.playerIds.includes(p.id), full = !on && lineup.playerIds.length >= n;
                    return (
                      <div key={p.id} className="cw-player" data-on={on ? 'true' : undefined}>
                        <button type="button" disabled={full} aria-pressed={on} onClick={() => togglePlayer(side, p.id)}>
                          <span className="cw-check cw-check-sm">{on ? '✓' : ''}</span><span className="cw-tname">{p.name}</span>{p.role && <small>{p.role}</small>}
                        </button>
                        {on && (
                          <>
                            <button type="button" className="cw-tag" data-on={lineup.captainId === p.id ? 'true' : undefined} aria-label={`Make ${p.name} captain`} aria-pressed={lineup.captainId === p.id} onClick={() => setLineup(side, (l) => ({ ...l, captainId: p.id }))}>C</button>
                            <button type="button" className="cw-tag cw-tag-wk" data-on={lineup.keeperId === p.id ? 'true' : undefined} aria-label={`Make ${p.name} wicketkeeper`} aria-pressed={lineup.keeperId === p.id} onClick={() => setLineup(side, (l) => ({ ...l, keeperId: l.keeperId === p.id ? null : p.id }))}>WK</button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          );
        })}
      </div>
    );
    if (!isT && step === 3) return (
      <>
        <div className="cw-block"><Label>SCORER · OPENS THE CONSOLE ON MATCH DAY</Label>
          {props.scorers.length === 0 && <p className="cw-muted">No scorer accounts yet.</p>}
          <div className="cw-scorers">
            {props.scorers.map((s) => (
              <button key={s.id} type="button" aria-pressed={m.scorerId === s.id} data-on={m.scorerId === s.id ? 'true' : undefined} onClick={() => setM({ ...m, scorerId: s.id })}>
                <Avatar name={s.name} size={32} /><span><b>{s.name}</b><small>{s.role.toUpperCase()}</small></span>
              </button>
            ))}
          </div>
        </div>
        <div className="cw-two">
          <Field label="UMPIRE 1 · OPTIONAL"><input className="cw-input" value={m.ump1} onChange={(e) => setM({ ...m, ump1: e.target.value })} placeholder="Name" maxLength={60} /></Field>
          <Field label="UMPIRE 2 · OPTIONAL"><input className="cw-input" value={m.ump2} onChange={(e) => setM({ ...m, ump2: e.target.value })} placeholder="Name" maxLength={60} /></Field>
        </div>
        <div className="cw-block"><Label>WHO CAN WATCH LIVE</Label>
          <div className="cw-stack">
            {VISIBILITIES.map((v) => (
              <button key={v} type="button" role="radio" aria-checked={m.visibility === v} className="cw-row" data-on={m.visibility === v ? 'true' : undefined} onClick={() => setM({ ...m, visibility: v })}>
                <span className="cw-radio" data-on={m.visibility === v ? 'true' : undefined} />
                <span><b>{{ public: 'Public', link: 'Anyone with the link', private: 'Members only' }[v]}</b><small>{{ public: 'Listed on the matches page for everyone', link: 'Not listed, shareable link only', private: 'Visible to signed-in members only' }[v]}</small></span>
              </button>
            ))}
          </div>
        </div>
      </>
    );

    // ---- review (both)
    return (
      <div className="cw-review">
        {review.map(([k, v, st]) => (
          <div key={k}><span className="lbl">{k}</span><span>{v}</span><button type="button" className="cw-link" onClick={() => go(st)}>EDIT</button></div>
        ))}
      </div>
    );
  };

  const stepsDone = (i: number) => i < step || (i <= visited && !invalid[i] && i !== step);
  const aTeam = teamById(m.teamAId), bTeam = teamById(m.teamBId);

  return (
    <>
      <div className="mx-head">
        <div>
          <span className="lbl">{props.lockedTournament ? props.lockedTournament.name.toUpperCase() : 'ORGANISER'}</span>
          <h1>{isT ? 'New tournament' : 'New cricket match'}</h1>
        </div>
      </div>

      <div className="cw-layout">
        <nav className="cw-steps" aria-label="Steps">
          {steps.map(([l, sub], i) => {
            const reach = i <= visited, ok = stepsDone(i);
            return (
              <button key={l} type="button" disabled={!reach || !!done} aria-current={i === step ? 'step' : undefined} data-on={i === step ? 'true' : undefined} onClick={() => go(i)}>
                <span className="cw-n" data-ok={ok && i !== step ? 'true' : undefined}>{ok && i !== step ? '✓' : i + 1}</span>
                <span><b>{l}</b><small>{sub}</small></span>
              </button>
            );
          })}
        </nav>

        <div className="cw-main">
          {!done ? (
            <section className="cw-card">
              <div className="cw-head">
                <span className="lbl" style={{ color: 'var(--amber)' }}>STEP {step + 1} OF 5</span>
                <h2>{titles[step]![0]}</h2>
                <p>{titles[step]![1]}</p>
              </div>
              <div className="cw-body">{renderStep()}</div>
              <div className="cw-foot">
                <span className="cw-hint" data-tone={err ? 'warn' : overrun && step === 3 ? 'bad' : undefined} role="status">
                  {err || (last ? 'Everything looks ready.' : overrun && step === 3 ? `Schedule runs past ${fmtD(t.end)}. Add matches per day or extend the end date.` : '')}
                </span>
                <div className="cw-nav">
                  <Link href={props.lockedTournament ? `/tournaments/${props.lockedTournament.id}` : isT ? '/tournaments' : '/matches'} className="cw-btn" data-variant="gray" aria-label="Cancel and leave without saving">CANCEL</Link>
                  {step > 0 && <button type="button" className="cw-btn" data-variant="gray" onClick={() => go(step - 1)}>BACK</button>}
                  <button type="button" className="cw-btn" data-variant={err ? 'off' : last ? 'amber' : 'blue'} disabled={!!err || submitting} onClick={last ? submit : () => go(step + 1)}>
                    {submitting ? 'SAVING…' : last ? (isT ? 'PUBLISH TOURNAMENT' : 'CREATE MATCH') : 'CONTINUE'}
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <section className="cw-card cw-done" role="status">
              <span className="cw-done-dot"><i /></span>
              <h2>{done.kind === 'tournament' ? `${done.name} is published` : 'Match created'}</h2>
              <p>
                {done.kind === 'tournament'
                  ? (done.table ? `${done.teams} teams are entered. Your ${done.plan.totalMatches} fixtures are made: every team plays every other team once, then the knockouts. They are made again if you change the teams or settings before the tournament starts.` : `${done.teams} teams are entered. Open the Fixtures tab to build or paste your fixtures; nothing is created until you do.`)
                  : `${done.title} is scheduled for ${done.when}. The assigned scorer can open the console from the match card.`}
              </p>
              <div className="cw-done-actions">
                {done.kind === 'tournament' ? (
                  <>
                    <Link href={`/tournaments/${done.id}`} className="cw-btn" data-variant="blue">VIEW TOURNAMENT</Link>
                    <Link href={newMatchHref(done.id)} className="cw-btn" data-variant="gray">CREATE A MATCH</Link>
                  </>
                ) : (
                  <>
                    <Link href={done.tournamentId ? `/tournaments/${done.tournamentId}/matches/${done.id}` : `/sports/cricket/matches/${done.id}`} className="cw-btn" data-variant="blue">VIEW MATCH</Link>
                    <Link href={scoreHref({ id: done.id, sportKey: 'cricket', tournamentId: done.kind === 'match' ? done.tournamentId : null })} className="cw-btn" data-variant="amber">OPEN SCORER</Link>
                    {props.lockedTournament && <Link href={`/tournaments/${props.lockedTournament.id}`} className="cw-btn" data-variant="gray">BACK TO TOURNAMENT</Link>}
                    <button type="button" className="cw-btn" data-variant="gray" onClick={() => { setDone(null); setStep(0); setVisited(0); setM((x) => ({ ...x, teamAId: '', teamBId: '', lineups: { a: emptyLineup(), b: emptyLineup() } })); }}>CREATE ANOTHER</button>
                  </>
                )}
              </div>
            </section>
          )}
        </div>

        <aside className="cw-aside" aria-label="Preview">
          <span className="lbl">PREVIEW · HOW IT WILL APPEAR</span>
          {isT ? (
            <div className="cw-preview">
              <div className="cw-row-between">
                <span className="cw-sportline"><span className="mx-group-icon" style={{ background: `color-mix(in srgb, ${sportColor(tSport?.key ?? '')} 16%, transparent)` }}><i style={{ background: sportColor(tSport?.key ?? '') }} /></span><span className="lbl">{(tSport?.name ?? '').toUpperCase()}</span></span>
                <span className="mx-badge" data-tone="up"><i />UPCOMING</span>
              </div>
              <div><b className="cw-pv-name">{t.name || 'Untitled tournament'}</b><small>{FORMATS[t.formatKey].label} · {teamCount} teams</small></div>
              <div><div className="cw-row-between lbl"><span>{fmtD(t.start).toUpperCase()} – {fmtD(t.end).toUpperCase()}</span><span>{plan.totalMatches} MATCHES</span></div><div className="cw-bar" /></div>
            </div>
          ) : (
            <div className="cw-preview">
              <div className="cw-row-between"><span className="lbl">{(tournament?.name ?? 'Friendly').toUpperCase()} · {m.rules.overs} OVERS</span><span className="mx-badge" data-tone="up"><i />UPCOMING</span></div>
              {[aTeam, bTeam].map((x, i) => (
                <span key={i} className="cw-pvteam">{x ? <TeamBadge name={x.name} short={x.shortName} size={30} /> : <span className="cw-code cw-code-empty" />}<b>{x?.name ?? (i === 0 ? 'Home team' : 'Away team')}</b></span>
              ))}
              <div className="cw-pvline">{fmtD(m.date)} · {fmtT(m.time)}</div>
              <div className="cw-row-between cw-muted"><span>{venueName(m.venueId) || 'Venue to be confirmed'}</span><span className="lbl">{m.rules.overs} OVERS</span></div>
            </div>
          )}
          <div className="cw-preview">
            <span className="lbl">READY TO PUBLISH</span>
            {checklist.map(([l, ok]) => <div key={l} className="cw-check-row" data-ok={ok ? 'true' : undefined}><i />{l}</div>)}
          </div>
        </aside>
      </div>
    </>
  );
}
