'use client';
import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateMatchSchedule, updatePendingFixture } from '@/app/schedule-actions';
import '@/components/teams/team-manage.css';

type Value = { date: string; time: string; venue: string };
const pad = (n: number) => String(n).padStart(2, '0');
/** An instant as the viewer's own date and time, which is how the organiser picked it. */
export const localParts = (iso: string | null): { date: string; time: string } => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` } : { date: '', time: '18:00' };
};

function Dialog({ title, initial, venues, save, onClose }: { title: string; initial: Value; venues: string[]; save: (v: Value & { tzOffset: number }) => Promise<{ error?: string }>; onClose: () => void }) {
  const listId = useId();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = v.date !== initial.date || v.time !== initial.time || v.venue.trim() !== initial.venue.trim();
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await save({ ...v, tzOffset: new Date().getTimezoneOffset() });
      if (r.error) setError(r.error); else onClose();
    } catch { setError('Something went wrong. Try again.'); } finally { setBusy(false); }
  };
  return (
    <div className="tm-modal" onClick={onClose}>
      <form className="tm-dialog" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (dirty && v.date && v.time) void submit(); }}>
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
        <p>Pick a venue from the list or type a new one. A team can’t be given two matches at the same time.</p>
        {error && <p role="alert" style={{ color: 'var(--red-text)' }}>{error}</p>}
        <div className="tm-acts">
          <button type="button" className="tm-btn" onClick={onClose}>CANCEL</button>
          <button type="submit" className="tm-btn" data-v="amber" disabled={!dirty || !v.date || !v.time || busy}>{busy ? 'SAVING…' : 'SAVE'}</button>
        </div>
      </form>
    </div>
  );
}

/** Admin's EDIT on a match that has not started: change its time and venue. */
export function EditMatchSchedule({ matchId, scheduledAt, venue, venues, label = 'EDIT TIME & VENUE', small }: { matchId: string; scheduledAt: string | null; venue: string | null; venues: string[]; label?: string; small?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={small ? 'mx-btn' : 'mx-btn mx-btn-lg'} data-variant="gray" onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <Dialog
          title="Edit time and venue" venues={venues} onClose={() => setOpen(false)}
          initial={{ ...localParts(scheduledAt), venue: venue ?? '' }}
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
