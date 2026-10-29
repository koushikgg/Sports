'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FIXTURE_TYPES, FORMATS, fitMatchesPerTeam, matchesPerTeamOptions, minTeamsFor, type FormatKey, type TournamentMeta } from '@sports/shared';
import { addVenue } from '@/app/create/actions';
import { updateTournament } from '@/app/tournaments/[id]/actions';
import '@/components/teams/team-manage.css';

type Tie = TournamentMeta['tiebreak'];
const pill = (on: boolean, off?: boolean): React.CSSProperties => ({ background: on ? '#f4f5f7' : undefined, color: on ? '#0d0e11' : undefined, opacity: off ? 0.45 : 1 });
const box: React.CSSProperties = { display: 'grid', gap: 6 };
const row: React.CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap' };

/** Admin's editor for a saved tournament's settings. Format, qualifiers, overs and the daily schedule lock once play starts. */
export function EditTournament({ id, name, meta, cricket, venues: allVenues, started, fixtureCount, teamCount }: {
  id: string; name: string; meta: TournamentMeta; cricket: boolean; venues: { id: string; name: string }[]; started: boolean; fixtureCount: number; teamCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const init = () => ({
    name, startDate: meta.schedule.startDate, endDate: meta.schedule.endDate, venueIds: meta.venues.map((v) => v.id).filter((vid) => allVenues.some((v) => v.id === vid)), formatKey: meta.formatKey as FormatKey,
    perTeam: fitMatchesPerTeam(teamCount, meta.matchesPerTeam) ?? Math.max(1, teamCount - 1), overs: meta.overs ?? 20, points: { ...meta.points }, qualify: meta.qualify as 2 | 4, tiebreak: meta.tiebreak as Tie,
    perDay: meta.schedule.perDay, firstMatchTime: meta.schedule.firstMatchTime, restDay: meta.schedule.restDay,
  });
  const [f, setF] = useState(init);
  const [venues, setVenues] = useState(allVenues);
  const [newVenue, setNewVenue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const set = <K extends keyof ReturnType<typeof init>>(k: K, v: ReturnType<typeof init>[K]) => setF((x) => ({ ...x, [k]: v }));
  const table = f.formatKey === 'lk';
  const formatChanged = f.formatKey !== meta.formatKey;
  const clears = formatChanged && !started && fixtureCount > 0 && !table;
  const need = minTeamsFor(f.formatKey, f.qualify);
  const tooFew = (formatChanged || f.qualify !== meta.qualify) && teamCount < need;
  // a Table makes its fixtures again when the things they depend on change; a Custom list is cleared when the type changes
  const perTeamOptions = matchesPerTeamOptions(teamCount);
  const wantPerTeam = f.perTeam >= teamCount - 1 ? undefined : fitMatchesPerTeam(teamCount, f.perTeam);
  const scheduleTouched = wantPerTeam !== fitMatchesPerTeam(teamCount, meta.matchesPerTeam) || f.startDate !== meta.schedule.startDate || f.perDay !== meta.schedule.perDay || f.firstMatchTime !== meta.schedule.firstMatchTime || f.restDay !== meta.schedule.restDay || f.qualify !== meta.qualify || (cricket && f.overs !== (meta.overs ?? 20)) || f.venueIds.join() !== meta.venues.map((v) => v.id).join();
  const remakes = !started && fixtureCount > 0 && table && (formatChanged || scheduleTouched);
  const types: FormatKey[] = FIXTURE_TYPES.includes(meta.formatKey as 'lk' | 'custom') ? [...FIXTURE_TYPES] : [meta.formatKey, ...FIXTURE_TYPES];
  const ties: Tie[] = cricket ? ['NRR', 'HEAD TO HEAD', 'WINS'] : ['DIFFERENCE', 'HEAD TO HEAD', 'WINS'];
  const showQualify = f.formatKey === 'lk' || f.formatKey === 'groups';

  const addNewVenue = async () => {
    const n = newVenue.trim(); if (!n) return;
    const r = await addVenue(n);
    if (!r.ok) return setError(r.error);
    setVenues((x) => (x.some((v) => v.id === r.venue.id) ? x : [...x, r.venue]));
    set('venueIds', f.venueIds.includes(r.venue.id) ? f.venueIds : [...f.venueIds, r.venue.id]);
    setNewVenue('');
  };

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const r = await updateTournament({
        tournamentId: id, name: f.name, startDate: f.startDate, endDate: f.endDate, venueIds: f.venueIds, formatKey: f.formatKey, ...(cricket ? { overs: f.overs } : {}),
        points: f.points, qualify: f.qualify, ...(table && wantPerTeam ? { matchesPerTeam: wantPerTeam } : {}), tiebreak: f.tiebreak, schedule: { perDay: f.perDay, firstMatchTime: f.firstMatchTime, restDay: f.restDay }, tzOffset: new Date().getTimezoneOffset(),
      });
      if (r.error) { setError(r.error); return; }
      setOpen(false);
      setToast(r.regenerated ? 'Saved. Fixtures made again.' : r.cleared ? `Saved. ${r.cleared} fixture${r.cleared === 1 ? '' : 's'} removed, create them again.` : 'Tournament saved.');
      setTimeout(() => setToast(null), 3000);
      router.refresh();
    } catch { setError('Something went wrong. Try again.'); } finally { setBusy(false); }
  };

  return (
    <>
      <button type="button" className="mx-btn mx-btn-lg" data-variant="gray" onClick={() => { setF(init()); setVenues(allVenues); setError(null); setOpen(true); }}>EDIT TOURNAMENT</button>
      {toast && <div className="tm-toast" role="status" style={{ opacity: 1, transform: 'translate(-50%, 0)' }}><div><i />{toast}</div></div>}
      {open && (
        <div className="tm-modal" onClick={() => setOpen(false)}>
          <form className="tm-dialog" role="dialog" aria-label="Edit tournament" style={{ maxWidth: 600, maxHeight: '92vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <h2>Edit tournament</h2>
            {started && <p>The tournament has started, so the fixture type, how many play on, the matches per team, the overs and the daily schedule are locked. Everything else can still change.</p>}

            <label><span className="lbl">NAME</span><input value={f.name} maxLength={80} onChange={(e) => set('name', e.target.value)} /></label>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
              <label><span className="lbl">STARTS</span><input type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} /></label>
              <label><span className="lbl">ENDS</span><input type="date" value={f.endDate} onChange={(e) => set('endDate', e.target.value)} /></label>
            </div>

            <div style={box}>
              <span className="lbl">VENUES</span>
              <div style={row}>
                {venues.map((v) => { const on = f.venueIds.includes(v.id); return <button key={v.id} type="button" aria-pressed={on} className="tm-btn" style={pill(on)} onClick={() => set('venueIds', on ? f.venueIds.filter((x) => x !== v.id) : [...f.venueIds, v.id])}>{v.name.toUpperCase()}</button>; })}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ flex: 1 }} value={newVenue} maxLength={80} placeholder="Add a new venue" aria-label="New venue" onChange={(e) => setNewVenue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addNewVenue(); } }} />
                <button type="button" className="tm-btn" disabled={!newVenue.trim()} onClick={addNewVenue}>ADD VENUE</button>
              </div>
            </div>

            <div style={box}>
              <span className="lbl">FIXTURE TYPE</span>
              <div style={row}>
                {types.map((k) => <button key={k} type="button" aria-pressed={f.formatKey === k} disabled={started} className="tm-btn" style={pill(f.formatKey === k, started && f.formatKey !== k)} onClick={() => set('formatKey', k)}>{FORMATS[k].label.toUpperCase()}</button>)}
              </div>
              {!started && table && <p>{FORMATS.lk.description}</p>}
              {!started && !table && <p>{FORMATS.custom.description}</p>}
              {clears && <p style={{ color: 'var(--amber)' }}>Changing the type removes the {fixtureCount} fixture{fixtureCount === 1 ? '' : 's'} made for {FORMATS[meta.formatKey].label}. You will paste a new list from the Fixtures tab.</p>}
              {remakes && <p style={{ color: 'var(--amber)' }}>Saving makes the fixtures again, replacing the {fixtureCount} you have now{formatChanged ? ' (including any you pasted in)' : ''}. Nothing has been played yet.</p>}
              {tooFew && <p style={{ color: 'var(--red-text)' }}>{FORMATS[f.formatKey].label} needs at least {minTeamsFor(f.formatKey)} teams and this tournament has {teamCount}.</p>}
            </div>

            {table && teamCount >= 2 && (
              <div style={box}>
                <span className="lbl">MATCHES EACH TEAM PLAYS IN THE LEAGUE</span>
                <div style={row}>{perTeamOptions.map((n) => { const on = (wantPerTeam ?? teamCount - 1) === n; return <button key={n} type="button" aria-pressed={on} disabled={started} className="tm-btn" style={pill(on, started && !on)} onClick={() => set('perTeam', n)}>{n === teamCount - 1 ? `${n} · EVERYONE` : n}</button>; })}</div>
                <p>{wantPerTeam ? `Each team plays ${wantPerTeam} of the other ${teamCount - 1}: ${(teamCount * wantPerTeam) / 2} league matches instead of ${(teamCount * (teamCount - 1)) / 2}.` : `Everyone plays everyone once: ${(teamCount * (teamCount - 1)) / 2} league matches.`}{teamCount % 2 === 1 ? ' With an odd number of teams every team must play an even number.' : ''}</p>
              </div>
            )}

            {showQualify && (
              <div style={box}>
                <span className="lbl">TEAMS THAT PLAY ON · TOP 4 PLAY SEMI-FINALS THEN THE FINAL, TOP 2 PLAY THE FINAL</span>
                <div style={row}>{([2, 4] as const).map((n) => <button key={n} type="button" aria-pressed={f.qualify === n} disabled={started} className="tm-btn" style={pill(f.qualify === n, started && f.qualify !== n)} onClick={() => set('qualify', n)}>TOP {n}</button>)}</div>
              </div>
            )}

            <div style={box}>
              <span className="lbl">POINTS</span>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {([['win', 'WIN'], ['tie', 'TIE'], ['noResult', 'NO RESULT']] as const).map(([k, l]) => (
                  <label key={k}><span className="lbl">{l}</span><input type="number" min={0} max={5} value={f.points[k]} onChange={(e) => set('points', { ...f.points, [k]: Math.max(0, Math.min(5, Math.trunc(Number(e.target.value) || 0))) })} /></label>
                ))}
              </div>
            </div>
            <div style={box}>
              <span className="lbl">TIEBREAK</span>
              <div style={row}>{ties.map((t) => <button key={t} type="button" aria-pressed={f.tiebreak === t} className="tm-btn" style={pill(f.tiebreak === t)} onClick={() => set('tiebreak', t)}>{t}</button>)}</div>
            </div>

            {cricket && (
              <label><span className="lbl">OVERS PER MATCH{started ? '' : fixtureCount > 0 ? (table ? ' · FIXTURES ARE MADE AGAIN' : ' · UPDATES THE SCHEDULED MATCHES') : ''}</span><input type="number" min={1} max={50} disabled={started} value={f.overs} onChange={(e) => set('overs', Math.max(1, Math.min(50, Math.trunc(Number(e.target.value) || 1))))} /></label>
            )}

            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
              <label><span className="lbl">MATCHES PER DAY</span><input type="number" min={1} max={4} disabled={started} value={f.perDay} onChange={(e) => set('perDay', Math.max(1, Math.min(4, Math.trunc(Number(e.target.value) || 1))))} /></label>
              <label><span className="lbl">FIRST MATCH AT</span><input type="time" disabled={started} value={f.firstMatchTime} onChange={(e) => set('firstMatchTime', e.target.value)} /></label>
            </div>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" disabled={started} checked={f.restDay} onChange={(e) => set('restDay', e.target.checked)} style={{ width: 20, height: 20, padding: 0 }} /><span style={{ fontSize: 14 }}>Rest day between rounds</span>
            </label>
            <p>These settings drive the standings and the planned match count. Fixtures keep their own dates, so changing the dates or venues here does not move them.</p>

            {error && <p role="alert" style={{ color: 'var(--red-text)' }}>{error}</p>}
            <div className="tm-acts">
              <button type="button" className="tm-btn" onClick={() => setOpen(false)}>CANCEL</button>
              <button type="submit" className="tm-btn" data-v={clears || remakes ? 'danger' : 'amber'} disabled={busy || !f.name.trim() || f.venueIds.length === 0 || tooFew}>{busy ? 'SAVING…' : clears ? 'SAVE + REMOVE FIXTURES' : remakes ? 'SAVE + MAKE FIXTURES AGAIN' : 'SAVE'}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
