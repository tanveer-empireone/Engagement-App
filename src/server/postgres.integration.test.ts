import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresStore, assertLocalOrExplicitDatabaseUrl } from './postgresStore';
import { applyServerState } from './migrateState';

const databaseUrl = process.env.E1_TEST_DATABASE_URL || 'postgres://e1:e1local@127.0.0.1:5432/e1_test';

test('local postgres stores roster and upload records without a token column', async () => {
  assertLocalOrExplicitDatabaseUrl(databaseUrl, false);
  let store: PostgresStore;
  try {
    store = await PostgresStore.connect(databaseUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `PostgreSQL is not reachable at ${databaseUrl}. Prerequisite: a local Postgres role that can create the e1_test database. ${message}`
    );
  }
  try {
    await store.resetSample();
    const email = 'postgres.officer@empireonecx.com';
    await store.insertPerson({
      Email: email,
      Name: 'Postgres Officer',
      Role: 'Officer',
      Site: 'Cebu City',
      Shift: 'Peak',
      Active: true
    });
    const again = await PostgresStore.connect(databaseUrl);
    try {
      const person = await again.findPerson(email);
      assert.equal(person?.Role, 'Officer');
      await again.insertUpload({
        id: 'CEB_20261029_GEN_01',
        fileName: 'CEB_20261029_GEN_01.Photo.group.jpg',
        officer: email,
        site: 'Cebu City',
        shift: 'Peak',
        mode: 'Daily',
        shiftDate: '2026-10-29',
        topic: 'General / Other',
        spot: 'Production floor',
        mediaType: 'Photo',
        mediaUrl: '',
        capturedAt: new Date().toISOString(),
        uploadedAt: new Date().toISOString(),
        note: 'stored',
        consentSigned: true,
        nothingConfidential: true,
        topPick: false,
        reviewStatus: 'Pending',
        folderPath: 'E1CX Experience Cebu/2026-10-29/Peak/file.jpg',
        driveFileId: 'drive-file-1',
        driveFolderId: 'drive-folder-1',
        mediaStatus: 'stored'
      });
      const upload = await store.findUpload('CEB_20261029_GEN_01');
      assert.equal(upload?.mediaStatus, 'stored');
      assert.equal(upload?.driveFileId, 'drive-file-1');
      assert.equal(upload?.mediaUrl, '');
    } finally {
      await again.close();
    }

    const columns = await (store as unknown as { pool: { query: Function } }).pool.query(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`
    );
    const names = columns.rows.map((row: { column_name: string }) => row.column_name);
    assert.equal(names.some((name: string) => /token/i.test(name)), false);

    await applyServerState(store, {
      people: [{ Email: 'migrated@empireonecx.com', Name: 'Migrated', Role: 'Officer', Site: 'Carcar', Shift: 'Day', Active: true }],
      uploads: [{ id: 'blob-1', officer: 'migrated@empireonecx.com', mediaUrl: 'blob:http://local/x', site: 'Carcar', reviewStatus: 'Pending' }],
      directions: [],
      shiftReports: [],
      config: { sheetId: 'sheet-from-json' },
      clickUpToken: 'pk_do_not_store'
    });
    const migrated = await store.findUpload('blob-1');
    assert.equal(migrated?.mediaStatus, 'unrecoverable');
    assert.equal(migrated?.driveFileId, undefined);
    const config = await store.getConfig();
    assert.equal(config.sheetId, 'sheet-from-json');
    const dumped = JSON.stringify(await store.listPeople()) + JSON.stringify(await store.listUploads()) + JSON.stringify(config);
    assert.equal(dumped.includes('pk_'), false);
  } finally {
    await store.resetSample();
    await store.close();
  }
});

test('migration refuses a production-looking database host', () => {
  assert.throws(() => assertLocalOrExplicitDatabaseUrl('postgres://user:secret@prod-db.example/app', true), /prod/);
  assert.throws(() => assertLocalOrExplicitDatabaseUrl('postgres://user:secret@db.example/app', false), /non-local/);
});
