'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addTournamentTeam, removeTournamentTeam } from '@/app/tournaments/[id]/actions';
import { teamCode, teamTint } from '@/components/matches/model';
import '@/components/teams/team-manage.css';

export interface TournamentTeam { id: string; name: string; matches: number }
const stack = (i: number, n: number) => (n === 1 ? '20px' : i === 0 ? '20px 20px 6px 6px' : i === n - 1 ? '6px 6px 20px 20px' : '6px');

/** The teams in a tournament. Admins can add an existing team, create a new one, or remove one that has no matches. */
export function TeamsTab({ tournamentId, teams: serverTeams, candidates: serverCandidates, minTeams, sportName }: { tournamentId: string; teams: TournamentTeam[]; candidates: { id: string; name: string }[] | null; minTeams: number; sportName: string }) {
  const router = useRouter();
  // shown at once after a change; the refresh brings the server's copy in behind it
  const [teams, setTeams] = useState(serverTeams);
  const [candidates, setCandidates] = useState(serverCandidates);
  useEffect(() => setTeams(serverTeams), [serverTeams]);
  useEffect(() => setCandidates(serverCandidates), [serverCandidates]);
  const [pending, setPending] = useState(false);
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const [confirm, setConfirm] = useState<TournamentTeam | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const term = q.trim();
  const lower = term.toLowerCase();
  const hits = candidates && term ? candidates.filter((c) => c.name.toLowerCase().includes(lower)).slice(0, 6) : [];
  const exact = (candidates ?? []).some((c) => c.name.toLowerCase() === lower) || teams.some((t) => t.name.toLowerCase() === lower);

  const say = (t: string) => { setToast(t); setTimeout(() => setToast(null), 2200); };
  const run = (job: () => Promise<{ error?: string; team?: { id: string; name: string } }>, done: string, removed?: string) =>
    (async () => {
      setPending(true);
      try {
        const r = await job();
        if (r.error) { setProblem(r.error); return; }
        setQ(''); say(done);
        if (r.team) { const t = r.team; setTeams((x) => [...x, { id: t.id, name: t.name, matches: 0 }]); setCandidates((x) => x && x.filter((c) => c.id !== t.id)); }
        if (removed) { setTeams((x) => x.filter((t) => t.id !== removed)); }
        router.refresh();
      } catch { setProblem('Something went wrong. Try again.'); } finally { setPending(false); }
    })();

  return (
    <div className="tm" style={{ gap: 16 }}>
      {candidates && (
        <div className="tm-panel" style={{ zIndex: 5 }}>
          <div className="tm-search">
            <div className="tm-field">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input type="search" autoComplete="off" value={q} placeholder={`Add a team — search ${sportName.toLowerCase()} teams or type a new name`} aria-label="Add a team" onChange={(e) => setQ(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} />
            </div>
            {focus && term && (
              <div className="tm-pop" role="listbox" aria-label="Teams">
                {hits.map((c) => (
                  <button key={c.id} type="button" role="option" aria-selected={false} className="tm-hit" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }} disabled={pending}
                    onMouseDown={(e) => { e.preventDefault(); run(() => addTournamentTeam({ tournamentId, teamId: c.id }), `${c.name} added`); }}>
                    <span><b>{c.name}</b></span><span className="tm-tag">ADD</span>
                  </button>
                ))}
                {!exact && (
                  <button type="button" role="option" aria-selected={false} className="tm-hit" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }} disabled={pending}
                    onMouseDown={(e) => { e.preventDefault(); run(() => addTournamentTeam({ tournamentId, name: term }), `${term} created and added`); }}>
                    <span><b>Create “{term}”</b><small>A new {sportName.toLowerCase()} team</small></span><span className="tm-tag" data-k="user">CREATE + ADD</span>
                  </button>
                )}
                {hits.length === 0 && exact && <div className="tm-none">“{term}” is already in this tournament.</div>}
              </div>
            )}
          </div>
          <span className="tm-note">Adding a team updates the standings and the planned match count. Teams with matches can’t be removed.</span>
        </div>
      )}

      <div className="tm-sec"><b>TEAMS · {teams.length}</b><i>{teams.length < minTeams ? `NEEDS AT LEAST ${minTeams}` : ''}</i></div>
      {teams.length === 0 ? (
        <div className="tm-empty"><b>No teams yet</b><span>{candidates ? 'Search above to add the first team.' : 'Check back soon.'}</span></div>
      ) : (
        <div className="tm-list">
          {teams.map((t, i) => {
            const tint = teamTint(t.name);
            return (
              <div key={t.id} className="tm-row" style={{ borderRadius: stack(i, teams.length) }}>
                <span className="cw-code" style={{ width: 40, height: 40, background: tint.bg, color: tint.fg, fontSize: 11 }}>{teamCode(t.name)}</span>
                <span className="tm-who"><span><b>{t.name}</b></span><small>{t.matches ? `${t.matches} MATCH${t.matches === 1 ? '' : 'ES'}` : 'NO MATCHES YET'}</small></span>
                {candidates && <button type="button" className="tm-btn" style={{ height: 34 }} onClick={() => setConfirm(t)}>REMOVE</button>}
              </div>
            );
          })}
        </div>
      )}

      {confirm && (
        <div className="tm-modal" onClick={() => setConfirm(null)}>
          <div className="tm-dialog" role="alertdialog" aria-label={`Remove ${confirm.name}?`} onClick={(e) => e.stopPropagation()}>
            <h2>Remove {confirm.name}?</h2>
            <p>It leaves this tournament’s standings and the planned match count goes down. The team itself stays and can be added again.</p>
            <div className="tm-acts">
              <button type="button" className="tm-btn" onClick={() => setConfirm(null)}>CANCEL</button>
              <button type="button" className="tm-btn" data-v="danger" disabled={pending} onClick={() => { const c = confirm; setConfirm(null); run(() => removeTournamentTeam({ tournamentId, teamId: c.id }), `${c.name} removed`, c.id); }}>REMOVE</button>
            </div>
          </div>
        </div>
      )}
      {problem && (
        <div className="tm-modal" onClick={() => setProblem(null)}>
          <div className="tm-dialog" role="alertdialog" aria-label="Could not finish" onClick={(e) => e.stopPropagation()}>
            <h2>That didn’t work</h2>
            <p>{problem}</p>
            <div className="tm-acts"><button type="button" className="tm-btn" onClick={() => setProblem(null)}>OK</button></div>
          </div>
        </div>
      )}
      <div className="tm-toast" role="status" aria-live="polite" style={{ opacity: toast ? 1 : 0, transform: `translate(-50%, ${toast ? 0 : 20}px)` }}>{toast && <div><i />{toast}</div>}</div>
    </div>
  );
}
