import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  createGoogleDriveUploadSession,
  loadStoreFromGoogleSheets,
  saveStoreToGoogleSheets
} from './googleWorkspaceStorage.ts';

const TAB_NAMES = [
  'App_People',
  'App_Config',
  'App_Uploads',
  'App_Directions',
  'App_ShiftReports',
  'App_Activities',
  'App_Settings',
  'App_DrivePermissions',
  'App_SyncLedger',
  'App_SyncLogs'
];

test('Google Workspace storage reads and atomically writes state and starts Drive uploads', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
    sheet: process.env.GOOGLE_STATE_SPREADSHEET_ID
  };
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'engagement-app@example.iam.gserviceaccount.com';
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  process.env.GOOGLE_STATE_SPREADSHEET_ID = 'state-sheet-123';

  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('oauth2.googleapis.com/token')) {
      return Response.json({ access_token: 'service-token', expires_in: 3600 });
    }
    if (url.includes('values:batchGet')) {
      return Response.json({
        valueRanges: [
          { values: [['admin@example.com', JSON.stringify({ Email: 'admin@example.com', Name: 'Admin' })]] },
          { values: [['config', JSON.stringify({ driveRootId: 'drive-root' })]] },
          {}, {}, {}, {},
          { values: [
            ['showCaptureForAdmin', JSON.stringify({ key: 'showCaptureForAdmin', value: true })],
            ['syncHealth', JSON.stringify({ key: 'syncHealth', value: { syncState: 'OK' } })]
          ] },
          {}, {}, {}
        ]
      });
    }
    if (url.includes('fields=sheets.properties.title')) {
      return Response.json({ sheets: TAB_NAMES.map((title) => ({ properties: { title } })) });
    }
    if (url.includes('gridProperties.rowCount')) {
      return Response.json({
        sheets: TAB_NAMES.map((title, index) => ({
          properties: { title, sheetId: index + 1, gridProperties: { rowCount: 1000 } }
        }))
      });
    }
    if (url.includes('upload/drive/v3/files')) {
      return new Response(null, { status: 200, headers: { location: 'https://upload.example/session-123' } });
    }
    if (url.includes(':batchUpdate')) return Response.json({ replies: [] });
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const fallback: any = {
    people: [], config: { driveRootId: 'fallback' }, uploads: [], directions: [], shiftReports: [], activities: [],
    showCaptureForAdmin: false, syncHealth: {}, clickUpToken: '', drivePermissions: [], syncLedger: [], syncLogs: []
  };

  try {
    const loaded = await loadStoreFromGoogleSheets((value) => value, fallback);
    assert.equal(loaded.initialized, true);
    assert.equal(loaded.store.people[0].Email, 'admin@example.com');
    assert.equal(loaded.store.config.driveRootId, 'drive-root');
    assert.equal(loaded.store.showCaptureForAdmin, true);

    await saveStoreToGoogleSheets(loaded.store);
    const atomicWrite = calls.find((call) => {
      if (!call.url.includes(':batchUpdate') || !call.init?.body) return false;
      const body = JSON.parse(String(call.init.body));
      return Array.isArray(body.requests) && body.requests.some((request: any) => request.updateCells);
    });
    assert.ok(atomicWrite, 'state should be written with one atomic spreadsheets.batchUpdate request');
    const writeBody = JSON.parse(String(atomicWrite.init?.body));
    assert.equal(writeBody.requests.length, TAB_NAMES.length);
    assert.deepEqual(
      writeBody.requests[0].updateCells.rows[0].values.map((cell: any) => cell.userEnteredValue.stringValue),
      ['Record ID', 'JSON']
    );

    const session = await createGoogleDriveUploadSession({
      fileName: 'capture.jpg', mimeType: 'image/jpeg', size: 1024, parentFolderId: 'drive-root'
    });
    assert.equal(session.uploadUrl, 'https://upload.example/session-123');
    const uploadCall = calls.find((call) => call.url.includes('upload/drive/v3/files'));
    assert.equal(new Headers(uploadCall?.init?.headers).get('authorization'), 'Bearer service-token');
    assert.deepEqual(JSON.parse(String(uploadCall?.init?.body)), { name: 'capture.jpg', parents: ['drive-root'] });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnv.email === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    else process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = originalEnv.email;
    if (originalEnv.key === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    else process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = originalEnv.key;
    if (originalEnv.sheet === undefined) delete process.env.GOOGLE_STATE_SPREADSHEET_ID;
    else process.env.GOOGLE_STATE_SPREADSHEET_ID = originalEnv.sheet;
  }
});
