'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { stageTitle, type FixtureParse } from '@sports/sports-engine/src/fixture-import';
import { clearTournamentFixtures, createFixtures, previewFixtures } from '@/app/tournaments/[id]/fixtures-actions';
import '@/components/teams/team-manage.css';
import { toast } from '@/components/ratch/toast';

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through to the old way */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

const fmtDate = (d: string, t: string) => {
  const [y, m, day] = d.split('-').map(Number);
  if (!y || !m || !day) return d || '—';
  return `${new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).toUpperCase()}${t ? ` · ${t}` : ''}`;
};

/** Admin tool: copy the prompt, paste the JSON back, check it row by row, then create the fixtures. */
export function FixturesImport({ tournamentId, prompt, teamCount, fixtureCount, started }: { tournamentId: string; prompt: string; teamCount: number; fixtureCount: number; started: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [json, setJson] = useState('');
  const [busy, setBusy] = useState<'preview' | 'create' | null>(null);
  const [parse, setParse] = useState<FixtureParse | null>(null);
  // preview rows grouped by round, rounds in the order they are first played, matches by time inside each
  const groups = (parse?.stages ?? []).map((st) => ({
    name: st.name,
    rows: parse!.rows.filter((r) => (r.round ?? 'Matches') === st.name).sort((x, y) => `${x.date} ${x.time}`.localeCompare(`${y.date} ${y.time}`) || x.no - y.no),
  }));
  const setError = (m: string | null) => { if (m) toast.error(m); };
  const [confirm, setConfirm] = useState<'replace' | 'clear' | null>(null);
  const tz = () => new Date().getTimezoneOffset();

  const flash = (t: string) => toast.success(t);
  const onCopy = async () => ((await copy(prompt)) ? toast.success('Copied. Paste it into your tool.') : toast.error('Could not copy. Select the text in the box below and copy it.'));

  const preview = async () => {
    setBusy('preview'); setError(null); setParse(null);
    try {
      const r = await previewFixtures({ tournamentId, json, tzOffset: tz() });
      if (r.error) setError(r.error);
      else if (r.parse?.fatal) setError(r.parse.fatal);
      else setParse(r.parse ?? null);
    } catch { setError('Something went wrong. Try again.'); } finally { setBusy(null); }
  };
  const create = async () => {
    setBusy('create'); setError(null);
    try {
      const r = await createFixtures({ tournamentId, json, tzOffset: tz() });
      if (r.error) { setError(r.error); return; }
      setJson(''); setParse(null);
      flash(`${r.created} fixture${r.created === 1 ? '' : 's'} saved${r.replaced ? `, replacing ${r.replaced}` : ''}.`);
      router.refresh();
    } catch { setError('Something went wrong. Try again.'); } finally { setBusy(null); }
  };

  const clear = async () => {
    setBusy('create'); setError(null);
    try {
      const r = await clearTournamentFixtures({ tournamentId });
      if (r.error) { setError(r.error); return; }
      setParse(null); flash(`${r.removed} fixture${r.removed === 1 ? '' : 's'} removed.`);
      router.refresh();
    } catch { setError('Something went wrong. Try again.'); } finally { setBusy(null); }
  };

  const toCreate = parse ? parse.counts.total - parse.counts.skip : 0;
  const blocked = !parse || parse.counts.error > 0 || toCreate === 0;

  if (started) {
    return (
      <div className="tm-panel" style={{ marginBottom: 16 }}>
        <span className="lbl">FIXTURES ARE LOCKED</span>
        <span className="tm-note">The tournament has started, so its fixtures can no longer be replaced or cleared.</span>
      </div>
    );
  }

  return (
    <details className="tm-panel" style={{ marginBottom: 16 }} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary style={{ cursor: 'pointer', listStyle: 'none' }}><span className="lbl">+ CREATE FIXTURES FROM JSON</span></summary>
      <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
        <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
          <li>Copy the prompt. It has this tournament’s {teamCount} teams, venues, dates and the JSON format.</li>
          <li>Paste it into any tool you like (an AI chat, a script, a spreadsheet export) and ask for the fixtures.</li>
          <li>Paste the JSON it gives back below and check it. Nothing is saved until you create. Knockout slots like “Winner of Match 3” fill in as results come in.</li>
          <li>Until the tournament starts you can do this again and again: a new list <b>replaces</b> the current fixtures.</li>
        </ol>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="tm-btn" data-v="amber" onClick={onCopy}>COPY TEAMS + FORMAT</button>
          {fixtureCount > 0 && <button type="button" className="tm-btn" disabled={busy !== null} onClick={() => setConfirm('clear')}>CLEAR {fixtureCount} FIXTURE{fixtureCount === 1 ? '' : 'S'}</button>}
        </div>
        <label style={{ display: 'grid', gap: 6 }}>
          <span className="lbl">PASTE THE JSON HERE</span>
          <textarea value={json} onChange={(e) => { setJson(e.target.value); setParse(null); setError(null); }} rows={7} spellCheck={false} placeholder={'{ "version": 1, "fixtures": [ { "round": "Match 1", "date": "2026-11-02", "time": "18:00", "teamA": "…", "teamB": "…" } ] }'}
            style={{ border: 'none', outline: 'none', borderRadius: 12, padding: 14, resize: 'vertical', background: 'var(--surface-muted)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.5 }} />
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="tm-btn" disabled={!json.trim() || busy !== null} onClick={preview}>{busy === 'preview' ? 'CHECKING…' : 'CHECK FIXTURES'}</button>
          {parse && <button type="button" className="tm-btn" data-v="amber" disabled={blocked || busy !== null} onClick={() => (fixtureCount > 0 ? setConfirm('replace') : create())}>{busy === 'create' ? 'SAVING…' : `${fixtureCount > 0 ? 'REPLACE WITH' : 'CREATE'} ${toCreate} FIXTURE${toCreate === 1 ? '' : 'S'}`}</button>}
        </div>

        {parse && (
          <>
            <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
              {parse.counts.total} in the paste · <b style={{ color: '#6fe08d' }}>{parse.counts.ok} ready</b>
              {parse.counts.warn > 0 && <> · <b style={{ color: 'var(--amber)' }}>{parse.counts.warn} with warnings</b></>}
              {parse.counts.error > 0 && <> · <b style={{ color: 'var(--red-text)' }}>{parse.counts.error} with errors</b></>}
              {parse.counts.skip > 0 && <> · {parse.counts.skip} already exist</>}
              {parse.counts.error > 0 && '. Fix the errors in your JSON and check again.'}
            </p>
            {parse.stages.length > 1 && (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }} aria-label="Stages">
                {parse.stages.map((st, i) => <span key={st.name}>{i > 0 && ' → '}<b style={{ color: 'var(--text-primary)' }}>{stageTitle(st.name)}</b> ×{st.count}</span>)}
              </p>
            )}
            {parse.byes.length > 0 && <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>Byes (straight into their first match): <b>{parse.byes.map((b) => b.name).join(', ')}</b></p>}
            {parse.notes.length > 0 && (
              <ul aria-label="Notes" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4, fontSize: 13, color: 'var(--amber)' }}>
                {parse.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            )}
            <div aria-label="Fixture preview" style={{ display: 'grid', gap: 14 }}>
              {groups.map((g) => (
                <div key={g.name} style={{ display: 'grid', gap: 6 }}>
                  {(groups.length > 1 || g.rows[0]!.round) && <div className="lbl" style={{ color: 'var(--text-secondary)' }}>{stageTitle(g.name).toUpperCase()} · {g.rows.length} MATCH{g.rows.length === 1 ? '' : 'ES'}</div>}
                  <div className="tm-list">
                    {g.rows.map((r, i) => {
                      const bad = r.issues.some((x) => x.level === 'error');
                      const warn = !bad && r.issues.some((x) => x.level === 'warn');
                      const radius = g.rows.length === 1 ? '16px' : i === 0 ? '16px 16px 6px 6px' : i === g.rows.length - 1 ? '6px 6px 16px 16px' : '6px';
                return (
                  <div key={r.index} className="tm-row" style={{ gridTemplateColumns: '28px minmax(0,1fr)', borderRadius: radius, background: 'var(--surface-sunken)', opacity: r.skip ? 0.6 : 1 }}>
                    <span aria-label={bad ? 'Error' : warn ? 'Warning' : 'Ready'} style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, background: bad ? 'color-mix(in srgb, #ff383c 22%, transparent)' : warn ? 'var(--amber-soft)' : 'color-mix(in srgb, #34c759 25%, transparent)', color: bad ? 'var(--red-text)' : warn ? 'var(--amber)' : '#6fe08d' }}>{bad ? '!' : warn ? '•' : '✓'}</span>
                    <span className="tm-who">
                      <span><b style={{ fontSize: 14 }}>{r.labelA || '—'} vs {r.labelB || '—'}</b><span className="tm-tag" style={{ marginLeft: 4 }}>#{r.no}</span>{r.round && <span className="tm-tag" style={{ marginLeft: 4 }}>{r.round.toUpperCase()}</span>}{r.skip && <span className="tm-tag">SKIPPED</span>}</span>
                      <small>{fmtDate(r.date, r.time)}{r.venue ? ` · ${r.venue.toUpperCase()}` : ''}</small>
                      {r.issues.map((x, k) => <small key={k} style={{ color: x.level === 'error' ? 'var(--red-text)' : 'var(--amber)', textTransform: 'none', letterSpacing: 0 }}>{x.text}</small>)}
                    </span>
                  </div>
                );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {confirm && (
        <div className="tm-modal" onClick={() => setConfirm(null)}>
          <div className="tm-dialog" role="alertdialog" aria-label={confirm === 'clear' ? 'Clear fixtures?' : 'Replace fixtures?'} onClick={(e) => e.stopPropagation()}>
            <h2>{confirm === 'clear' ? `Clear ${fixtureCount} fixture${fixtureCount === 1 ? '' : 's'}?` : `Replace ${fixtureCount} fixture${fixtureCount === 1 ? '' : 's'}?`}</h2>
            <p>{confirm === 'clear' ? 'Every fixture of this tournament is removed, including any match made by hand with its playing XI and scorer.' : `The ${fixtureCount} current fixture${fixtureCount === 1 ? '' : 's'} (including any match made by hand, with its playing XI and scorer) are removed and the ${toCreate} from your JSON take ${fixtureCount === 1 ? 'its' : 'their'} place.`} Nothing has been played yet, so only the schedule is lost.</p>
            <div className="tm-acts">
              <button type="button" className="tm-btn" onClick={() => setConfirm(null)}>CANCEL</button>
              <button type="button" className="tm-btn" data-v="danger" onClick={() => { const c = confirm; setConfirm(null); void (c === 'clear' ? clear() : create()); }}>{confirm === 'clear' ? 'CLEAR FIXTURES' : 'REPLACE FIXTURES'}</button>
            </div>
          </div>
        </div>
      )}
    </details>
  );
}
