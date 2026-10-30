/** Playing roles a person can pick for cricket. WK is set by an organiser in a squad; it is shown but not offered on the profile. */
export const PICKABLE_ROLES = [['BAT', 'Batter'], ['BOWL', 'Bowler'], ['AR', 'All-rounder']] as const;
export const ROLE_LABELS: Record<string, string> = { BAT: 'Batter', BOWL: 'Bowler', AR: 'All-rounder', WK: 'Wicketkeeper' };
export const roleLabel = (role: string | null | undefined) => (role ? (ROLE_LABELS[role] ?? role) : null);
