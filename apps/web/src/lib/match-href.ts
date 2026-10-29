/** Where a match lives: under its tournament when it has one, otherwise under its sport. */
export const matchHref = (m: { id: string; sportKey: string; tournamentId?: string | null }) =>
  m.tournamentId ? `/tournaments/${m.tournamentId}/matches/${m.id}` : `/sports/${m.sportKey}/matches/${m.id}`;
