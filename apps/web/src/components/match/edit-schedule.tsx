'use client';
import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateMatchSchedule, updatePendingFixture } from '@/app/schedule-actions';
import '@/components/teams/team-manage.css';
import { toast } from '@/components/ratch/toast';

type Value = { date: string; time: string; venue: string; overs?: number };
const pad = (n: number) => String(n).padStart(2, '0');
/** An instant as the viewer's own date and time, which is how the organiser picked it. */
export const localParts = (iso: string | null): { date: string; time: string } => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` } : { date: '', time: '18:00' };
};

function Dialog({ title, initial, venues, save, onClose, withOvers }: { title: string; initial: Value; withOvers?: boolean; venues: string[]; save: (v: Value & { tzOffset: number }) => Promise<{ error?: string }>; onClose: () => void }) {
  const listId = useId();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const setError = (m: string | null) => { if (m) toast.error(m); };
  const oversOk = !withOvers || (Number.isInteger(v.overs) && v.overs! >= 1 && v.overs! <= 50);
  const dirty = v.date !== initial.date || v.time !== initial.time || v.venue.trim() !== initial.venue.trim() || (withOvers && v.overs !== initial.overs);
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await save({ ...v, tzOffset: new Date().getTimezoneOffset() });
      if (r.error) setError(r.error); else onClose();
    } catch { setError('Something went wrong. Try again.'); } finally { setBusy(false); }
  };
  return (
    <div className="tm-modal" onClick={onClose}>
      <form className="tm-dialog" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (dirty && v.date && v.time && oversOk) void submit(); }}>
        <h2>{title}</h2>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <label><span className="lbl">DATE</span><input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></label>
          <label><span className="lbl">TIME</span><input type="time" value={v.time} onChange={(e) => setV({ ...v, time: e.target.value })} /></label>
        </div>
        <label>
          <span className="lbl">VENUE</span>
          <input list={listId} value={v.venue} maxLength={80} placeholder="Where it is played" onChange={(e) => setV({ ...v, venue: e.target.value })} />
          <datalist id={listId}>{venues.map((x) => <option key={x} value={x} />)}</datalist>
        </label>
        {withOvers && (
          <label>
            <span className="lbl">OVERS PER INNINGS</span>
            <input type="number" inputMode="numeric" min={1} max={50} step={1} value={v.overs ?? ''} onChange={(e) => setV({ ...v, overs: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </label>
        )}
        <p>Pick a venue from the list or type a new one. A team can’t be given two matches at the same time.{withOvers ? ' Overs (1 to 50) apply to this match only and can be changed until its first ball.' : ''}</p>
        <div className="tm-acts">
          <button type="button" className="tm-btn" onClick={onClose}>CANCEL</button>
          <button type="submit" className="tm-btn" data-v="amber" disabled={!dirty || !v.date || !v.time || !oversOk || busy}>{busy ? 'SAVING…' : 'SAVE'}</button>
        </div>
      </form>
    </div>
  );
}

/** Admin's EDIT on a match that has not started: change its time and venue. */
export function EditMatchSchedule({ matchId, scheduledAt, venue, venues, overs, label = 'EDIT MATCH', small }: { matchId: string; scheduledAt: string | null; venue: string | null; venues: string[]; overs?: number | null; label?: string; small?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={small ? 'mx-btn' : 'mx-btn mx-btn-lg'} data-variant="gray" onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <Dialog
          title="Edit match" venues={venues} onClose={() => setOpen(false)} withOvers={overs != null}
          initial={{ ...localParts(scheduledAt), venue: venue ?? '', ...(overs != null ? { overs } : {}) }}
          save={async (v) => { const r = await updateMatchSchedule({ matchId, ...v }); if (!r.error) router.refresh(); return r; }}
        />
      )}
    </>
  );
}

/** The same for a fixture that is not a match yet (a knockout waiting on results). `date` and `time` are as they were entered. */
export function EditPendingFixture({ tournamentId, no, date, time, venue, venues, label = 'EDIT', small }: { tournamentId: string; no: number; date: string; time: string; venue: string | null; venues: string[]; label?: string; small?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={small ? 'mx-btn' : 'mx-btn mx-btn-lg'} data-variant="gray" onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <Dialog
          title={`Edit Match ${no}`} venues={venues} onClose={() => setOpen(false)}
          initial={{ date, time, venue: venue ?? '' }}
          save={async (v) => { const r = await updatePendingFixture({ tournamentId, no, ...v }); if (!r.error) router.refresh(); return r; }}
        />
      )}
    </>
  );
}
