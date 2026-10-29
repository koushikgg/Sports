/** URL of a person's photo, or null. `at` busts the browser cache when the photo changes. */
export const avatarSrc = (userId: string | null | undefined, at: Date | string | null | undefined): string | null =>
  userId && at ? `/api/avatar/${userId}?v=${new Date(at).getTime()}` : null;

/** URL of a team's logo, or null. */
export const teamLogoSrc = (teamId: string, at: Date | string | null | undefined): string | null =>
  at ? `/api/team-logo/${teamId}?v=${new Date(at).getTime()}` : null;
