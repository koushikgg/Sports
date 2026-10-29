import { alias, asc, desc, eq, getDb, inArray, matchLineups, matchStates, matches, players, sports, sql, teamManagers, teamMembers, teams, tournaments, users } from '@sports/db';
import { avatarSrc } from '@/lib/avatar';

export interface PlayerMatch {
  id: string;
  sportKey: string;
  /** The tournament it belongs to, so its page can be found under it. */
  tournamentId: string | null;
  sport: string;
  result: 'W' | 'L' | 'T';
  date: string;
  team: string;
  opp: string;
  comp: string;
  /** "172/6 – 158/9", or an empty string when the state is missing. */
  score: string;
  /** Batting line: runs, balls, and whether they were not out. null when they did not bat. */
  bat: { runs: number; balls: number; notOut: boolean } | null;
  /** Bowling figures in legal balls. null when they did not bowl. */
  bowl: { balls: number; runs: number; wkts: number; maidens: number } | null;
  catches: number;
}

export interface PlayerProfile {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  employeeId: string | null;
  hasAccount: boolean;
  avatar: string | null;
  teams: { id: string; name: string; isCaptain: boolean; isManager: boolean }[];
  matches: PlayerMatch[];
}

const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' });

interface InningsRow {
  team: string; runs: number; wkts: number;
  mine: { runs: number; balls: number; out: unknown } | null;
  bowl: { legalBalls: number; runs: number; wickets: number; maidens: number } | null;
  catches: number;
}

/** A player with their teams and completed matches. Batting figures come from the scoring log's batter stats. */
export async function getPlayerProfile(playerId: string): Promise<PlayerProfile | null> {
  const db = getDb();
  const [p] = await db
    .select({ id: players.id, name: players.name, role: players.role, employeeId: players.employeeId, userId: players.userId, email: users.email, playerEmail: players.email, at: users.avatarUpdatedAt, has: sql<boolean>`${users.avatarUrl} is not null` })
    .from(players)
    .leftJoin(users, eq(users.id, players.userId))
    .where(eq(players.id, playerId))
    .limit(1);
  if (!p) return null;

  const [memberships, managed, lineups] = await Promise.all([
    db.select({ id: teams.id, name: teams.name, isCaptain: teamMembers.isCaptain }).from(teamMembers).innerJoin(teams, eq(teams.id, teamMembers.teamId)).where(eq(teamMembers.playerId, playerId)).orderBy(asc(teams.name)),
    p.userId ? db.select({ id: teams.id, name: teams.name }).from(teamManagers).innerJoin(teams, eq(teams.id, teamManagers.teamId)).where(eq(teamManagers.userId, p.userId)) : Promise.resolve([]),
    db.select({ matchId: matchLineups.matchId, teamId: matchLineups.teamId }).from(matchLineups).where(eq(matchLineups.playerId, playerId)),
  ]);
  const managerOf = new Set(managed.map((m) => m.id));
  const teamList = [...memberships.map((m) => ({ ...m, isManager: managerOf.has(m.id) })), ...managed.filter((m) => !memberships.some((x) => x.id === m.id)).map((m) => ({ ...m, isCaptain: false, isManager: true }))];

  const teamIds = memberships.map((m) => m.id);
  const lineupMatchIds = lineups.map((l) => l.matchId);
  const A = alias(teams, 'ta');
  const B = alias(teams, 'tb');
  const mine = sql`i->'batters'->${playerId}::text`;
  const rows = teamIds.length || lineupMatchIds.length
    ? await db
        .select({
          id: matches.id, sportKey: sports.key, tournamentId: matches.tournamentId, sport: sports.name, teamAId: matches.teamAId, teamBId: matches.teamBId, a: A.name, b: B.name,
          at: sql<string>`coalesce(${matches.scheduledAt}, ${matches.createdAt})`, result: matches.result, tournament: tournaments.name,
          inn: sql<InningsRow[]>`(select coalesce(jsonb_agg(jsonb_build_object('team', i->>'battingTeamId', 'runs', i->'runs', 'wkts', i->'wickets', 'mine', ${mine}, 'bowl', i->'bowlers'->${playerId}::text, 'catches', (select count(*) from jsonb_each(i->'batters') b where b.value->'out'->>'kind' = 'caught' and b.value->'out'->>'fielderId' = ${playerId}::text))), '[]'::jsonb) from jsonb_array_elements(${matchStates.state}->'innings') i)`,
        })
        .from(matches)
        .innerJoin(sports, eq(sports.id, matches.sportId))
        .innerJoin(A, eq(A.id, matches.teamAId))
        .innerJoin(B, eq(B.id, matches.teamBId))
        .leftJoin(tournaments, eq(tournaments.id, matches.tournamentId))
        .leftJoin(matchStates, eq(matchStates.matchId, matches.id))
        .where(sql`${matches.status} = 'completed' and (${lineupMatchIds.length ? inArray(matches.id, lineupMatchIds) : sql`false`} or ${teamIds.length ? sql`(${inArray(matches.teamAId, teamIds)} or ${inArray(matches.teamBId, teamIds)})` : sql`false`})`)
        .orderBy(desc(sql`coalesce(${matches.scheduledAt}, ${matches.createdAt})`))
        .limit(60)
    : [];

  // when a match has a lineup for the player's team, only people in it played
  const lineupFor = rows.length
    ? await db.select({ matchId: matchLineups.matchId, teamId: matchLineups.teamId, playerId: matchLineups.playerId }).from(matchLineups).where(inArray(matchLineups.matchId, rows.map((r) => r.id)))
    : [];

  const out: PlayerMatch[] = [];
  for (const r of rows) {
    const inLineup = lineups.find((l) => l.matchId === r.id);
    const myTeam = inLineup?.teamId ?? (teamIds.includes(r.teamAId) ? r.teamAId : r.teamBId);
    if (!inLineup && lineupFor.some((l) => l.matchId === r.id && l.teamId === myTeam)) continue;
    const inn = r.inn ?? [];
    const side = (t: string) => { const i = inn.find((x) => x.team === t); return i ? `${i.runs}/${i.wkts}` : null; };
    const opponent = myTeam === r.teamAId ? r.teamBId : r.teamAId;
    const batted = inn.map((i) => i.mine).filter((m): m is NonNullable<InningsRow['mine']> => !!m);
    const bowled = inn.map((i) => i.bowl).filter((b): b is NonNullable<InningsRow['bowl']> => !!b && b.legalBalls > 0);
    const winner = (r.result as { winnerTeamId?: string } | null)?.winnerTeamId;
    out.push({
      id: r.id, sportKey: r.sportKey, tournamentId: r.tournamentId, sport: r.sport,
      result: winner ? (winner === myTeam ? 'W' : 'L') : 'T',
      date: day.format(new Date(r.at)).toUpperCase(),
      team: myTeam === r.teamAId ? r.a : r.b, opp: myTeam === r.teamAId ? r.b : r.a,
      comp: `${r.sport} · ${r.tournament ?? 'Friendly'}`.toUpperCase(),
      score: side(myTeam) && side(opponent) ? `${side(myTeam)} – ${side(opponent)}` : '',
      bat: batted.length ? { runs: batted.reduce((t, m) => t + m.runs, 0), balls: batted.reduce((t, m) => t + m.balls, 0), notOut: batted.every((m) => !m.out) } : null,
      bowl: bowled.length ? { balls: bowled.reduce((t, b) => t + b.legalBalls, 0), runs: bowled.reduce((t, b) => t + b.runs, 0), wkts: bowled.reduce((t, b) => t + b.wickets, 0), maidens: bowled.reduce((t, b) => t + b.maidens, 0) } : null,
      catches: inn.reduce((t, i) => t + Number(i.catches ?? 0), 0),
    });
  }

  return { id: p.id, name: p.name, role: p.role, email: p.email ?? p.playerEmail, employeeId: p.employeeId, hasAccount: !!p.userId, avatar: p.has ? avatarSrc(p.userId, p.at ?? new Date(0)) : null, teams: teamList, matches: out };
}

