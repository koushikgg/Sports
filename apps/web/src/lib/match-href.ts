/**
 * Where things live, as a tree: a tournament's match is under its tournament, and the match's scorer and TV mode are under
 * the match. A match with no tournament is under its sport.
 */
type MatchRef = { id: string; sportKey: string; tournamentId?: string | null };

export const matchHref = (m: MatchRef) => (m.tournamentId ? `/tournaments/${m.tournamentId}/matches/${m.id}` : `/sports/${m.sportKey}/matches/${m.id}`);
export const scoreHref = (m: MatchRef) => `${matchHref(m)}/score`;
export const displayHref = (m: MatchRef) => `${matchHref(m)}/display`;
export const newMatchHref = (tournamentId: string) => `/tournaments/${tournamentId}/matches/create`;
