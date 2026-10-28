import type { Metadata } from 'next';
import Link from 'next/link';
import '@/components/matches/matches.css';
import '@/components/sports/sports.css';
import { sportColor, statusGroup } from '@/components/matches/model';
import { RatchShell } from '@/components/ratch/shell';
import { getAllSports, listMatchCards } from '@/lib/queries';
import { getShellUser } from '@/lib/shell-user';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sports', description: 'Every sport we play, with live scores and fixtures.' };

export default async function SportsIndex() {
  const [{ user }, sports, matches] = await Promise.all([getShellUser(), getAllSports(), listMatchCards({ limit: 200 })]);

  return (
    <RatchShell active="matches" user={user}>
      <div className="mx-head">
        <div>
          <span className="lbl">BROWSE</span>
          <h1>Sports</h1>
        </div>
      </div>
      <div className="si-grid">
        {sports.map((s) => {
          const color = sportColor(s.key);
          const mine = matches.filter((m) => m.sportKey === s.key);
          const n = (g: 'live' | 'up' | 'ft') => mine.filter((m) => statusGroup(m.status) === g).length;
          const body = (
            <>
              <span className="mx-group-icon sh-icon" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)` }}><i style={{ background: color }} /></span>
              <h2>{s.name}</h2>
              <div className="si-meta">
                {s.enabled ? (
                  <>
                    <span data-live={n('live') > 0 ? 'true' : undefined}>{n('live')} LIVE</span>
                    <span>{n('up')} UPCOMING</span>
                    <span>{n('ft')} RESULTS</span>
                  </>
                ) : (
                  <span>COMING SOON</span>
                )}
              </div>
            </>
          );
          return s.enabled ? (
            <Link key={s.id} href={`/sports/${s.key}`} className="si-tile">{body}</Link>
          ) : (
            <div key={s.id} className="si-tile" aria-disabled="true">{body}</div>
          );
        })}
      </div>
    </RatchShell>
  );
}
