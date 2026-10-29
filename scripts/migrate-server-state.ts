import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { inspectServerState, applyServerState } from '../src/server/migrateState';
import { assertLocalOrExplicitDatabaseUrl, PostgresStore } from '../src/server/postgresStore';

const filePath = path.resolve(process.cwd(), process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'data/server-state.json');
const apply = process.argv.includes('--apply');

if (!fs.existsSync(filePath)) {
  console.error(`No snapshot at ${filePath}.`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
const plan = inspectServerState(raw);
for (const line of plan.lines) console.log(line);

if (!apply) {
  console.log('Dry run only. Pass --apply to write the local or staging database.');
  process.exit(0);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set. Refusing to apply the snapshot.');
  process.exit(1);
}

try {
  assertLocalOrExplicitDatabaseUrl(databaseUrl, process.env.E1_ALLOW_REMOTE_DATABASE === '1');
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const store = await PostgresStore.connect(databaseUrl);
try {
  await applyServerState(store, raw);
  console.log('Snapshot loaded. Token values were not written.');
} finally {
  await store.close();
}
