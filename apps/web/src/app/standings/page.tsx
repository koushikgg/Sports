import type { Metadata } from 'next';
import Link from 'next/link';
import { getTournamentDetail, listTournaments } from '@sports/scoring';
import { sportColor } from '@/components/matches/model';
import { RatchShell } from '@/components/ratch/shell';
import { StandingsTable } from '@/components/tournaments/standings-table';
import '@/components/tournaments/tournaments.css';
import { getShellUser } from '@/lib/shell-user';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Standings', description: 'League tables for every tournament.' };

export default async function StandingsPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { user } = await getShellUser();
  const { t } = await searchParams;
  const list = await listTournaments(!!user);
  const selected = list.find((x) => x.id === t) ?? list.find((x) => x.status === 'live') ?? list[0];
  const detail = selected ? await getTournamentDetail(selected.id, !!user) : null;

  return (
    <RatchShell active="standings" user={user}>
      <div className="mx-head">
        <div>
          <span className="lbl">LEAGUE TABLES</span>
          <h1>Standings</h1>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="tn-empty">No tournaments yet. Standings appear once a tournament has results.</p>
      ) : (
        <>
          <div className="mx-tabs-sport" role="group" aria-label="Tournament">
            {list.map((x) => (
              <Link key={x.id} href={`/standings?t=${x.id}`} className="mx-sporttab" data-on={x.id === selected?.id ? 'true' : undefined} aria-current={x.id === selected?.id ? 'page' : undefined}>
                <i style={{ background: sportColor(x.sportKey) }} />{x.name.toUpperCase()}
              </Link>
            ))}
          </div>
          {detail && (
            <section className="tn-detail" style={{ ['--tn' as string]: sportColor(detail.sportKey) }}>
              <div className="tn-hero">
                <div className="tn-meta"><span className="lbl" style={{ color: sportColor(detail.sportKey) }}>{detail.sportName.toUpperCase()}</span><span className="lbl">{detail.formatLabel}</span></div>
                <h2>{detail.name}</h2>
                <p className="tn-note" style={{ margin: 0 }}>{detail.played} of {detail.total || '—'} matches played · {detail.tiebreak === 'NRR' ? 'ties broken by net run rate' : `tiebreak: ${detail.tiebreak.toLowerCase()}`}</p>
              </div>
              <div className="tn-pane">
                <StandingsTable rows={detail.standings} qualify={detail.qualify} showQualify={detail.formatKey === 'lk' || detail.formatKey === 'groups'} cricket={detail.sportKey === 'cricket'} />
              </div>
            </section>
          )}
        </>
      )}
    </RatchShell>
  );
}
