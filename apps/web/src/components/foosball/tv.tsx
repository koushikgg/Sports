import { currentGame, gamesToWin, type FoosballState } from '@sports/sports-engine/src/foosball';

/** Big-screen layout for foosball: names, the current game's goals and the games won. */
export function FoosballTv({ state, status }: { state: FoosballState; status: string }) {
  const g = currentGame(state);
  const need = gamesToWin(state.bestOf);
  return (
    <div className="flex h-full flex-col justify-between">
      <div className="grid flex-1 grid-cols-2 items-center gap-12 text-center">
        {state.teams.map((t, i) => {
          const k = i === 0 ? 'a' : 'b';
          return (
            <div key={t.id}>
              <div className={`text-5xl ${state.result?.winnerTeamId === t.id ? 'text-brand' : 'text-muted'}`}>{t.name}</div>
              <div className="font-mono text-[18rem] font-bold leading-none tabular-nums">{g[k]}</div>
              {state.bestOf > 1 && (
                <div className="mt-4 flex items-center justify-center gap-3">
                  {Array.from({ length: need }, (_, n) => <span key={n} className={`h-6 w-6 rounded-full ${n < state.gamesWon[k] ? 'bg-success' : 'bg-white/15'}`} />)}
                  <span className="ml-3 text-3xl text-muted">{state.gamesWon[k]} {state.gamesWon[k] === 1 ? 'game' : 'games'}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-center text-5xl text-brand">{status}</p>
    </div>
  );
}
