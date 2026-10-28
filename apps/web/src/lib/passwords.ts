import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

/**
 * A hash nobody knows the password for. People who sign in with Google have no password, but the
 * column is required, so they get this. It cannot be used to sign in with email and password.
 */
export const unusablePasswordHash = () => bcrypt.hash(randomBytes(32).toString('hex'), 10);
