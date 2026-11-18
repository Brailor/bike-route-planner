// Accounts are added from the command line, never through the app (docs/containers.md):
//   node src/cli.ts add <name>   creates the account, or gives it a new password; prints the password
import { setPassword } from './accounts.ts';
import { openDb } from './db.ts';

const [command, name] = process.argv.slice(2);
if (command !== 'add' || !name) {
  console.error('Usage: node src/cli.ts add <name>');
  process.exit(2);
}
const db = openDb(process.env.DB_PATH ?? 'data/api.db');
try {
  const password = await setPassword(db, name);
  console.error(
    `Password for ${name} (shown once; running this again sets a new one and logs them out):`,
  );
  console.log(password);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
