'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addManager, addPlayerToTeam, addUserAsPlayer } from '@/app/teams/actions';
import type { PersonHit } from '@/app/api/teams/[id]/people-search/route';
import { Button } from '@/components/ui';

/** One search box. Only people it finds can be added, so there is nothing to scroll through or mistype. */
export function PeopleSearch({ teamId, kind, label, hint }: { teamId: string; kind: 'player' | 'manager'; label: string; hint: string }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<PersonHit[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
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

  const add = async (h: PersonHit) => {
    setBusy(h.id);
    const fd = new FormData();
    fd.set('teamId', teamId);
    if (kind === 'manager') { fd.set('userId', h.id); await addManager(fd); }
    else if (h.kind === 'user') { fd.set('userId', h.id); await addUserAsPlayer(fd); }
    else { fd.set('playerId', h.id); await addPlayerToTeam(fd); }
    setBusy(null); setQ(''); setHits(null);
    router.refresh();
  };

  return (
    <div className="space-y-2">
      <label className="block space-y-1.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          type="search"
          autoComplete="off"
          placeholder="Search by name or email"
          className="w-full rounded-lg bg-surface-2 px-3 py-2.5 text-sm text-fg outline-none placeholder:text-muted/70 focus-visible:ring-2 focus-visible:ring-accent"
        />
      </label>
      {hits && hits.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-lg bg-surface-2" aria-label="Search results">
          {hits.map((h) => (
            <li key={`${h.kind}-${h.id}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 truncate">{h.name} <span className="text-xs text-muted">{h.sub}</span></span>
              <Button type="button" disabled={busy !== null} onClick={() => add(h)}>{busy === h.id ? 'Adding…' : 'Add'}</Button>
            </li>
          ))}
        </ul>
      )}
      {hits && hits.length === 0 && term.length >= 2 && <p className="text-xs text-muted">No one found for “{term}”. Only people with an account or in the player directory can be added.</p>}
      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
}
