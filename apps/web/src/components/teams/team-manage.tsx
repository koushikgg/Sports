'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addManager, addPlayerToTeam, addUserAsPlayer, clearCaptain, deleteTeam, makeCaptain, removeFromTeam, removeManager, renameTeam, setTeamLogo,
} from '@/app/teams/actions';
import type { PersonHit } from '@/app/api/teams/[id]/people-search/route';
import { teamCode, teamTint } from '@/components/matches/model';
import { Avatar } from '@/components/ratch/avatar';
import './team-manage.css';

const Dots = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="12" cy="5" r="2.2" /><circle cx="12" cy="12" r="2.2" /><circle cx="12" cy="19" r="2.2" /></svg>
);
/** Centre-crops to a square and shrinks until the data URL is small. Keeps transparency (WebP, else PNG). */
async function cropLogo(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(bmp.width, bmp.height);
  for (const size of [256, 192, 128]) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    c.getContext('2d')!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
    const url = c.toDataURL('image/webp', 0.9);
    if (url.length <= 200_000) return url;
  }
  throw new Error('too large');
}
const Lens = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);

export interface RosterRow { id: string; name: string; email: string | null; userId: string | null; isCaptain: boolean; avatar?: string | null }
export interface ManagerRow { id: string; name: string; email: string }
interface Props {
  team: { id: string; name: string; shortName: string | null; sport: string; logo: string | null };
  roster: RosterRow[];
  managers: ManagerRow[];
  /** Admin, manager or captain: may add and remove players. */
  canManage: boolean;
  /** Admin: also captain, managers, rename and delete. */
  isAdmin: boolean;
}

type Pending = { kind: 'player'; row: RosterRow } | { kind: 'manager'; row: ManagerRow } | { kind: 'captain'; row: RosterRow };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

/** One search box. Only people it finds can be added. */
function Search({ teamId, kind, placeholder, small, busy, onPick }: { teamId: string; kind: 'player' | 'manager'; placeholder: string; small?: boolean; busy: boolean; onPick: (h: PersonHit) => void }) {
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const [hits, setHits] = useState<PersonHit[] | null>(null);
  const term = q.trim();

  useEffect(() => {
    if (term.length < 2) { setHits(null); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/teams/${teamId}/people-search?kind=${kind}&q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { hits: [] }))
        .then((d: { hits: PersonHit[] }) => setHits(d.hits))
        .catch(() => {});
    }, 200);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [term, teamId, kind]);

  const open = focus && term.length >= 2 && hits !== null;
  return (
    <div className="tm-search" data-sm={small ? '' : undefined}>
      <div className="tm-field">
        <Lens />
        <input type="search" autoComplete="off" value={q} placeholder={placeholder} aria-label={placeholder} onChange={(e) => setQ(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} />
      </div>
      {open && (
        <div className="tm-pop" data-sm={small ? '' : undefined} role="listbox" aria-label="Search results">
          {hits.map((h) => (
            <button key={`${h.kind}-${h.id}`} type="button" role="option" aria-selected={false} className="tm-hit" disabled={busy}
              onMouseDown={(e) => { e.preventDefault(); setQ(''); setHits(null); onPick(h); }}>
              <Avatar name={h.name} size={small ? 28 : 32} />
              <span style={{ minWidth: 0 }}><b>{h.name}</b><small>{h.sub}</small></span>
              {!small && <span className="tm-tag" data-k={h.kind}>ADD</span>}
            </button>
          ))}
          {hits.length === 0 && <div className="tm-none">{kind === 'manager' ? 'No one matches.' : <>No one matches “{term}”.</>}</div>}
        </div>
      )}
    </div>
  );
}

