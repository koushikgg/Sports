/** League table from finished matches. Pure, so it is testable without a database. */

export interface TeamMatchStats {
  runsFor: number;
  ballsFaced: number;
  runsAgainst: number;
  ballsBowled: number;
}

export interface FinishedMatch {
  teamAId: string;
  teamBId: string;
  /** null = tie or no result */
  winnerTeamId: string | null;
  outcome: 'win' | 'tie' | 'no_result';
  /** Cricket only: used for net run rate. */
  stats?: Record<string, TeamMatchStats>;
  /** Goal sports: goals each team scored and conceded, used for goal difference. */
  goals?: Record<string, { for: number; against: number }>;
}

export interface Points {
  win: number;
  tie: number;
  noResult: number;
}

export interface Standing {
  teamId: string;
  played: number;
  won: number;
  lost: number;
  tied: number;
  noResult: number;
  points: number;
  /** Net run rate (cricket), goal difference (foosball) or 0. */
  diff: number;
  /** Most recent results, newest last: W, L or T. */
  form: ('W' | 'L' | 'T')[];
}

const BALLS = 6;

export function computeStandings(
  teamIds: string[],
  matches: FinishedMatch[],
  points: Points,
  tiebreak: string,
): Standing[] {
  const rows = new Map<string, Standing & { sums: TeamMatchStats; goalDiff: number }>(
    teamIds.map((id) => [id, { teamId: id, played: 0, won: 0, lost: 0, tied: 0, noResult: 0, points: 0, diff: 0, form: [], sums: { runsFor: 0, ballsFaced: 0, runsAgainst: 0, ballsBowled: 0 }, goalDiff: 0 }]),
  );

  for (const m of matches) {
    for (const id of [m.teamAId, m.teamBId]) {
      const r = rows.get(id);
      if (!r) continue;
      r.played += 1;
      if (m.outcome === 'win') {
        const won = m.winnerTeamId === id;
        r[won ? 'won' : 'lost'] += 1;
        r.points += won ? points.win : 0;
        r.form.push(won ? 'W' : 'L');
      } else if (m.outcome === 'tie') {
        r.tied += 1; r.points += points.tie; r.form.push('T');
      } else {
        r.noResult += 1; r.points += points.noResult;
      }
      const gl = m.goals?.[id];
      if (gl) r.goalDiff += gl.for - gl.against;
      const st = m.stats?.[id];
      if (st) {
        r.sums.runsFor += st.runsFor; r.sums.ballsFaced += st.ballsFaced;
        r.sums.runsAgainst += st.runsAgainst; r.sums.ballsBowled += st.ballsBowled;
      }
    }
  }

  const list = [...rows.values()].map((r) => {
    const { sums } = r;
    const nrr = sums.ballsFaced && sums.ballsBowled
      ? (sums.runsFor * BALLS) / sums.ballsFaced - (sums.runsAgainst * BALLS) / sums.ballsBowled
      : 0;
    return { ...r, diff: nrr || r.goalDiff, form: r.form.slice(-5) };
  });

  // wins between the teams that are level on points, for the head-to-head tiebreak
  const h2h = (a: string, b: string) =>
    matches.reduce((n, m) => {
      const between = (m.teamAId === a && m.teamBId === b) || (m.teamAId === b && m.teamBId === a);
      return between && m.outcome === 'win' ? n + (m.winnerTeamId === a ? 1 : m.winnerTeamId === b ? -1 : 0) : n;
    }, 0);

  list.sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    if (tiebreak === 'WINS' && y.won !== x.won) return y.won - x.won;
    if (tiebreak === 'HEAD TO HEAD') {
      const d = h2h(y.teamId, x.teamId);
      if (d !== 0) return d;
    }
    return y.diff - x.diff || y.won - x.won;
  });

  return list.map(({ sums: _sums, goalDiff: _g, ...r }) => r);
}
