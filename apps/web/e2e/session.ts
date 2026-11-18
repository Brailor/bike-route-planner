import { join } from 'node:path';

/** Where login.setup.ts keeps the logged-in session for the run (git-ignored). */
export const SESSION_FILE = join(import.meta.dirname, '.session.json');
