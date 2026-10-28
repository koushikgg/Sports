import { formatOvers, type CricketState, type Innings } from '@sports/sports-engine/src/cricket';
import { economy, howOut, nameOf, strikeRate, surnameOf, type Names } from '@sports/sports-engine/src/cricket-view';

const cols = ['R', 'B', '4S', '6S', 'SR'];
const bowlCols = ['O', 'M', 'R', 'W', 'ECON'];

function InningsCard({ s, inn, names, live }: { s: CricketState; inn: Innings; names: Names; live: boolean }) {
  const bat = s.teams.find((t) => t.id === inn.battingTeamId)!;
  const bowl = s.teams.find((t) => t.id === inn.bowlingTeamId)!;
  const e = inn.extras;
  const yet = (s.squads[inn.battingTeamId] ?? []).filter((id) => !inn.order.includes(id));

  return (
    <>
      <div className="sc-cardcol">
        <div className="sc-cardhead">
          <h2>{bat.name}</h2>
          <span className="mono">
            {inn.runs}/{inn.wickets} <small>({formatOvers(inn.legalBalls)} OV)</small>
          </span>
        </div>
        <div className="sc-card sc-table">
          <div>
            <div className="sc-trow lbl lbl-sm" data-head="true">
              <span>BATTER</span>
              {cols.map((c) => <span key={c}>{c}</span>)}
            </div>
            {inn.order.map((id) => {
              const b = inn.batters[id]!;
              const batting = live && (inn.striker === id || inn.nonStriker === id);
              const notOut = !b.out;
              return (
                <div key={id} className="sc-trow" data-live={batting || undefined}>
                  <div className="who">
                    <b>{nameOf(names, id)}</b>
                    <span data-notout={notOut || undefined}>{notOut ? 'not out' : howOut(b, names, inn)}</span>
                  </div>
                  <span>{b.runs}</span>
                  <span>{b.balls}</span>
                  <span>{b.fours}</span>
                  <span>{b.sixes}</span>
                  <span>{strikeRate(b, '—')}</span>
                </div>
              );
            })}
            <div className="sc-extras">
              <span>
                Extras <small>WD {e.wd} · NB {e.nb} · B {e.b} · LB {e.lb}{e.pen ? ` · P ${e.pen}` : ''}</small>
              </span>
              <b>{e.wd + e.nb + e.b + e.lb + e.pen}</b>
            </div>
            <div className="sc-yet">Yet to bat: {yet.length ? yet.map((id) => nameOf(names, id)).join(', ') : 'None'}</div>
          </div>
        </div>
        <div className="sc-card sc-fow">
          <span className="lbl lbl-sm">FALL OF WICKETS</span>
          <div>
            {inn.fow.length === 0 && <span className="lbl">NONE YET</span>}
            {inn.fow.map((f, i) => (
              <span key={i} className="pill">{f.wickets}-{f.runs} {surnameOf(names, f.playerId)} {f.over}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="sc-cardcol">
        <div className="sc-cardhead"><h2>{bowl.name} bowling</h2></div>
        <div className="sc-card sc-table" data-kind="bowl">
          <div>
            <div className="sc-trow lbl lbl-sm" data-head="true">
              <span>BOWLER</span>
              {bowlCols.map((c) => <span key={c}>{c}</span>)}
            </div>
            {Object.values(inn.bowlers).map((b) => (
              <div key={b.id} className="sc-trow" data-live={(live && inn.bowler === b.id) || undefined}>
                <div className="who"><b>{nameOf(names, b.id)}</b></div>
                <span>{formatOvers(b.legalBalls)}</span>
                <span>{b.maidens}</span>
                <span>{b.runs}</span>
                <span>{b.wickets}</span>
                <span>{economy(b)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export function ScorerCard({ s, names }: { s: CricketState; names: Names }) {
  if (s.innings.length === 0) {
    return (
      <div className="sc-cardwrap">
        <div className="sc-card sc-inn" style={{ flex: '1 1 100%' }}>
          <div>
            <span className="lbl lbl-sm">SCORECARD</span>
            <b>The scorecard appears once the first innings starts.</b>
          </div>
        </div>
      </div>
    );
  }
  // Newest innings first, like the live view.
  const order = s.innings.map((inn, i) => ({ inn, i })).reverse();
  return (
    <div className="sc-cardwrap">
      {order.map(({ inn, i }) => (
        <div key={i} style={{ display: 'contents' }}>
          {s.innings.length > 1 && (
            <div className="sc-cardhead" style={{ flex: '1 1 100%' }}>
              <span className="lbl">INNINGS {i + 1}{inn.closed && inn.closeReason ? ` · ${inn.closeReason.replace('_', ' ').toUpperCase()}` : ''}</span>
            </div>
          )}
          <InningsCard s={s} inn={inn} names={names} live={!inn.closed && !s.result} />
        </div>
      ))}
    </div>
  );
}
