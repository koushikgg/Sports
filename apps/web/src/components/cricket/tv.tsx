import { currentInnings, formatOvers, runRate, type CricketState } from '@sports/sports-engine/src/cricket';
import { ChipStrip, nameOf, type Names } from './shared';

/** Big-screen layout: readable from across the room. */
export function CricketTv({ state, names, status }: { state: CricketState; names: Names; status: string }) {
  const inn = currentInnings(state);
  if (!inn) return <p className="text-center text-5xl text-muted">{status}</p>;

  const team = state.teams.find((t) => t.id === inn.battingTeamId)!;
  const chasing = state.innings.length === 2 && !state.result;
  const target = state.innings[0]!.runs + 1;
  const bowler = inn.bowler ? inn.bowlers[inn.bowler] : null;
  const live = !inn.closed && !state.result;

  return (
    <div className="flex h-full flex-col justify-between">
      <div className="text-center">
        <div className="text-4xl text-muted">{team.name}</div>
        <div className="font-mono text-[11rem] font-bold leading-none tabular-nums">
          {inn.runs}<span className="text-muted">/{inn.wickets}</span>
        </div>
        <div className="mt-2 text-5xl text-muted tabular-nums">
          {formatOvers(inn.legalBalls)} <span className="text-3xl">/ {state.overs} ov</span>
          <span className="mx-6 text-3xl">CRR {runRate(inn).toFixed(2)}</span>
          {chasing && <span className="text-3xl text-brand">Target {target}</span>}
        </div>
      </div>

      {live && (
        <div className="grid grid-cols-3 gap-8 text-4xl">
          {[inn.striker, inn.nonStriker].map((id, i) => {
            const b = id ? inn.batters[id] : null;
            return (
              <div key={i} className={`rounded-2xl border-2 p-6 ${i === 0 ? 'border-brand' : 'border-border'}`}>
                <div className={`truncate ${i === 0 ? 'text-brand' : ''}`}>{nameOf(names, id)}{i === 0 && ' *'}</div>
                <div className="mt-2 font-mono text-6xl tabular-nums">{b?.runs ?? 0}<span className="ml-3 text-3xl text-muted">({b?.balls ?? 0})</span></div>
              </div>
            );
          })}
          <div className="rounded-2xl border-2 border-border p-6">
            <div className="truncate">{nameOf(names, inn.bowler)}</div>
            <div className="mt-2 font-mono text-6xl tabular-nums">
              {bowler ? `${bowler.wickets}-${bowler.runs}` : '—'}
              <span className="ml-3 text-3xl text-muted">{bowler ? formatOvers(bowler.legalBalls) : ''}</span>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {live && <ChipStrip chips={inn.thisOver} size="lg" className="justify-center" />}
        <p className="text-center text-5xl font-semibold text-brand">{status}</p>
      </div>
    </div>
  );
}
