'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { TournamentSummary } from '@sports/scoring';
import { sportColor } from '@/components/matches/model';
import { useHydrated } from '@/components/matches/time';

type Status = 'all' | TournamentSummary['status'];
const STATUS: [string, Status][] = [['ALL', 'all'], ['ONGOING', 'live'], ['UPCOMING', 'up'], ['COMPLETED', 'done']];
const BADGE: Record<TournamentSummary['status'], [string, string]> = { live: ['ONGOING', 'live'], up: ['UPCOMING', 'up'], done: ['COMPLETED', 'ft'] };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }).toUpperCase() : '—');

export function TournamentsBoard({ list }: { list: TournamentSummary[] }) {
  const ready = useHydrated();
  const [sport, setSport] = useState('all');
  const [status, setStatus] = useState<Status>('all');
  const sports = useMemo(() => [...new Map(list.map((t) => [t.sportKey, t.sportName])).entries()], [list]);
  const shown = list.filter((t) => (sport === 'all' || t.sportKey === sport) && (status === 'all' || t.status === status));

  return (
    <>
      <div className="mx-filter-row">
        <div className="mx-tabs-sport" role="group" aria-label="Sport">
          {[['all', 'All sports'] as const, ...sports].map(([key, name]) => (
            <button key={key} className="mx-sporttab" aria-pressed={sport === key} data-on={sport === key ? 'true' : undefined} onClick={() => setSport(key)}>
              <i style={{ background: key === 'all' ? 'var(--text-secondary)' : sportColor(key) }} />{name.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="mx-statustabs" role="group" aria-label="Status">
          {STATUS.map(([l, v]) => <button key={v} aria-pressed={status === v} data-on={status === v ? 'true' : undefined} onClick={() => setStatus(v)}>{l}</button>)}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="tn-empty">{list.length === 0 ? 'No tournaments yet.' : 'No tournaments match these filters.'}</p>
      ) : (
        <div className="tn-grid">
          {shown.map((t) => {
            const c = sportColor(t.sportKey), [label, tone] = BADGE[t.status];
            const pct = t.total ? Math.round((t.played / t.total) * 100) : 0;
            return (
              <Link key={t.id} href={`/tournaments/${t.id}`} className="tn-card" style={{ ['--tn' as string]: c }}>
                <div className="cw-row-between">
                  <span className="cw-sportline"><span className="mx-group-icon" style={{ background: `color-mix(in srgb, ${c} 16%, transparent)` }}><i style={{ background: c }} /></span><span className="lbl">{t.sportName.toUpperCase()}</span></span>
                  <span className="mx-badge" data-tone={tone}><i />{label}</span>
                </div>
                <div><b className="tn-name">{t.name}</b><small>{t.formatLabel} · {t.teamCount} teams</small></div>
                <div>
                  <div className="cw-row-between lbl"><span>{ready ? `${fmt(t.startsAt)} – ${fmt(t.endsAt)}` : '\u00a0'}</span><span>{t.total ? (t.status === 'up' ? `${t.total} MATCHES` : `${t.played}/${t.total} PLAYED`) : 'NO FIXTURES YET'}</span></div>
                  <div className="tn-prog"><i style={{ width: `${pct}%`, background: c }} /></div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