export interface Kpi { k: string; v: string | number; accent?: boolean }

const overs = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`;

/** Headline numbers for one sport. Cricket shows batting, bowling and fielding; other sports show results only. */
export function summarize(sportKey: string, list: PlayerMatch[]): { groups: { title: string | null; kpis: Kpi[] }[] } {
  const n = list.length;
  const won = list.filter((m) => m.result === 'W').length;
  const rate = n ? `${Math.round((won / n) * 100)}%` : '—';
  if (sportKey !== 'cricket' || n === 0) return { groups: [{ title: null, kpis: [{ k: 'MATCHES', v: n || '—' }, { k: 'WON', v: n ? won : '—' }, { k: 'WIN RATE', v: rate, accent: true }] }] };

  const bats = list.map((m) => m.bat).filter((b): b is NonNullable<PlayerMatch['bat']> => !!b);
  const runs = bats.reduce((t, b) => t + b.runs, 0);
  const balls = bats.reduce((t, b) => t + b.balls, 0);
  const outs = bats.filter((b) => !b.notOut).length;
  const high = bats.reduce<NonNullable<PlayerMatch['bat']> | null>((h, b) => (!h || b.runs > h.runs ? b : h), null);
  const bowls = list.map((m) => m.bowl).filter((b): b is NonNullable<PlayerMatch['bowl']> => !!b);
  const bBalls = bowls.reduce((t, b) => t + b.balls, 0);
  const bRuns = bowls.reduce((t, b) => t + b.runs, 0);
  const wkts = bowls.reduce((t, b) => t + b.wkts, 0);
  const best = bowls.reduce<NonNullable<PlayerMatch['bowl']> | null>((h, b) => (!h || b.wkts > h.wkts || (b.wkts === h.wkts && b.runs < h.runs) ? b : h), null);
  const groups: { title: string | null; kpis: Kpi[] }[] = [
    {
      title: 'BATTING',
      kpis: [
        { k: 'MATCHES', v: n }, { k: 'WIN RATE', v: rate, accent: true }, { k: 'RUNS', v: runs },
        { k: 'AVERAGE', v: outs ? (runs / outs).toFixed(1) : '—' },
        { k: 'STRIKE RATE', v: balls ? ((runs / balls) * 100).toFixed(1) : '—' },
        { k: 'HIGH SCORE', v: high ? `${high.runs}${high.notOut ? '*' : ''}` : '—' },
      ],
    },
  ];
  if (bowls.length) {
    groups.push({
      title: 'BOWLING',
      kpis: [
        { k: 'WICKETS', v: wkts, accent: true }, { k: 'OVERS', v: overs(bBalls) },
        { k: 'ECONOMY', v: bBalls ? ((bRuns / bBalls) * 6).toFixed(2) : '—' },
        { k: 'AVERAGE', v: wkts ? (bRuns / wkts).toFixed(1) : '—' },
        { k: 'BEST', v: best ? `${best.wkts}/${best.runs}` : '—' },
        { k: 'MAIDENS', v: bowls.reduce((t, b) => t + b.maidens, 0) },
      ],
    });
  }
  groups.push({ title: 'FIELDING', kpis: [{ k: 'CATCHES', v: list.reduce((t, m) => t + m.catches, 0) }] });
  return { groups };
}

export const bowlText = (b: NonNullable<PlayerMatch['bowl']>) => `${b.wkts}/${b.runs} (${overs(b.balls)})`;
