import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import type { AddressInfo } from 'net';
import { createApp } from './createApp';
import { MemoryStore } from './memoryStore';
import { ServiceUnavailableError } from './errors';
import { verifyWithFirebaseAdmin } from './auth';
import { inspectServerState } from './migrateState';
import { unconfiguredDrive, type DriveClient } from './driveUpload';
import type { TokenVerifier } from './auth';

const TOKENS: Record<string, string> = {
  admin: 'tanveer@empireonecx.com',
  officer: 'officer.a@empireonecx.com',
  lead: 'lead@empireonecx.com',
  manager: 'manager.cebu@empireonecx.com',
  creative: 'creative@empireonecx.com',
  stranger: 'stranger@gmail.com',
  admin2: 'alex.admin@empireonecx.com'
};

const verifyIdToken: TokenVerifier = async (token: string) => {
  if (token === 'expired') return null;
  const email = TOKENS[token];
  if (!email) return null;
  return { uid: email, email, exp: Math.floor(Date.now() / 1000) + 3600 };
};

class FakeDrive implements DriveClient {
  configured = true;
  files = new Map<string, { parents: string[] }>();
  async ensureFolder(rootId: string, folderPath: string) {
    return `folder:${rootId}:${folderPath}`;
  }
  async startResumable() {
    return 'https://upload.example.test/session';
  }
  async getFile(fileId: string) {
    const file = this.files.get(fileId);
    if (!file) return null;
    return { id: fileId, parents: file.parents };
  }
}

