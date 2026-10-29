import type { StandingRow } from '@sports/scoring';
import { teamCode, teamTint } from '@/components/matches/model';

/** League table. Cricket shows net run rate; other sports have no difference figure yet. */
export function StandingsTable({ rows, qualify, showQualify, cricket }: { rows: StandingRow[]; qualify: number; showQualify: boolean; cricket: boolean }) {
  if (rows.length === 0) return <p className="tn-empty">No teams in this tournament yet.</p>;
  const anyPlayed = rows.some((r) => r.played > 0);
  const cut = Math.min(qualify, rows.length);
  return (
    <div className="tn-scroll">
      <div className="tn-table" role="table" aria-label="Standings">
        <div className="tn-trow tn-thead lbl lbl-sm" role="row">
          <span>POS</span><span>TEAM</span><span>P</span><span>W</span><span>L</span><span>{cricket ? 'NRR' : 'DIFF'}</span><span className="tn-form">FORM</span><span>PTS</span>
        </div>
        {rows.map((r, i) => {
          const tint = teamTint(r.name);
          const q = showQualify && i < qualify;
          return (
            <div key={r.teamId} className="tn-trow" data-q={q ? 'true' : undefined} data-cut={q && i === cut - 1 && rows.length > cut ? 'true' : undefined} role="row">
              <span className="tn-pos">{i + 1}</span>
              <span className="tn-team"><i style={{ background: tint.bg, color: tint.fg }}>{teamCode(r.name, r.short)}</i><b>{r.name}</b></span>
              <span>{r.played}</span><span>{r.won}</span><span>{r.lost}</span>
              <span data-neg={cricket && r.diff < 0 ? 'true' : undefined}>{cricket && r.played ? `${r.diff >= 0 ? '+' : ''}${r.diff.toFixed(2)}` : '—'}</span>
              <span className="tn-form">{r.form.map((f, k) => <i key={k} data-r={f}>{f}</i>)}</span>
              <span className="tn-pts">{r.points}</span>
            </div>
          );
        })}
        {showQualify && <p className="tn-legend"><i />{qualify === 2 ? 'Top 2 play the final' : `Top ${qualify} play the semi-finals, then the final`}{anyPlayed ? '' : '. The order settles as matches are played'}</p>}
      </div>
    </div>
  );
}
