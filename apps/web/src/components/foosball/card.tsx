import { currentGame, gamesToWin, type FoosballState } from '@sports/sports-engine/src/foosball';
import './foosball.css';

/** Game-by-game card for a foosball match page. */
export function FoosballCard({ s }: { s: FoosballState }) {
  const cur = currentGame(s);
  const rows = s.games.filter((g) => g.done || g.a + g.b > 0 || s.games.length === 1);
  return (
    <section className="fb-card" aria-label="Games">
      <div className="fb-card-head"><span className="lbl">{s.bestOf === 1 ? 'SINGLE GAME' : `BEST OF ${s.bestOf}`} · FIRST TO {s.firstTo}{s.winBy === 2 ? ', WIN BY 2' : ''}</span><span className="lbl">{s.bestOf > 1 ? `${gamesToWin(s.bestOf)} GAMES WIN` : ''}</span></div>
      <div className="fb-table" role="table">
        <div className="fb-trow fb-thead lbl lbl-sm" role="row"><span>GAME</span><span>{s.teams[0]!.name.toUpperCase()}</span><span>{s.teams[1]!.name.toUpperCase()}</span><span>WINNER</span></div>
        {rows.map((g, i) => (
          <div key={i} className="fb-trow" role="row" data-live={!g.done && !s.result ? 'true' : undefined}>
            <span>{i + 1}</span>
            <b data-win={g.winner === 'a' ? 'true' : undefined}>{g.a}</b>
            <b data-win={g.winner === 'b' ? 'true' : undefined}>{g.b}</b>
            <span>{g.winner ? s.teams[g.winner === 'a' ? 0 : 1]!.name : !s.result && g === cur ? 'In play' : '—'}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