export function TeamManage({ team, roster, managers, canManage, isAdmin }: Props) {
  const router = useRouter();
  const [pendingTx, startTx] = useTransition();
  const [menu, setMenu] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Pending | 'delete' | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(team.name);
  const [problem, setProblem] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const logoInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!menu) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [menu]);

  const say = (t: string) => { clearTimeout(timer.current); setToast(t); timer.current = setTimeout(() => setToast(null), 2200); };
  const run = (job: () => Promise<unknown>, done: string, after?: () => void) =>
    startTx(async () => {
      try {
        const r = (await job()) as { error?: string } | undefined;
        if (r?.error) { setProblem(r.error); return; }
        if (after) { after(); return; }
        router.refresh(); say(done);
      } catch { setProblem('Something went wrong. Try again.'); }
    });

  const tint = teamTint(team.name);
  const cap = roster.find((r) => r.isCaptain);
  const kpis: [string, string | number, string?][] = [
    ['PLAYERS', roster.length],
    ['CAPTAIN', cap ? cap.name : 'Not set', cap ? 'var(--amber)' : 'var(--text-tertiary)'],
    ['MANAGERS', managers.length],
  ];
  const stack = (i: number, n: number) => (n === 1 ? '20px' : i === 0 ? '20px 20px 6px 6px' : i === n - 1 ? '6px 6px 20px 20px' : '6px');
  const T = { teamId: team.id };

  const pick = (h: PersonHit) =>
    run(
      () => (h.kind === 'user' ? addUserAsPlayer(fd({ ...T, userId: h.id })) : addPlayerToTeam(fd({ ...T, playerId: h.id }))),
      `${h.name} added to roster`,
    );
  const pickManager = (h: PersonHit) => run(() => addManager(fd({ ...T, userId: h.id })), `${h.name} is now a manager`);

  const doConfirm = () => {
    const c = confirm; setConfirm(null);
    if (c === 'delete') return run(() => deleteTeam(fd({ id: team.id })), '', () => router.push('/teams'));
    if (c?.kind === 'player') return run(() => removeFromTeam(fd({ ...T, playerId: c.row.id })), `${c.row.name} removed`);
    if (c?.kind === 'captain') {
      const row = c.row;
      return run(() => (row.isCaptain ? clearCaptain(fd(T)) : makeCaptain(fd({ ...T, playerId: row.id }))), row.isCaptain ? 'Captain removed' : `${row.name} is captain`);
    }
    if (c?.kind === 'manager') return run(() => removeManager(fd({ ...T, userId: c.row.id })), `${c.row.name} removed as manager`);
  };
  const pickLogo = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) return setProblem('Choose an image file.');
    if (f.size > 12 * 1024 * 1024) return setProblem('That image is over 12 MB.');
    let logo: string;
    try { logo = await cropLogo(f); } catch { return setProblem('That image could not be used. Try a smaller one.'); }
    run(() => setTeamLogo(fd({ ...T, logo })), 'Team photo updated');
  };
  const saveName = () => {
    const n = draft.trim(); if (!n) return;
    setRenaming(false);
    if (n !== team.name) run(() => renameTeam(fd({ ...T, name: n })), `Team renamed to ${n}`);
  };

  const Menu = ({ id, hero, children }: { id: string; hero?: boolean; children: React.ReactNode }) => (
    <div className="tm-dots" data-hero={hero ? '' : undefined}>
      <button type="button" className="tm-dot" data-hero={hero ? '' : undefined} aria-label={hero ? 'Team actions' : 'More actions'} aria-haspopup="menu" aria-expanded={menu === id} onClick={() => setMenu(menu === id ? null : id)}><Dots size={hero ? 24 : 22} /></button>
      {menu === id && <div className="tm-menu" role="menu">{children}</div>}
    </div>
  );
  const Item = ({ danger, disabled, title, onClick, children }: { danger?: boolean; disabled?: boolean; title?: string; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" role="menuitem" className="tm-mi" data-danger={danger ? '' : undefined} disabled={disabled} title={title} onClick={() => { setMenu(null); onClick(); }}>{children}</button>
  );

  const confirmCopy = confirm === 'delete'
    ? { title: `Delete ${team.name}?`, body: `This removes the team, its roster of ${roster.length} and ${managers.length} manager${managers.length === 1 ? '' : 's'}. Player profiles stay in the directory. This can’t be undone.`, go: 'DELETE TEAM' }
    : confirm?.kind === 'player'
      ? { title: `Remove ${confirm.row.name}?`, body: `${confirm.row.isCaptain ? 'They are the current captain. The team will have no captain until you assign one. ' : ''}Their player profile stays in the directory.`, go: 'REMOVE' }
      : confirm?.kind === 'captain'
        ? confirm.row.isCaptain
          ? { title: `Remove ${confirm.row.name} as captain?`, body: 'The team will have no captain until you assign one. They stay on the roster, and lose the right to add and remove players.', go: 'REMOVE CAPTAIN' }
          : { title: `Make ${confirm.row.name} captain?`, body: 'The captain can add and remove this team’s people. The current captain, if any, is replaced.', go: 'MAKE CAPTAIN' }
      : confirm?.kind === 'manager'
        ? { title: `Remove ${confirm.row.name} as manager?`, body: 'They will no longer be able to add or remove players on this team.', go: 'REMOVE' }
        : null;

  return (
    <div className="tm">
      <Link href="/teams" className="tm-back"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>ALL TEAMS</Link>

      <section className="tm-hero">
        <div className="tm-top">
          <div className="tm-id">
            {team.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={team.logo} alt="" className="tm-crest" style={{ objectFit: 'cover' }} />
            ) : (
              <div className="tm-crest" style={{ background: tint.bg, color: tint.fg }}>{teamCode(team.name, team.shortName)}</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <span className="lbl">{team.sport.toUpperCase()}</span>
              <h1>{team.name}</h1>
            </div>
          </div>
          {isAdmin && (
            <Menu id="team" hero>
              <Item onClick={() => { setDraft(team.name); setRenaming(true); }}>Edit team name</Item>
              <Item onClick={() => logoInput.current?.click()}>{team.logo ? 'Change team photo' : 'Add team photo'}</Item>
              {team.logo && <Item onClick={() => run(() => setTeamLogo(fd({ ...T, logo: 'remove' })), 'Team photo removed')}>Remove team photo</Item>}
              <Item danger onClick={() => setConfirm('delete')}>Delete team</Item>
            </Menu>
          )}
        </div>
        <div className="tm-kpis">
          {kpis.map(([k, v, c]) => <div key={k} className="tm-kpi"><span>{k}</span><span style={{ color: c }}>{v}</span></div>)}
        </div>
      </section>

      <div className="tm-cols">
        <section className="tm-col tm-col-main">
          <div className="tm-sec"><b>ROSTER · {roster.length}</b><i>{!cap && roster.length ? 'NO CAPTAIN ASSIGNED' : ''}</i></div>
          {canManage && (
            <div className="tm-panel">
              <Search teamId={team.id} kind="player" placeholder="Add a player — search by name or email" busy={pendingTx} onPick={pick} />
              <span className="tm-note">Search by name or email.</span>
            </div>
          )}
          {roster.length === 0 && (
            <div className="tm-empty"><b>Roster is empty</b><span>{canManage ? 'Search above to add the first player.' : 'No players yet.'}</span></div>
          )}
          <div className="tm-list">
            {roster.map((p, i) => (
              <div key={p.id} className="tm-row" data-cap={p.isCaptain ? '' : undefined} style={{ borderRadius: stack(i, roster.length) }}>
                <Avatar name={p.name} size={40} src={p.avatar} />
                <span className="tm-who">
                  <span><Link href={`/players/${p.id}`} style={{ color: 'inherit', textDecoration: 'none' }}><b>{p.name}</b></Link>{p.isCaptain && <span className="tm-cap">CAPTAIN</span>}</span>
                  {p.email && <small>{p.email.toUpperCase()}</small>}
                </span>
                {canManage && (
                  <Menu id={`p${p.id}`}>
                    {isAdmin && (
                      <Item
                        disabled={!p.userId}
                        title={p.userId ? undefined : 'Link a user account to make this player captain'}
                        onClick={() => setConfirm({ kind: 'captain', row: p })}
                      >
                        <span>{p.isCaptain ? 'Remove as captain' : 'Make captain'}</span>
                        {!p.userId && <small>Needs a linked user account</small>}
                      </Item>
                    )}
                    <Item danger onClick={() => setConfirm({ kind: 'player', row: p })}>Remove from team</Item>
                  </Menu>
                )}
              </div>
            ))}
          </div>
        </section>

        {(isAdmin || managers.length > 0) && (
          <section className="tm-col tm-col-side">
            <div className="tm-sec"><b>MANAGERS · {managers.length}</b></div>
            {isAdmin && (
              <div className="tm-panel">
                <Search teamId={team.id} kind="manager" placeholder="Add a manager" small busy={pendingTx} onPick={pickManager} />
                <span className="tm-note">Managers can add and remove this team’s players.</span>
              </div>
            )}
            {managers.length === 0 && <div className="tm-empty" data-sm="">No managers yet.</div>}
            <div className="tm-list">
              {managers.map((m, i) => (
                <div key={m.id} className="tm-row" data-sm="" style={{ borderRadius: stack(i, managers.length) }}>
                  <Avatar name={m.name} size={36} />
                  <span className="tm-who"><span><b>{m.name}</b></span><small>{m.email}</small></span>
                  {isAdmin && <Menu id={`m${m.id}`}><Item danger onClick={() => setConfirm({ kind: 'manager', row: m })}>Remove as manager</Item></Menu>}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {problem && (
        <div className="tm-modal" onClick={() => setProblem(null)}>
          <div className="tm-dialog" role="alertdialog" aria-label="Could not finish" onClick={(e) => e.stopPropagation()}>
            <h2>That didn’t work</h2>
            <p>{problem}</p>
            <div className="tm-acts"><button type="button" className="tm-btn" onClick={() => setProblem(null)}>OK</button></div>
          </div>
        </div>
      )}

      <input ref={logoInput} type="file" accept="image/*" hidden aria-label="Team photo" onChange={(e) => { void pickLogo(e.target.files?.[0]); e.target.value = ''; }} />

      {menu && <div className="tm-scrim" onClick={() => setMenu(null)} />}

      {confirmCopy && (
        <div className="tm-modal" onClick={() => setConfirm(null)}>
          <div className="tm-dialog" role="alertdialog" aria-label={confirmCopy.title} onClick={(e) => e.stopPropagation()}>
            <h2>{confirmCopy.title}</h2>
            <p>{confirmCopy.body}</p>
            <div className="tm-acts">
              <button type="button" className="tm-btn" onClick={() => setConfirm(null)}>CANCEL</button>
              <button type="button" className="tm-btn" data-v={confirm !== 'delete' && confirm?.kind === 'captain' && !confirm.row.isCaptain ? 'amber' : 'danger'} onClick={doConfirm}>{confirmCopy.go}</button>
            </div>
          </div>
        </div>
      )}

      {renaming && (
        <div className="tm-modal" onClick={() => setRenaming(false)}>
          <div className="tm-dialog" role="dialog" aria-label="Edit team name" onClick={(e) => e.stopPropagation()}>
            <h2>Edit team name</h2>
            <label>
              <span className="lbl">TEAM NAME</span>
              <input autoFocus maxLength={40} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setRenaming(false); }} />
            </label>
            <div className="tm-acts">
              <button type="button" className="tm-btn" onClick={() => setRenaming(false)}>CANCEL</button>
              <button type="button" className="tm-btn" data-v="amber" disabled={!draft.trim()} onClick={saveName}>SAVE</button>
            </div>
          </div>
        </div>
      )}

      <div className="tm-toast" role="status" aria-live="polite" style={{ opacity: toast ? 1 : 0, transform: `translate(-50%, ${toast ? 0 : 20}px)` }}>
        {toast && <div><i />{toast}</div>}
      </div>
    </div>
  );
}
