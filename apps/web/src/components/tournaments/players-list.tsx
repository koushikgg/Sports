'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/ratch/avatar';

export interface PlayerRow { id: string; name: string; role: string | null; teams: string[]; avatar?: string | null }

export function PlayersList({ rows }: { rows: PlayerRow[] }) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const shown = rows.filter((p) => !term || `${p.name} ${p.teams.join(' ')} ${p.role ?? ''}`.toLowerCase().includes(term));
  return (
    <>
      <label className="mx-search" style={{ alignSelf: 'flex-start', minWidth: 280 }}>
        <span className="lbl">SEARCH</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Player, team or role" aria-label="Search players" />
      </label>
      {shown.length === 0 ? <p className="tn-empty">{rows.length ? 'No players match your search.' : 'No players yet.'}</p> : (
        <div className="dr-list">
          {shown.map((p) => (
            <Link key={p.id} href={`/players/${p.id}`} className="dr-row" style={{ color: 'inherit', textDecoration: 'none' }}>
              <Avatar name={p.name} size={32} src={p.avatar} />
              <b>{p.name}</b>
              <small>{p.teams.length ? p.teams.join(' · ') : 'No team'}</small>
              {p.role && <span className="dr-role">{p.role}</span>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
