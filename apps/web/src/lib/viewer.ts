import type { Viewer } from '@sports/scoring';
import type { ShellUser } from '@/components/ratch/shell';

/** The signed-in person as the data layer wants to know them: who may see which matches and tournaments. */
export const viewerOf = (u: ShellUser | null | undefined): Viewer => ({ signedIn: !!u, admin: u?.role === 'admin', managed: u?.managed ?? [] });
