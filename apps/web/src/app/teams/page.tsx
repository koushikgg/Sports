import type { Metadata } from 'next';
import Link from 'next/link';
import { asc, count, eq, getDb, sports, teamMembers, teams } from '@sports/db';
import { sportColor, teamCode, teamTint } from '@/components/matches/model';
import { RatchShell } from '@/components/ratch/shell';
import '@/components/tournaments/tournaments.css';
import { getShellUser } from '@/lib/shell-user';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Teams', robots: { index: false } };

export default async function TeamsPage() {
  const { user } = await getShellUser();
  const db = getDb();
  const [rows, sizes] = await Promise.all([
    db.select({ id: teams.id, name: teams.name, shortName: teams.shortName, sport: sports.name, sportKey: sports.key }).from(teams).innerJoin(sports, eq(sports.id, teams.sportId)).orderBy(asc(sports.name), asc(teams.name)),
    db.select({ teamId: teamMembers.teamId, n: count() }).from(teamMembers).groupBy(teamMembers.teamId),
  ]);
  const size = new Map(sizes.map((s) => [s.teamId, Number(s.n)]));

  return (
    <RatchShell active="teams" user={user}>
      <div className="mx-head">
        <div><span className="lbl">DIRECTORY</span><h1>Teams</h1></div>
        {user?.role === 'admin' && <Link href="/admin/teams" className="mx-btn mx-btn-lg" data-variant="gray">MANAGE TEAMS</Link>}
      </div>
      {rows.length === 0 ? <p className="tn-empty">No teams yet.</p> : (
        <div className="dr-grid">
          {rows.map((t) => {
            const tint = teamTint(t.name);
            const body = (
              <>
                <span className="cw-code" style={{ width: 44, height: 44, background: tint.bg, color: tint.fg, fontSize: 12 }}>{teamCode(t.name, t.shortName)}</span>
                <span><b>{t.name}</b><small><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 3, background: sportColor(t.sportKey), marginRight: 6 }} />{t.sport} · {size.get(t.id) ?? 0} players</small></span>
              </>
            );
            return user?.role === 'admin' ? <Link key={t.id} href={`/admin/teams/${t.id}`} className="dr-card">{body}</Link> : <div key={t.id} className="dr-card">{body}</div>;
          })}
        </div>
      )}
    </RatchShell>
  );
}
