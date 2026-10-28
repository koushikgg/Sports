import { formatOvers, type CricketState, type Innings } from '@sports/sports-engine/src/cricket';
import { Card } from '@/components/ui';
import { howOut, nameOf, type Names } from './shared';

const sr = (runs: number, balls: number) => (balls ? ((runs / balls) * 100).toFixed(1) : '—');
const econ = (runs: number, legal: number) => (legal ? ((runs * 6) / legal).toFixed(2) : '—');

function InningsCard({ s, inn, names }: { s: CricketState; inn: Innings; names: Names }) {
  const team = s.teams.find((t) => t.id === inn.battingTeamId)!;
  const e = inn.extras;
  const extrasTotal = e.wd + e.nb + e.b + e.lb + e.pen;
  const dnb = (s.squads[inn.battingTeamId] ?? []).filter((id) => !inn.order.includes(id));

  return (
    <Card className="space-y-4 p-0">
      <div className="flex items-baseline justify-between border-b border-border px-4 py-3">
        <h3 className="font-semibold">{team.name}</h3>
        <span className="font-mono">
          {inn.runs}/{inn.wickets} <span className="text-sm text-muted">({formatOvers(inn.legalBalls)} ov)</span>
        </span>
      </div>

      <div className="overflow-x-auto px-4">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr><th className="py-1 font-normal">Batter</th><th className="text-right font-normal">R</th><th className="text-right font-normal">B</th><th className="text-right font-normal">4s</th><th className="text-right font-normal">6s</th><th className="text-right font-normal">SR</th></tr>
          </thead>
          <tbody>
            {inn.order.map((id) => {
              const b = inn.batters[id]!;
              return (
                <tr key={id} className="border-t border-border/50">
                  <td className="py-1.5">
                    <div className="font-medium">{nameOf(names, id)}</div>
                    <div className="text-xs text-muted">{howOut(b, names, inn)}</div>
                  </td>
                  <td className="text-right font-semibold">{b.runs}</td>
                  <td className="text-right">{b.balls}</td>
                  <td className="text-right">{b.fours}</td>
                  <td className="text-right">{b.sixes}</td>
                  <td className="text-right text-muted">{sr(b.runs, b.balls)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-1 px-4 text-sm">
        <div><span className="text-muted">Extras</span> {extrasTotal} <span className="text-xs text-muted">(b {e.b}, lb {e.lb}, wd {e.wd}, nb {e.nb}{e.pen ? `, pen ${e.pen}` : ''})</span></div>
        {dnb.length > 0 && <div className="text-xs text-muted">Did not bat: {dnb.map((id) => nameOf(names, id)).join(', ')}</div>}
        {inn.fow.length > 0 && (
          <div className="text-xs text-muted">
            FoW: {inn.fow.map((f) => `${f.runs}-${f.wickets} (${nameOf(names, f.playerId)}, ${f.over})`).join(' · ')}
          </div>
        )}
      </div>

      <div className="overflow-x-auto px-4 pb-4">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr><th className="py-1 font-normal">Bowler</th><th className="text-right font-normal">O</th><th className="text-right font-normal">M</th><th className="text-right font-normal">R</th><th className="text-right font-normal">W</th><th className="text-right font-normal">Econ</th></tr>
          </thead>
          <tbody>
            {Object.values(inn.bowlers).map((b) => (
              <tr key={b.id} className="border-t border-border/50">
                <td className="py-1.5 font-medium">{nameOf(names, b.id)}</td>
                <td className="text-right">{formatOvers(b.legalBalls)}</td>
                <td className="text-right">{b.maidens}</td>
                <td className="text-right">{b.runs}</td>
                <td className="text-right font-semibold">{b.wickets}</td>
                <td className="text-right text-muted">{econ(b.runs, b.legalBalls)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function CricketScorecard({ state, names }: { state: CricketState; names: Names }) {
  if (state.innings.length === 0) return <p className="text-sm text-muted">The scorecard appears once the innings starts.</p>;
  return (
    <div className="space-y-4">
      {state.innings.map((inn, i) => <InningsCard key={i} s={state} inn={inn} names={names} />)}
    </div>
  );
}
