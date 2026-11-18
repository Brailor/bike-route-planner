import { createServer } from 'node:http';
import { openDb } from './db.ts';
import { createApi } from './server.ts';

const db = openDb(process.env.DB_PATH ?? 'data/api.db');
const port = Number(process.env.PORT ?? 3000);
createServer(createApi(db)).listen(port, () => console.log(`API on :${port}`));
// As the container's first process, Node ignores SIGTERM unless told; SQLite has every write on disk already.
process.on('SIGTERM', () => process.exit(0));