async function withServer(
  run: (base: string, store: MemoryStore, drive: FakeDrive) => Promise<void>,
  extra: { clickUpToken?: string; clickUpFetch?: typeof fetch; drive?: DriveClient; allowReset?: boolean; verify?: TokenVerifier } = {}
) {
  const store = new MemoryStore();
  const drive = extra.drive instanceof FakeDrive ? extra.drive : new FakeDrive();
  const app = createApp({
    store,
    verifyIdToken: extra.verify || verifyIdToken,
    drive: extra.drive || drive,
    clickUpToken: extra.clickUpToken,
    clickUpFetch: extra.clickUpFetch,
    allowReset: extra.allowReset ?? true
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  try {
    await run(`http://127.0.0.1:${port}`, store, drive);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function call(base: string, method: string, path: string, token?: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: response.status, json, text };
}

async function addOfficer(base: string, email: string, role: string, site = 'Cebu City') {
  const created = await call(base, 'POST', '/api/admin/users', 'admin', {
    email,
    name: email.split('@')[0],
    role,
    site,
    shift: 'Peak'
  });
  assert.equal(created.status, 200, created.text);
}

test('health does not require a token', async () => {
  await withServer(async (base) => {
    const health = await call(base, 'GET', '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.json.ok, true);
  });
});

test('missing and rejected tokens are 401', async () => {
  await withServer(async (base) => {
    const missing = await call(base, 'GET', '/api/state');
    assert.equal(missing.status, 401);
    const expired = await call(base, 'GET', '/api/state', 'expired');
    assert.equal(expired.status, 401);
  });
});

test('firebase admin credentials fail closed', async () => {
  const previous = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const previousFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  try {
    await assert.rejects(() => verifyWithFirebaseAdmin('not-a-token'), ServiceUnavailableError);
  } finally {
    if (previous) process.env.FIREBASE_SERVICE_ACCOUNT_JSON = previous;
    if (previousFile) process.env.GOOGLE_APPLICATION_CREDENTIALS = previousFile;
  }
  await withServer(
    async (base) => {
      const response = await call(base, 'GET', '/api/state', 'admin');
      assert.equal(response.status, 503);
      assert.match(response.json.message, /Firebase admin credentials/);
    },
    {
      verify: async () => {
        throw new ServiceUnavailableError('Firebase admin credentials are not configured.');
      }
    }
  );
});

test('unknown email is forbidden and is not stored', async () => {
  await withServer(async (base, store) => {
    const before = (await store.listPeople()).length;
    const state = await call(base, 'GET', '/api/state', 'stranger');
    assert.equal(state.status, 403);
    assert.equal(state.json.people, undefined);
    const ensured = await call(base, 'POST', '/api/session/ensure-user', 'stranger', {
      email: 'someone-else@empireonecx.com',
      name: 'Stranger'
    });
    assert.equal(ensured.status, 403);
    assert.equal(ensured.json.people, undefined);
    const after = await store.listPeople();
    assert.equal(after.length, before);
    assert.equal(after.some((person) => person.Email === 'stranger@gmail.com'), false);
  });
});

test('active officer can read state and the body has no token', async () => {
  await withServer(async (base) => {
    await addOfficer(base, 'officer.a@empireonecx.com', 'Officer');
    const state = await call(base, 'GET', '/api/state', 'officer');
    assert.equal(state.status, 200);
    assert.equal(state.json.clickUpToken, undefined);
    assert.equal(JSON.stringify(state.json).includes('pk_'), false);
    assert.equal(state.json.people.some((person: { Email: string }) => person.Email === 'officer.a@empireonecx.com'), true);
  });
});

test('officer cannot grant themselves admin', async () => {
  await withServer(async (base, store) => {
    await addOfficer(base, 'officer.a@empireonecx.com', 'Officer');
    const denied = await call(base, 'PUT', '/api/admin/users/officer.a@empireonecx.com', 'officer', { Role: 'Admin' });
    assert.equal(denied.status, 403);
    const row = await store.findPerson('officer.a@empireonecx.com');
    assert.equal(row?.Role, 'Officer');
  });
});

test('demoted admin cannot change configuration', async () => {
  await withServer(async (base) => {
    await addOfficer(base, 'alex.admin@empireonecx.com', 'Admin');
    const demoted = await call(base, 'PUT', '/api/admin/users/alex.admin@empireonecx.com', 'admin', { Role: 'Officer' });
    assert.equal(demoted.status, 200);
    const config = await call(base, 'POST', '/api/admin/config', 'admin2', { sheetId: 'hijack' });
    assert.equal(config.status, 403);
  });
});

test('founding admin cannot be demoted', async () => {
  await withServer(async (base, store) => {
    const response = await call(base, 'PUT', '/api/admin/users/tanveer@empireonecx.com', 'admin', {
      Role: 'Officer',
      Active: false,
      Name: 'Tanveer Hussain'
    });
    assert.equal(response.status, 200);
    const row = await store.findPerson('tanveer@empireonecx.com');
    assert.equal(row?.Role, 'Admin');
    assert.equal(row?.Active, true);
    assert.equal(row?.Name, 'Tanveer Hussain');
  });
});

test('admin cannot change their own role', async () => {
  await withServer(async (base, store) => {
    await addOfficer(base, 'alex.admin@empireonecx.com', 'Admin', 'Toronto');
    const response = await call(base, 'PUT', '/api/admin/users/alex.admin@empireonecx.com', 'admin2', {
      Role: 'Officer',
      Site: 'Cebu City'
    });
    assert.equal(response.status, 403);
    const row = await store.findPerson('alex.admin@empireonecx.com');
    assert.equal(row?.Role, 'Admin');
    assert.equal(row?.Site, 'Toronto');
  });
});

test('reviewer is stamped from the token and site managers stay on their site', async () => {
  await withServer(async (base, store, drive) => {
    await addOfficer(base, 'manager.cebu@empireonecx.com', 'Site Manager', 'Cebu City');
    await addOfficer(base, 'officer.a@empireonecx.com', 'Officer', 'Toronto');
    const session = await call(base, 'POST', '/api/uploads/session', 'officer', {
      mimeType: 'image/jpeg',
      size: 1200,
      site: 'Toronto',
      shift: 'Day',
      topic: 'Employee Recognition',
      shiftDate: '2026-10-29',
      spot: 'Production floor'
    });
    assert.equal(session.status, 200, session.text);
    const pending = await store.getPending(session.json.uploadId);
    assert.ok(pending);
    drive.files.set('good-file', { parents: [pending.folderId] });
    const saved = await call(base, 'POST', '/api/uploads/complete', 'officer', {
      uploadId: session.json.uploadId,
      driveFileId: 'good-file'
    });
    assert.equal(saved.status, 200, saved.text);
    assert.equal(saved.json.upload.officer, 'officer.a@empireonecx.com');
    assert.match(saved.json.upload.mediaUrl, /^https:\/\/drive\.google\.com\/thumbnail/);
    assert.equal(JSON.stringify(saved.json).includes('pk_'), false);
    const wrongSite = await call(base, 'POST', '/api/uploads/review', 'manager', {
      id: session.json.uploadId,
      decision: 'Accepted',
      reviewedBy: 'forged@empireonecx.com'
    });
    assert.equal(wrongSite.status, 403);
    const row = await store.findUpload(session.json.uploadId);
    assert.equal(row?.reviewedBy, undefined);
  });
});

test('a matching reviewer is stored as the token email', async () => {
  await withServer(async (base, store, drive) => {
    await addOfficer(base, 'creative@empireonecx.com', 'Creative Designer');
    await addOfficer(base, 'officer.a@empireonecx.com', 'Officer');
    const session = await call(base, 'POST', '/api/uploads/session', 'officer', {
      mimeType: 'image/jpeg',
      size: 1000,
      site: 'Cebu City',
      shift: 'Peak',
      topic: 'General / Other',
      shiftDate: '2026-10-29'
    });
    const pending = await store.getPending(session.json.uploadId);
    drive.files.set('file-ok', { parents: [pending!.folderId] });
    await call(base, 'POST', '/api/uploads/complete', 'officer', {
      uploadId: session.json.uploadId,
      driveFileId: 'file-ok'
    });
    const review = await call(base, 'POST', '/api/uploads/review', 'creative', {
      id: session.json.uploadId,
      decision: 'Accepted',
      reviewedBy: 'forged@empireonecx.com'
    });
    assert.equal(review.status, 200, review.text);
    const row = await store.findUpload(session.json.uploadId);
    assert.equal(row?.reviewedBy, 'creative@empireonecx.com');
  });
});

test('a file outside the session folder is rejected', async () => {
  await withServer(async (base, store, drive) => {
    await addOfficer(base, 'officer.a@empireonecx.com', 'Officer');
    const session = await call(base, 'POST', '/api/uploads/session', 'officer', {
      mimeType: 'video/mp4',
      size: 2000,
      site: 'Cebu City',
      shift: 'Peak',
      topic: 'General / Other',
      shiftDate: '2026-10-29'
    });
    drive.files.set('elsewhere', { parents: ['other-folder'] });
    const complete = await call(base, 'POST', '/api/uploads/complete', 'officer', {
      uploadId: session.json.uploadId,
      driveFileId: 'elsewhere'
    });
    assert.equal(complete.status, 400);
    assert.equal(await store.findUpload(session.json.uploadId), null);
  });
});

test('drive upload fails closed when the service account is missing', async () => {
  await withServer(
    async (base) => {
      const session = await call(base, 'POST', '/api/uploads/session', 'admin', {
        mimeType: 'image/jpeg',
        size: 100,
        site: 'Cebu City',
        shift: 'Peak',
        topic: 'General / Other',
        shiftDate: '2026-10-29'
      });
      assert.equal(session.status, 503);
      assert.match(session.json.message, /GOOGLE_SERVICE_ACCOUNT_JSON/);
      assert.equal(session.json.uploadUrl, undefined);
    },
    { drive: unconfiguredDrive() }
  );
});

test('blob batch uploads are rejected', async () => {
  await withServer(async (base, store) => {
    const response = await call(base, 'POST', '/api/uploads/batch', 'admin', {
      items: [{ id: 'x', mediaUrl: 'blob:http://localhost/photo' }]
    });
    assert.equal(response.status, 400);
    assert.equal((await store.listUploads()).length, 0);
  });
});

test('clickup proxy is admin get only and does not forward browser credentials', async () => {
  const calls: Array<{ url: string; authorization?: string }> = [];
  const clickUpFetch: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(input), authorization: headers.get('authorization') || undefined });
    const url = String(input);
    if (url.includes('/list/good')) {
      return new Response(JSON.stringify({ space: { id: '1300380000003391' } }), { status: 200 });
    }
    if (url.includes('/list/other')) {
      return new Response(JSON.stringify({ space: { id: 'somewhere-else' } }), { status: 200 });
    }
    return new Response(JSON.stringify({ id: 'space', name: 'Engagement', echo: headers.get('authorization') }), { status: 200 });
  };
  await withServer(
    async (base) => {
      await addOfficer(base, 'officer.a@empireonecx.com', 'Officer');
      const officer = await call(base, 'GET', '/api/clickup/space/1300380000003391', 'officer');
      assert.equal(officer.status, 403);
      const post = await call(base, 'POST', '/api/clickup/list/123', 'admin', { name: 'nope' });
      assert.equal(post.status, 405);
      const team = await call(base, 'GET', '/api/clickup/team/other', 'admin');
      assert.equal(team.status, 404);
      const space = await call(base, 'GET', '/api/clickup/space/1300380000003391', 'admin');
      assert.equal(space.status, 200, space.text);
      assert.equal(space.text.includes('server-token'), false);
      assert.equal(calls.at(-1)?.authorization, 'server-token');
      const tasks = await call(base, 'GET', '/api/clickup/list/other/task', 'admin');
      assert.equal(tasks.status, 404);
      assert.equal(calls.some((item) => item.url.includes('/list/other/task')), false);
    },
    { clickUpToken: 'server-token', clickUpFetch }
  );
});

test('clickup reports not configured without calling clickup', async () => {
  let called = false;
  await withServer(
    async (base) => {
      const response = await call(base, 'GET', '/api/clickup/space/1300380000003391', 'admin');
      assert.equal(response.status, 404);
      assert.match(response.json.message, /not configured/i);
      assert.equal(called, false);
    },
    {
      clickUpFetch: async () => {
        called = true;
        return new Response('{}');
      }
    }
  );
});

test('report officer and direction acknowledgement come from the token', async () => {
  await withServer(async (base, store) => {
    await addOfficer(base, 'officer.a@empireonecx.com', 'Officer');
    await store.insertDirection({
      feedbackId: 'dir-1',
      title: 'Huddle',
      message: 'Start on time',
      type: "Today's tasks",
      source: 'manual',
      fromPerson: 'Lead',
      sentAt: new Date().toISOString(),
      toAll: true,
      status: 'Published',
      acknowledged: false
    });
    const report = await call(base, 'POST', '/api/reports', 'officer', {
      report: {
        reportId: 'REP-1',
        officer: 'forged@empireonecx.com',
        officerName: 'Forged',
        site: 'Cebu City',
        shift: 'Peak',
        shiftDate: '2026-10-29',
        engagementDone: 'Huddle',
        photosCount: 1,
        videosCount: 0,
        hoursWorked: 8,
        spotChecks: [],
        verified: false,
        signedOff: false
      }
    });
    assert.equal(report.status, 200, report.text);
    assert.equal((await store.findReport('REP-1'))?.officer, 'officer.a@empireonecx.com');
    const ack = await call(base, 'POST', '/api/directions/acknowledge', 'officer', {
      feedbackId: 'dir-1',
      email: 'forged@empireonecx.com'
    });
    assert.equal(ack.status, 200);
    const direction = await store.findDirection('dir-1');
    assert.deepEqual(direction?.acknowledgedBy, ['officer.a@empireonecx.com']);
    const publish = await call(base, 'POST', '/api/directions/publish', 'officer', { feedbackId: 'dir-1' });
    assert.equal(publish.status, 403);
  });
});

test('hosted reset is disabled and local reset stays admin only', async () => {
  await withServer(async (base, store) => {
    await addOfficer(base, 'officer.a@empireonecx.com', 'Officer');
    const officer = await call(base, 'POST', '/api/admin/reset-sample', 'officer');
    assert.equal(officer.status, 403);
    const hosted = await call(base, 'POST', '/api/admin/reset-sample', 'admin');
    assert.equal(hosted.status, 404);
    assert.ok(await store.findPerson('officer.a@empireonecx.com'));
  }, { allowReset: false });
  await withServer(async (base, store) => {
    await addOfficer(base, 'officer.a@empireonecx.com', 'Officer');
    const reset = await call(base, 'POST', '/api/admin/reset-sample', 'admin');
    assert.equal(reset.status, 200);
    assert.equal(await store.findPerson('officer.a@empireonecx.com'), null);
    assert.equal((await store.findPerson('tanveer@empireonecx.com'))?.Role, 'Admin');
  });
});

test('migration inspection never prints a token', () => {
  const plan = inspectServerState({
    people: [{ Email: 'a@empireonecx.com', Name: 'A', Role: 'Officer', Site: 'Cebu City', Active: true }],
    directions: [],
    shiftReports: [],
    uploads: [{ id: 'u1', mediaUrl: 'blob:http://local/1' }],
    clickUpToken: 'pk_super_secret_value'
  });
  assert.equal(plan.tokenFieldPresent, true);
  assert.equal(plan.lines.join('\n').includes('pk_'), false);
  assert.match(plan.lines.join('\n'), /token field present: yes/);
});
