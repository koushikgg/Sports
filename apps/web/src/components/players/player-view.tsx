import { matchHref } from '@/lib/match-href';
import Link from 'next/link';
import { Avatar } from '@/components/ratch/avatar';
import { bowlText, summarize, type PlayerProfile } from '@/lib/player-stats';
import './profile.css';

const stack = (i: number, n: number) => (n === 1 ? '20px' : i === 0 ? '20px 20px 6px 6px' : i === n - 1 ? '6px 6px 20px 20px' : '6px');
const BackArrow = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
);
export const ProfileBack = ({ href, label }: { href: string; label: string }) => <Link href={href} className="pf-back"><BackArrow />{label}</Link>;

/** The player page from the design: identity, sport tabs, headline numbers and the match list. `identity` replaces the default name block (the My profile editor uses it). */
export function PlayerView({ profile, sport, basePath, identity }: { profile: PlayerProfile; sport?: string; basePath: string; identity?: React.ReactNode }) {
  const sports = [...new Map(profile.matches.map((m) => [m.sportKey, m.sport])).entries()].map(([key, name]) => ({ key, name, n: profile.matches.filter((m) => m.sportKey === key).length }));
  const active = sports.find((s) => s.key === sport)?.key ?? sports[0]?.key ?? 'cricket';
  const list = profile.matches.filter((m) => m.sportKey === active);
  const { groups } = summarize(active, list);
  const sportName = sports.find((s) => s.key === active)?.name ?? 'Cricket';

  return (
    <div className="pf-body">
      <section className="pf-hero">
        {identity ?? (
          <div className="pf-id">
            <Avatar name={profile.name} size={96} src={profile.avatar} />
            <div className="pf-who">
              <span className="lbl">PLAYER{profile.role ? ` · ${profile.role}` : ''}</span>
              <h1>{profile.name}</h1>
              {profile.teams.length > 0 && (
                <div className="pf-chips">
                  {profile.teams.map((t) => (
                    <Link key={t.id} href={`/teams/${t.id}`} className="pf-chip" data-k={t.isCaptain ? 'cap' : t.isManager ? 'mgr' : undefined}>
                      {t.isCaptain ? `CAPTAIN · ${t.name.toUpperCase()}` : t.isManager ? `MANAGER · ${t.name.toUpperCase()}` : t.name.toUpperCase()}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {sports.length > 0 && (
          <div className="pf-tabs">
            {sports.map((s) => (
              <Link key={s.key} href={`${basePath}?sport=${s.key}`} scroll={false} className="pf-tab" data-on={s.key === active ? '' : undefined}><i />{s.name.toUpperCase()}<span>{s.n}</span></Link>
            ))}
          </div>
        )}
        {groups.map((g) => (
          <div key={g.title ?? 'all'} className="pf-group">
            {g.title && <b>{g.title}</b>}
            <div className="pf-kpis">
              {g.kpis.map((k) => <div key={k.k} className="pf-kpi" data-accent={k.accent ? '' : undefined}><span>{k.k}</span><span>{k.v}</span></div>)}
            </div>
          </div>
        ))}
      </section>

      <div className="pf-list" style={{ marginTop: 24 }}>
        <span className="pf-title">{list.length ? `${sportName.toUpperCase()} MATCHES · ${list.length}` : 'MATCHES'}</span>
        {list.length === 0 && <div className="pf-empty">No matches played yet.</div>}
        {list.map((m, i) => (
          <Link key={m.id} href={matchHref(m)} className="pf-row" style={{ borderRadius: stack(i, list.length) }}>
            <span className="pf-res" data-r={m.result}>{m.result}</span>
            <span className="pf-date">{m.date}</span>
            <span className="pf-vs"><b>{m.team} vs {m.opp}</b><small>{m.comp}</small></span>
            <span className="pf-score">{m.score || '—'}</span>
            <span className="pf-line">
              {m.bat ? <span>{m.bat.runs}{m.bat.notOut ? '*' : ''} ({m.bat.balls})</span> : <span style={{ color: 'var(--text-tertiary)' }}>DNB</span>}
              {m.bowl && <small>{bowlText(m.bowl)}</small>}
              {m.catches > 0 && <small>{m.catches} {m.catches === 1 ? 'CATCH' : 'CATCHES'}</small>}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
