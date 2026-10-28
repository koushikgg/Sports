import { currentInnings, formatOvers, runRate, type CricketState } from '@sports/sports-engine/src/cricket';
import { Card } from '@/components/ui';
import { CricketScorecard } from './scorecard';
import { ChipStrip, nameOf, type Names } from './shared';

/** Public ball-by-ball view: who is at the crease, this over, then the full scorecard. */
export function CricketLive({ state, names }: { state: CricketState; names: Names }) {
  const inn = currentInnings(state);
  const live = inn && !inn.closed;

  return (
    <div className="space-y-4">
      {live && (
        <Card className="space-y-3">
          {[inn.striker, inn.nonStriker].map((id, i) =>
            id ? (
              <div key={id} className="flex justify-between text-sm">
                <span className={i === 0 ? 'font-semibold text-brand' : ''}>{nameOf(names, id)}{i === 0 && ' *'}</span>
                <span className="font-mono">{inn.batters[id]!.runs} <span className="text-muted">({inn.batters[id]!.balls})</span></span>
              </div>
            ) : null,
          )}
          {inn.bowler && (
            <div className="flex justify-between border-t border-border pt-3 text-sm">
              <span>{nameOf(names, inn.bowler)}</span>
              <span className="font-mono text-muted">
                {formatOvers(inn.bowlers[inn.bowler]!.legalBalls)}-{inn.bowlers[inn.bowler]!.maidens}-{inn.bowlers[inn.bowler]!.runs}-{inn.bowlers[inn.bowler]!.wickets}
              </span>
            </div>
          )}
          <ChipStrip chips={inn.thisOver} />
          <div className="text-xs text-muted">
            CRR {runRate(inn).toFixed(2)}
            {inn.partnership.balls > 0 && ` · Partnership ${inn.partnership.runs} (${inn.partnership.balls})`}
          </div>
        </Card>
      )}
      <CricketScorecard state={state} names={names} />
    </div>
  );
}
