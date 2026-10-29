import type { Metadata } from 'next';
import Link from 'next/link';
import { asc, count, eq, getDb, sports, teamMembers, teams } from '@sports/db';
import { Button, Input, Label, Select } from '@/components/ui';
import { createTeam } from './actions';
import { teamLogoSrc } from '@/lib/avatar';
import { sportColor, teamCode, teamTint } from '@/components/matches/model';
import { RatchShell } from '@/components/ratch/shell';
import '@/components/tournaments/tournaments.css';
import { getShellUser } from '@/lib/shell-user';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Teams', robots: { index: false } };

export default async function TeamsPage() {
  const { user } = await getShellUser();
  const db = getDb();
  const [rows, sizes, sportRows] = await Promise.all([
    db.select({ id: teams.id, name: teams.name, shortName: teams.shortName, sport: sports.name, sportKey: sports.key, logoAt: teams.logoUpdatedAt }).from(teams).innerJoin(sports, eq(sports.id, teams.sportId)).orderBy(asc(sports.name), asc(teams.name)),
    db.select({ teamId: teamMembers.teamId, n: count() }).from(teamMembers).groupBy(teamMembers.teamId),
    user?.role === 'admin' ? db.select().from(sports).orderBy(asc(sports.name)) : Promise.resolve([]),
  ]);
  const size = new Map(sizes.map((s) => [s.teamId, Number(s.n)]));

  return (
    <RatchShell active="teams" user={user}>
      <div className="mx-head">
        <div><span className="lbl">DIRECTORY</span><h1>Teams</h1></div>
      </div>
      {user?.role === 'admin' && (
        <details className="mb-6 rounded-2xl bg-surface p-5">
          <summary className="cursor-pointer font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">+ Add team</summary>
          <form action={createTeam} className="mt-4 grid gap-3 sm:grid-cols-4 sm:items-end">
            <Label text="Sport">
              <Select name="sportId" required>{sportRows.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            </Label>
            <Label text="Name"><Input name="name" required /></Label>
            <Label text="Short (≤5)"><Input name="shortName" maxLength={5} /></Label>
            <Button>Create team</Button>
          </form>
        </details>
      )}
      {rows.length === 0 ? <p className="tn-empty">No teams yet.</p> : (
        <div className="dr-grid">
          {rows.map((t) => {
            const tint = teamTint(t.name);
            const body = (
              <>
                {t.logoAt
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={teamLogoSrc(t.id, t.logoAt)!} alt="" className="cw-code" style={{ width: 44, height: 44, objectFit: 'cover' }} />
                  : <span className="cw-code" style={{ width: 44, height: 44, background: tint.bg, color: tint.fg, fontSize: 12 }}>{teamCode(t.name, t.shortName)}</span>}
                <span><b>{t.name}</b><small><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 3, background: sportColor(t.sportKey), marginRight: 6 }} />{t.sport} · {size.get(t.id) ?? 0} players</small></span>
              </>
            );
            return <Link key={t.id} href={`/teams/${t.id}`} className="dr-card">{body}</Link>;
          })}
        </div>
      )}
    </RatchShell>
  );
}
