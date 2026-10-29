'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addTournamentManager, removeTournamentManager } from '@/app/tournaments/[id]/manager-actions';
import { Avatar } from '@/components/ratch/avatar';
import '@/components/teams/team-manage.css';
import { toast } from '@/components/ratch/toast';

interface Hit { id: string; name: string; sub: string }

/** Who runs the tournament's matches. Everyone sees the list; only admins add or remove managers. */
export function ManagersTab({ tournamentId, managers: serverManagers, isAdmin }: { tournamentId: string; managers: { id: string; name: string }[]; isAdmin: boolean }) {
  const router = useRouter();
  const [managers, setManagers] = useState(serverManagers);
  useEffect(() => setManagers(serverManagers), [serverManagers]);
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);
  const setProblem = (m: string | null) => { if (m) toast.error(m); };
  const term = q.trim();

  useEffect(() => {
    if (!isAdmin || term.length < 2) { setHits(null); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/tournaments/${tournamentId}/manager-search?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { hits: [] }))
        .then((d: { hits: Hit[] }) => setHits(d.hits.filter((h) => !managers.some((m) => m.id === h.id))))
        .catch(() => {});
    }, 200);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [term, tournamentId, isAdmin, managers]);

  const say = (t: string) => toast.success(t);
  const add = async (h: Hit) => {
    setBusy(true); setQ(''); setHits(null);
    try {
      const r = await addTournamentManager({ tournamentId, userId: h.id });
      if (r.error) { setProblem(r.error); return; }
      setManagers((x) => (x.some((m) => m.id === h.id) ? x : [...x, { id: h.id, name: h.name }])); say(`${h.name} is now a manager`); router.refresh();
    } catch { setProblem('Something went wrong. Try again.'); } finally { setBusy(false); }
  };
  const remove = async (m: { id: string; name: string }) => {
    setBusy(true);
    try {
      const r = await removeTournamentManager({ tournamentId, userId: m.id });
      if (r.error) { setProblem(r.error); return; }
      setManagers((x) => x.filter((y) => y.id !== m.id)); say(`${m.name} removed`); router.refresh();
    } catch { setProblem('Something went wrong. Try again.'); } finally { setBusy(false); }
  };

  return (
    <div className="tm" style={{ gap: 16 }}>
      {isAdmin && (
        <div className="tm-panel" style={{ zIndex: 5 }}>
          <div className="tm-search">
            <div className="tm-field">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input type="search" autoComplete="off" value={q} placeholder="Add a manager — search by name or email" aria-label="Add a manager" onChange={(e) => setQ(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} />
            </div>
            {focus && term.length >= 2 && hits !== null && (
              <div className="tm-pop" role="listbox" aria-label="People">
                {hits.map((h) => (
                  <button key={h.id} type="button" role="option" aria-selected={false} className="tm-hit" disabled={busy} onMouseDown={(e) => { e.preventDefault(); void add(h); }}>
                    <Avatar name={h.name} size={32} /><span style={{ minWidth: 0 }}><b>{h.name}</b><small>{h.sub}</small></span><span className="tm-tag" data-k="user">ADD</span>
                  </button>
                ))}
                {hits.length === 0 && <div className="tm-none">No one matches “{term}”.</div>}
              </div>
            )}
          </div>
          <span className="tm-note">Managers can score this tournament’s matches and edit their time and venue. Only admins change anything else. Everyone else can only watch.</span>
        </div>
      )}

      <div className="tm-sec"><b>MANAGERS · {managers.length}</b></div>
      {managers.length === 0 ? (
        <div className="tm-empty"><b>No managers yet</b><span>{isAdmin ? 'Search above to add the first one.' : 'Only admins score and edit the matches for now.'}</span></div>
      ) : (
        <div className="tm-list">
          {managers.map((m, i) => (
            <div key={m.id} className="tm-row" data-sm="" style={{ borderRadius: managers.length === 1 ? '20px' : i === 0 ? '20px 20px 6px 6px' : i === managers.length - 1 ? '6px 6px 20px 20px' : '6px' }}>
              <Avatar name={m.name} size={36} />
              <span className="tm-who"><span><b>{m.name}</b></span></span>
              {isAdmin && <button type="button" className="tm-btn" style={{ height: 34 }} onClick={() => setConfirm(m)}>REMOVE</button>}
            </div>
          ))}
        </div>
      )}

      {confirm && (
        <div className="tm-modal" onClick={() => setConfirm(null)}>
          <div className="tm-dialog" role="alertdialog" aria-label={`Remove ${confirm.name}?`} onClick={(e) => e.stopPropagation()}>
            <h2>Remove {confirm.name}?</h2>
            <p>They can no longer score this tournament’s matches or edit their time and venue. They become a viewer here.</p>
            <div className="tm-acts">
              <button type="button" className="tm-btn" onClick={() => setConfirm(null)}>CANCEL</button>
              <button type="button" className="tm-btn" data-v="danger" disabled={busy} onClick={() => { const c = confirm; setConfirm(null); void remove(c); }}>REMOVE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
