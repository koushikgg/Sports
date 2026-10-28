import type { Role } from '@sports/shared';
import 'next-auth';

declare module 'next-auth' {
  interface User {
    role: Role;
  }
  interface Session {
    user: { id: string; role: Role } & import('next-auth').DefaultSession['user'];
  }
}
