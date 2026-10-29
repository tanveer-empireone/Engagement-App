import { verifyWithFirebaseAdmin } from './auth';
import { createApp, createUnavailableApp } from './createApp';
import { driveClientFromEnv } from './driveUpload';
import { PostgresStore } from './postgresStore';

const DATABASE_REQUIRED = 'DATABASE_URL is not configured. The API is refusing requests until a Postgres connection string is set.';

export async function createProductionApp() {
  if (process.env.VERCEL && process.env.E1_DEV_MEMORY) {
    return createUnavailableApp('The memory store cannot be used on Vercel.');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return createUnavailableApp(DATABASE_REQUIRED);
  const store = await PostgresStore.connect(databaseUrl);
  return createApp({
    store,
    verifyIdToken: verifyWithFirebaseAdmin,
    clickUpToken: process.env.CLICKUP_API_TOKEN || '',
    drive: driveClientFromEnv(),
    allowReset: !process.env.VERCEL
  });
}
