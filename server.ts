import 'express-async-errors';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { get as getBlob } from '@vercel/blob';
import { mergeDriveRootChildren } from './src/utils/driveDiscovery.ts';
import {
  createGoogleDriveUploadSession,
  fetchGoogleDriveMedia,
  isGoogleWorkspaceStorageConfigured,
  loadStoreFromGoogleSheets,
  saveStoreToGoogleSheets,
  uploadBufferToGoogleDrive
} from './src/server/googleWorkspaceStorage.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'data') : path.resolve(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'server-state.json');
const LOCAL_MEDIA_DIR = path.join(DATA_DIR, 'media');
const BLOB_STATE_PATH = 'engagement-app/server-state.json';
const USE_GOOGLE_WORKSPACE_STORE = isGoogleWorkspaceStorageConfigured();
const CAN_READ_LEGACY_BLOB = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

const ADMIN_EMAIL = 'tanveer@empireonecx.com';

export interface PersonRecord {
  Email: string;
  Name: string;
  Role: 'Admin' | 'Director' | 'Site Manager' | 'Creative Designer' | 'Officer';
  Site: string;
  Shift: string;
  Active: boolean;
  Avatar?: string;
}

export interface AppIntegrationConfig {
  sheetId: string;
  driveRootId: string;
  clickUpTeamId: string;
  clickUpSpaceId: string;
  appsScriptUrl: string;
}

export interface DrivePermissionGrant {
  id: string;
  targetType: 'all' | 'folder' | 'file';
  targetId: string;
  targetName: string;
  granteeType: 'user' | 'role' | 'site';
  granteeValue: string;
  granteeName?: string;
  grantedBy: string;
  grantedAt: string;
  googlePermissions?: Array<{ email: string; permissionId: string }>;
}

export interface ServerStore {
  people: PersonRecord[];
  config: AppIntegrationConfig;
  uploads: any[];
  directions: any[];
  shiftReports: any[];
  activities: any[];
  showCaptureForAdmin: boolean;
  syncHealth: any;
  clickUpToken: string;
  drivePermissions?: DrivePermissionGrant[];
  syncLedger?: any[];
  syncLogs?: any[];
}

const INITIAL_STORE: ServerStore = {
  people: [
    {
      Email: ADMIN_EMAIL,
      Name: 'Tanveer Hussain',
      Role: 'Admin',
      Site: 'Cebu City',
      Shift: 'Peak',
      Active: true
    },
    {
      Email: 'shawn@empireonecx.com',
      Name: 'Shawn Habib',
      Role: 'Officer',
      Site: 'Toronto',
      Shift: 'Peak',
      Active: true
    },
    {
      Email: 'mika@empireonecx.com',
      Name: 'Mika Leopoldo',
      Role: 'Admin',
      Site: 'Cebu City',
      Shift: 'Peak',
      Active: true
    },
    {
      Email: 'maricarm@empireonegroup.com',
      Name: 'Maricar Montalban',
      Role: 'Officer',
      Site: 'Carcar',
      Shift: 'Peak',
      Active: true
    },
    {
      Email: 'hashie@empireonegroup.com',
      Name: 'Hashie Mae Bendecio',
      Role: 'Officer',
      Site: 'Carcar',
      Shift: 'Early',
      Active: true
    },
    {
      Email: 'scengagement@empireonegroup.com',
      Name: 'Ma. Teresa Detalla',
      Role: 'Officer',
      Site: 'San Carlos',
      Shift: 'Peak',
      Active: true
    },
    {
      Email: 'rheanne@empireonegroup.com',
      Name: 'Cris Rheanne Villaver',
      Role: 'Officer',
      Site: 'Cebu City',
      Shift: 'Peak',
      Active: false
    },
    {
      Email: 'marc@empireonecx.com',
      Name: 'Marc Louise Castanares',
      Role: 'Site Manager',
      Site: 'Carcar',
      Shift: 'Peak',
      Active: true
    },
    {
      Email: 'mark@empireonecx.com',
      Name: 'Mark Valencia',
      Role: 'Site Manager',
      Site: 'San Carlos',
      Shift: 'Peak',
      Active: true
    },
    {
      Email: 'dana@empireonecx.com',
      Name: 'Dana Surio',
      Role: 'Site Manager',
      Site: 'Urdaneta',
      Shift: 'Peak',
      Active: true
    },
    {
      Email: 'engagement@empireonecx.com',
      Name: 'E1 App Account',
      Role: 'Admin',
      Site: 'Toronto',
      Shift: 'Peak',
      Active: true
    }
  ],
  config: {
    sheetId: '1Ts2VFZawgF2SmU4VSQf0ld6p7cEHkmE2GLzc-dKfk5E',
    driveRootId: '1U-cZodmbBU6R7cFwp0p4Ily2_KPhPiSN',
    clickUpTeamId: '90161592694',
    clickUpSpaceId: '1300380000003391',
    appsScriptUrl: ''
  },
  uploads: [],
  directions: [],
  shiftReports: [],
  activities: [],
  showCaptureForAdmin: false,
  syncHealth: {
    version: '2.0.0',
    workspace: '90161592694',
    space: '1300380000003391',
    spaceName: 'Engagement',
    runner: 'engagement@empireonecx.com',
    paused: false,
    lastSync: '',
    syncState: 'OK',
    stages: []
  },
  clickUpToken: '',
  drivePermissions: [],
  syncLedger: [],
  syncLogs: []
};

function normalizeEmail(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase();
}

function getBearerToken(authorization: string | undefined): string {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

async function getGoogleTokenEmail(token: string): Promise<string> {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || !data?.email) throw new Error('Your Google session could not be verified. Sign in again.');
  return normalizeEmail(data.email);
}

function getGrantEmails(store: ServerStore, granteeType: string, granteeValue: string): string[] {
  const value = String(granteeValue || '').trim();
  if (granteeType === 'user') return value.includes('@') ? [normalizeEmail(value)] : [];

  const normalizedValue = value.toLowerCase();
  return store.people
    .filter((person) => {
      if (!person.Active || !person.Email?.includes('@')) return false;
      if (granteeType === 'role') return String(person.Role).toLowerCase() === normalizedValue;
      if (granteeType === 'site') return String(person.Site).toLowerCase() === normalizedValue;
      return false;
    })
    .map((person) => normalizeEmail(person.Email))
    .filter((email, index, emails) => email && emails.indexOf(email) === index);
}

export async function createGoogleDriveReaderPermission(
  token: string,
  fileId: string,
  email: string
): Promise<{ email: string; permissionId: string }> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions`);
  url.searchParams.set('sendNotificationEmail', 'true');
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('fields', 'id,emailAddress');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ type: 'user', role: 'reader', emailAddress: email })
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || !data?.id) {
    const listUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions`);
    listUrl.searchParams.set('supportsAllDrives', 'true');
    listUrl.searchParams.set('fields', 'permissions(id,emailAddress,type,role)');
    const existingResponse = await fetch(listUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    });
    const existingData: any = await existingResponse.json().catch(() => ({}));
    const existing = Array.isArray(existingData?.permissions)
      ? existingData.permissions.find(
          (permission: any) => permission?.type === 'user' && normalizeEmail(permission?.emailAddress) === normalizeEmail(email)
        )
      : undefined;
    if (existing?.id) {
      return { email: normalizeEmail(existing.emailAddress || email), permissionId: String(existing.id) };
    }
    const message = data?.error?.message || `Google Drive rejected the permission request (HTTP ${response.status}).`;
    throw new Error(`${email}: ${message}`);
  }
  return { email: normalizeEmail(data.emailAddress || email), permissionId: String(data.id) };
}

export async function markGoogleDriveItemForApp(token: string, fileId: string, rootFolderId: string): Promise<void> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('fields', 'id,properties');
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ properties: { engagementAppRootId: rootFolderId } })
  });
  if (!response.ok) {
    const data: any = await response.json().catch(() => ({}));
    throw new Error(data?.error?.message || `Google Drive could not mark the shared item (HTTP ${response.status}).`);
  }
}

export async function deleteGoogleDrivePermission(token: string, fileId: string, permissionId: string): Promise<void> {
  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permissionId)}`
  );
  url.searchParams.set('supportsAllDrives', 'true');
  const response = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  });
  if (!response.ok && response.status !== 404) {
    const data: any = await response.json().catch(() => ({}));
    throw new Error(data?.error?.message || `Google Drive rejected the revoke request (HTTP ${response.status}).`);
  }
}

function isLegacyDummyUpload(u: any): boolean {
  if (!u || typeof u !== 'object') return true;
  const id = String(u.id || '');
  const url = String(u.mediaUrl || '');
  const fn = String(u.fileName || '');
  if (id.startsWith('UPL-') || fn.startsWith('UPL-')) return true;
  if (url.includes('images.unsplash.com')) return true;
  return false;
}

function isLegacyDummyDirection(d: any): boolean {
  if (!d || typeof d !== 'object') return true;
  const id = String(d.feedbackId || '');
  if (id.startsWith('FB-0') || id.startsWith('FB-1')) return true;
  return false;
}

function appendSyncLog(store: ServerStore, stage: string, state: 'OK' | 'Error' | 'Info', detail: string): void {
  const entries = Array.isArray(store.syncLogs) ? store.syncLogs : [];
  store.syncLogs = [
    { id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, time: new Date().toISOString(), stage, state, detail },
    ...entries
  ].slice(0, 200);
}

let remoteStoreCache: ServerStore | null = null;
let remoteWriteQueue: Promise<void> = Promise.resolve();

export function normalizeStore(parsed: any): ServerStore {
  const peopleList: PersonRecord[] = Array.isArray(parsed?.people)
    ? structuredClone(parsed.people)
    : structuredClone(INITIAL_STORE.people);
  const hasAdmin = peopleList.some((p) => normalizeEmail(p.Email) === ADMIN_EMAIL);
  if (!hasAdmin) {
    peopleList.unshift(structuredClone(INITIAL_STORE.people[0]));
  } else {
    for (const person of peopleList) {
      if (normalizeEmail(person.Email) === ADMIN_EMAIL) {
        person.Role = 'Admin';
        person.Active = true;
      }
    }
  }

  const rawUploads: any[] = Array.isArray(parsed?.uploads) ? parsed.uploads : INITIAL_STORE.uploads;
  const rawDirections: any[] = Array.isArray(parsed?.directions) ? parsed.directions : INITIAL_STORE.directions;
  return {
    people: peopleList,
    config: parsed?.config && typeof parsed.config === 'object'
      ? { ...INITIAL_STORE.config, ...parsed.config }
      : structuredClone(INITIAL_STORE.config),
    uploads: rawUploads.filter((upload: any) => !isLegacyDummyUpload(upload)),
    directions: rawDirections.filter((direction: any) => !isLegacyDummyDirection(direction)),
    shiftReports: Array.isArray(parsed?.shiftReports) ? parsed.shiftReports : [],
    activities: Array.isArray(parsed?.activities) ? parsed.activities : [],
    showCaptureForAdmin: Boolean(parsed?.showCaptureForAdmin),
    syncHealth: parsed?.syncHealth && typeof parsed.syncHealth === 'object'
      ? parsed.syncHealth
      : structuredClone(INITIAL_STORE.syncHealth),
    clickUpToken: typeof parsed?.clickUpToken === 'string' ? parsed.clickUpToken : '',
    drivePermissions: Array.isArray(parsed?.drivePermissions) ? parsed.drivePermissions : [],
    syncLedger: Array.isArray(parsed?.syncLedger) ? parsed.syncLedger : [],
    syncLogs: Array.isArray(parsed?.syncLogs) ? parsed.syncLogs : []
  };
}

async function migrateLegacyMediaToDrive(store: ServerStore): Promise<void> {
  if (!CAN_READ_LEGACY_BLOB) return;
  for (const upload of store.uploads) {
    const mediaUrl = String(upload?.mediaUrl || '');
    if (!mediaUrl.includes('/api/media/content?')) continue;
    const pathname = new URL(mediaUrl, 'https://engagement.local').searchParams.get('path') || '';
    if (!pathname.startsWith('engagement-app/media/')) continue;
    try {
      const legacy = await getBlob(pathname, { access: 'private', useCache: false });
      if (!legacy) continue;
      const bytes = Buffer.from(await new Response(legacy.stream).arrayBuffer());
      const migrated = await uploadBufferToGoogleDrive({
        fileName: String(upload.fileName || path.basename(pathname)),
        mimeType: legacy.blob.contentType || (upload.mediaType === 'Video' ? 'video/mp4' : 'image/jpeg'),
        bytes,
        parentFolderId: store.config.driveRootId
      });
      upload.mediaUrl = `/api/media/content?driveFileId=${encodeURIComponent(migrated.id)}`;
    } catch (error) {
      console.warn(`Could not migrate legacy media ${pathname} to Google Drive:`, error);
    }
  }
}

async function hydrateRemoteStore(): Promise<void> {
  if (!USE_GOOGLE_WORKSPACE_STORE) return;
  await remoteWriteQueue.catch(() => undefined);
  const loaded = await loadStoreFromGoogleSheets(normalizeStore, INITIAL_STORE);
  if (loaded.initialized) {
    remoteStoreCache = loaded.store;
    return;
  }

  // Preserve the existing production state on the first Sheets-backed deployment.
  let initial = structuredClone(INITIAL_STORE);
  if (CAN_READ_LEGACY_BLOB) {
    const legacy = await getBlob(BLOB_STATE_PATH, { access: 'private', useCache: false });
    if (legacy) {
      initial = normalizeStore(JSON.parse(await new Response(legacy.stream).text()));
    }
  }
  initial.clickUpToken = process.env.CLICKUP_API_TOKEN || '';
  await migrateLegacyMediaToDrive(initial);
  await saveStoreToGoogleSheets(initial);
  remoteStoreCache = initial;
}

function readStore(): ServerStore {
  if (process.env.VERCEL && !USE_GOOGLE_WORKSPACE_STORE) {
    throw new Error('Persistent storage is unavailable: Google Sheets storage is not configured.');
  }
  if (USE_GOOGLE_WORKSPACE_STORE) {
    return structuredClone(remoteStoreCache || INITIAL_STORE);
  }
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return normalizeStore(JSON.parse(raw));
    }
  } catch (err) {
    console.warn('Failed reading server store, initializing fresh store:', err);
  }

  // File doesn't exist yet, create it
  void writeStore(INITIAL_STORE);
  return structuredClone(INITIAL_STORE);
}

async function writeStore(store: ServerStore): Promise<void> {
  if (process.env.VERCEL && !USE_GOOGLE_WORKSPACE_STORE) {
    throw new Error('Persistent storage is unavailable: Google Sheets storage is not configured.');
  }
  if (USE_GOOGLE_WORKSPACE_STORE) {
    const pendingStore = structuredClone(store);
    remoteWriteQueue = remoteWriteQueue.catch(() => undefined).then(async () => {
      await saveStoreToGoogleSheets(pendingStore);
      remoteStoreCache = pendingStore;
    });
    await remoteWriteQueue;
    return;
  }
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tempPath = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), 'utf-8');
  fs.renameSync(tempPath, DATA_FILE);
}

export function createExpressApp(): express.Express {
  const app = express();

  app.use(express.json({ limit: '50mb' }));
  app.use(express.static(path.resolve(__dirname, 'public')));
  app.use(async (_req, _res, next) => {
    try {
      await hydrateRemoteStore();
      next();
    } catch (error) {
      next(error);
    }
  });

  // Proxy ClickUp API requests to avoid CORS in browser and proxy through backend
  app.all('/api/clickup/*', async (req, res) => {
    const subPath = req.url.replace(/^\/api\/clickup/, '');
    const targetUrl = `https://api.clickup.com/api/v2${subPath}`;
    try {
      const headers: Record<string, string> = {};
      if (req.headers.authorization) headers.Authorization = req.headers.authorization as string;
      if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'] as string;
      const fetchOptions: RequestInit = {
        method: req.method,
        headers
      };
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.body && Object.keys(req.body).length > 0) {
        fetchOptions.body = JSON.stringify(req.body);
      }
      const response = await fetch(targetUrl, fetchOptions);
      const data = await response.text();
      res.status(response.status);
      const contentType = response.headers.get('content-type');
      if (contentType) res.setHeader('content-type', contentType);
      res.send(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // Health check endpoint
  app.get('/api/server/health', async (_req, res) => {
    const storage = USE_GOOGLE_WORKSPACE_STORE ? 'google-sheets-drive' : process.env.VERCEL ? 'misconfigured' : 'local-disk';
    const legacyMediaCount = (remoteStoreCache?.uploads || []).filter((upload) =>
      String(upload?.mediaUrl || '').includes('/api/media/content?path=')
    ).length;
    res.status(storage === 'misconfigured' ? 503 : 200).json({
      status: storage === 'misconfigured' ? 'error' : 'ok',
      storage,
      legacyMediaCount,
      uptime: process.uptime(),
      time: new Date().toISOString()
    });
  });

  app.post('/api/media/upload-session', async (req, res) => {
    if (!USE_GOOGLE_WORKSPACE_STORE) {
      res.status(503).json({ ok: false, message: 'Google Drive uploads are not configured.' });
      return;
    }
    try {
      const userToken = getBearerToken(req.headers.authorization);
      if (!userToken) {
        res.status(401).json({ ok: false, message: 'Google sign-in is required to upload media.' });
        return;
      }
      const userEmail = await getGoogleTokenEmail(userToken);
      const store = readStore();
      const uploader = store.people.find((person) => normalizeEmail(person.Email) === userEmail && person.Active);
      if (!uploader) {
        res.status(403).json({ ok: false, message: 'Your account is not active in the engagement roster.' });
        return;
      }
      const fileName = String(req.body?.fileName || '').replace(/[^a-zA-Z0-9._ -]+/g, '-').slice(-160);
      const mimeType = String(req.body?.mimeType || 'application/octet-stream');
      const size = Number(req.body?.size || 0);
      if (!fileName || !Number.isFinite(size) || size <= 0 || size > 35 * 1024 * 1024) {
        res.status(400).json({ ok: false, message: 'A valid file name and size up to 35 MB are required.' });
        return;
      }
      if (!mimeType.startsWith('image/') && !mimeType.startsWith('video/')) {
        res.status(400).json({ ok: false, message: 'Only image and video uploads are supported.' });
        return;
      }
      const result = await createGoogleDriveUploadSession({
        fileName,
        mimeType,
        size,
        parentFolderId: store.config.driveRootId
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      res.status(400).json({ ok: false, message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/media/upload-local', express.raw({ type: 'application/octet-stream', limit: '35mb' }), async (req, res) => {
    if (process.env.VERCEL) {
      res.status(404).json({ ok: false, message: 'Local media upload is unavailable in production.' });
      return;
    }
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (body.length === 0) {
      res.status(400).json({ ok: false, message: 'Media file is empty.' });
      return;
    }
    const requestedName = String(req.query.filename || 'media.bin');
    const safeName = requestedName.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-120) || 'media.bin';
    const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${safeName}`;
    fs.mkdirSync(LOCAL_MEDIA_DIR, { recursive: true });
    fs.writeFileSync(path.join(LOCAL_MEDIA_DIR, storedName), body);
    const pathname = `engagement-app/media/${storedName}`;
    res.json({ ok: true, pathname, mediaUrl: `/api/media/content?path=${encodeURIComponent(pathname)}` });
  });

  app.get('/api/media/content', async (req, res) => {
    const driveFileId = String(req.query.driveFileId || '');
    const pathname = String(req.query.path || '');
    if (!driveFileId && !pathname.startsWith('engagement-app/media/')) {
      res.status(400).json({ ok: false, message: 'A valid Drive file ID or legacy media path is required.' });
      return;
    }
    try {
      if (driveFileId) {
        const response = await fetchGoogleDriveMedia(driveFileId);
        if (!response.ok || !response.body) {
          res.status(response.status === 404 ? 404 : 502).end();
          return;
        }
        res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
        res.setHeader('Cache-Control', 'private, max-age=300');
        const bytes = Buffer.from(await response.arrayBuffer());
        res.send(bytes);
        return;
      }
      // Temporary read compatibility for media created before the Drive migration.
      if (CAN_READ_LEGACY_BLOB) {
        const result = await getBlob(pathname, { access: 'private' });
        if (!result || result.statusCode !== 200) {
          res.status(404).end();
          return;
        }
        res.setHeader('Content-Type', result.blob.contentType || 'application/octet-stream');
        res.setHeader('Cache-Control', 'private, max-age=300');
        const bytes = Buffer.from(await new Response(result.stream).arrayBuffer());
        res.send(bytes);
        return;
      }
      const localName = path.basename(pathname);
      const localPath = path.join(LOCAL_MEDIA_DIR, localName);
      if (!fs.existsSync(localPath)) {
        res.status(404).end();
        return;
      }
      res.sendFile(localPath);
    } catch (error) {
      res.status(500).json({ ok: false, message: error instanceof Error ? error.message : String(error) });
    }
  });

  // REST API: Get full server state
  app.get('/api/state', async (_req, res) => {
    const store = readStore();
    res.json(store);
  });

  // REST API: Ensure session user is recorded on the server
  app.post('/api/session/ensure-user', async (req, res) => {
    const { email, name, photoURL } = req.body || {};
    if (!email || typeof email !== 'string') {
      res.status(400).json({ ok: false, message: 'Valid email required' });
      return;
    }
    const store = readStore();
    const key = normalizeEmail(email);
    const existingIndex = store.people.findIndex((p) => normalizeEmail(p.Email) === key);

    if (existingIndex === -1) {
      const newPerson: PersonRecord = {
        Email: email.trim(),
        Name: (name && String(name).trim()) || email.split('@')[0],
        Role: key === ADMIN_EMAIL ? 'Admin' : 'Officer',
        Site: 'Cebu City',
        Shift: 'Peak',
        Active: true,
        Avatar: photoURL || undefined
      };
      store.people.unshift(newPerson);
      await writeStore(store);
    } else {
      let changed = false;
      if (key === ADMIN_EMAIL && store.people[existingIndex].Role !== 'Admin') {
        store.people[existingIndex].Role = 'Admin';
        store.people[existingIndex].Active = true;
        changed = true;
      }
      if (photoURL && store.people[existingIndex].Avatar !== photoURL) {
        store.people[existingIndex].Avatar = photoURL;
        changed = true;
      }
      if (changed) await writeStore(store);
    }

    res.json({ ok: true, people: store.people });
  });

  // REST API: Merge and sync roster parsed from Google Sheet
  app.post('/api/session/sync-sheet-roster', async (req, res) => {
    const incoming = req.body?.people;
    if (!Array.isArray(incoming) || incoming.length === 0) {
      res.status(400).json({ ok: false, message: 'Valid people array required' });
      return;
    }

    const store = readStore();
    let changed = false;

    for (const p of incoming) {
      if (!p?.Email || !String(p.Email).includes('@')) continue;
      const key = normalizeEmail(p.Email);
      const idx = store.people.findIndex((existing) => normalizeEmail(existing.Email) === key);

      if (idx === -1) {
        store.people.push({
          Email: String(p.Email).trim(),
          Name: (p.Name && String(p.Name).trim()) || String(p.Email).split('@')[0],
          Role: key === ADMIN_EMAIL ? 'Admin' : (p.Role || 'Officer'),
          Site: p.Site || 'Cebu City',
          Shift: p.Shift || 'Peak',
          Active: key === ADMIN_EMAIL ? true : (p.Active !== false),
          Avatar: p.Avatar
        });
        changed = true;
      } else {
        const existing = store.people[idx];
        if (p.Name && p.Name !== existing.Name && existing.Name === existing.Email.split('@')[0]) {
          existing.Name = String(p.Name).trim();
          changed = true;
        }
        if (p.Site && p.Site !== existing.Site) {
          existing.Site = p.Site;
          changed = true;
        }
        if (p.Shift && p.Shift !== existing.Shift) {
          existing.Shift = p.Shift;
          changed = true;
        }
        if (key !== ADMIN_EMAIL && p.Active !== undefined && p.Active !== existing.Active) {
          existing.Active = Boolean(p.Active);
          changed = true;
        }
      }
    }

    // Always maintain tanveer as Admin
    const adminIdx = store.people.findIndex((p) => normalizeEmail(p.Email) === ADMIN_EMAIL);
    if (adminIdx !== -1) {
      store.people[adminIdx].Role = 'Admin';
      store.people[adminIdx].Active = true;
    }

    if (changed) {
      await writeStore(store);
    }

    res.json({ ok: true, people: store.people, count: store.people.length });
  });

  // REST API: Proxy Google Sheets metadata read (Read-only GET)
  app.post('/api/sheets/metadata', async (req, res) => {
    const { token, spreadsheetId } = req.body || {};
    if (!token || !spreadsheetId) {
      res.status(400).json({ error: 'Token and spreadsheetId required' });
      return;
    }

    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      });
      const data = await response.text();
      res.status(response.status);
      res.setHeader('Content-Type', 'application/json');
      res.send(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // REST API: Proxy Google Sheets values read (Read-only GET)
  app.post('/api/sheets/values', async (req, res) => {
    const { token, spreadsheetId, tabName, range } = req.body || {};
    if (!token || !spreadsheetId || !tabName) {
      res.status(400).json({ error: 'Token, spreadsheetId, and tabName required' });
      return;
    }

    try {
      const fullRange = `${tabName}!${range || 'A1:Z500'}`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        fullRange
      )}?valueRenderOption=UNFORMATTED_VALUE`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      });
      const data = await response.text();
      res.status(response.status);
      res.setHeader('Content-Type', 'application/json');
      res.send(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // REST API: Proxy Google Drive folders (Read-only GET)
  app.post('/api/drive/folders', async (req, res) => {
    const { token, parentFolderId } = req.body || {};
    if (!token) {
      res.status(400).json({ error: 'OAuth token required' });
      return;
    }
    const folderId = parentFolderId || '1U-cZodmbBU6R7cFwp0p4Ily2_KPhPiSN';
    const query = `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const fields = 'files(id,name,mimeType,createdTime,modifiedTime,webViewLink,parents)';
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=100&orderBy=name`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      });
      const data = await response.text();
      res.status(response.status);
      res.setHeader('Content-Type', 'application/json');
      res.send(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // REST API: Proxy Google Drive image files in a folder (Read-only GET)
  app.post('/api/drive/files', async (req, res) => {
    const { token, folderId } = req.body || {};
    if (!token) {
      res.status(400).json({ error: 'OAuth token required' });
      return;
    }
    const parentId = folderId || '1U-cZodmbBU6R7cFwp0p4Ily2_KPhPiSN';
    const query = `'${parentId}' in parents and (mimeType contains 'image/' or mimeType contains 'video/') and trashed = false`;
    const fields = 'files(id,name,mimeType,size,createdTime,modifiedTime,thumbnailLink,webViewLink,webContentLink,iconLink,parents)';
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=100&orderBy=createdTime desc`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      });
      const data = await response.text();
      res.status(response.status);
      res.setHeader('Content-Type', 'application/json');
      res.send(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // REST API: Proxy Google Drive complete folder tree with images (Read-only GET)
  app.post('/api/drive/tree', async (req, res) => {
    const { token, rootFolderId } = req.body || {};
    if (!token) {
      res.status(400).json({ error: 'OAuth token required' });
      return;
    }
    const rootId = rootFolderId || '1U-cZodmbBU6R7cFwp0p4Ily2_KPhPiSN';

    try {
      // 1. Fetch root folder details
      const rootMetaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${rootId}?fields=id,name,webViewLink`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
      });
      const rootMeta = rootMetaRes.ok ? await rootMetaRes.json() : { id: rootId, name: 'E1CX Experience' };

      // 2. Fetch direct children plus folders explicitly shared with this account.
      // A user can read a shared child without being allowed to browse its parent.
      const folderQuery = `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const sharedFolderQuery = `sharedWithMe = true and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const folderFields = 'files(id,name,mimeType,createdTime,modifiedTime,webViewLink,parents,properties)';
      const [folderRes, sharedFolderRes] = await Promise.all([
        fetch(
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=${encodeURIComponent(folderFields)}&pageSize=100&orderBy=name`,
          { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
        ),
        fetch(
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(sharedFolderQuery)}&fields=${encodeURIComponent(folderFields)}&pageSize=100&orderBy=name`,
          { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
        )
      ]);
      const folderData = folderRes.ok ? await folderRes.json() : { files: [] };
      const sharedFolderData = sharedFolderRes.ok ? await sharedFolderRes.json() : { files: [] };
      const folders: any[] = mergeDriveRootChildren(rootId, folderData.files || [], sharedFolderData.files || []);

      // 3. For each folder, fetch its image files (in parallel, up to 10 folders)
      const imageFields = 'files(id,name,mimeType,size,createdTime,modifiedTime,thumbnailLink,webViewLink,webContentLink,iconLink,parents,properties)';
      const foldersWithImages = await Promise.all(
        folders.map(async (folder) => {
          try {
            const imgQuery = `'${folder.id}' in parents and (mimeType contains 'image/' or mimeType contains 'video/') and trashed = false`;
            const imgRes = await fetch(
              `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(imgQuery)}&fields=${encodeURIComponent(imageFields)}&pageSize=100&orderBy=createdTime desc`,
              { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
            );
            const imgData = imgRes.ok ? await imgRes.json() : { files: [] };
            const rawImages = imgData.files || [];
            return {
              folder: {
                id: folder.id,
                name: folder.name,
                webViewLink: folder.webViewLink,
                createdTime: folder.createdTime,
                modifiedTime: folder.modifiedTime,
                imageCount: rawImages.length
              },
              images: rawImages.map((f: any) => ({
                id: f.id,
                name: f.name,
                mimeType: f.mimeType,
                size: f.size ? Number(f.size) : undefined,
                createdTime: f.createdTime,
                modifiedTime: f.modifiedTime,
                thumbnailLink: f.thumbnailLink ? f.thumbnailLink.replace(/=s\d+$/, '=s800') : `https://drive.google.com/thumbnail?id=${f.id}&sz=w800`,
                webViewLink: f.webViewLink,
                webContentLink: f.webContentLink,
                folderId: folder.id,
                folderName: folder.name
              }))
            };
          } catch {
            return {
              folder: { id: folder.id, name: folder.name, webViewLink: folder.webViewLink, imageCount: 0 },
              images: []
            };
          }
        })
      );

      // 4. Also fetch images located directly in root folder
      let rootImages: any[] = [];
      try {
        const rootImgQuery = `'${rootId}' in parents and (mimeType contains 'image/' or mimeType contains 'video/') and trashed = false`;
        const sharedMediaQuery = `sharedWithMe = true and (mimeType contains 'image/' or mimeType contains 'video/') and trashed = false`;
        const [rootImgRes, sharedMediaRes] = await Promise.all([
          fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(rootImgQuery)}&fields=${encodeURIComponent(imageFields)}&pageSize=50&orderBy=createdTime desc`,
            { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
          ),
          fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(sharedMediaQuery)}&fields=${encodeURIComponent(imageFields)}&pageSize=100&orderBy=createdTime desc`,
            { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
          )
        ]);
        if (rootImgRes.ok) {
          const rData = await rootImgRes.json();
          const sharedMediaData = sharedMediaRes.ok ? await sharedMediaRes.json() : { files: [] };
          const discoveredImages = mergeDriveRootChildren(rootId, rData.files || [], sharedMediaData.files || []);
          rootImages = discoveredImages.map((f: any) => ({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            size: f.size ? Number(f.size) : undefined,
            createdTime: f.createdTime,
            modifiedTime: f.modifiedTime,
            thumbnailLink: f.thumbnailLink ? f.thumbnailLink.replace(/=s\d+$/, '=s800') : `https://drive.google.com/thumbnail?id=${f.id}&sz=w800`,
            webViewLink: f.webViewLink,
            webContentLink: f.webContentLink,
            folderId: rootId,
            folderName: rootMeta.name || 'Root'
          }));
        }
      } catch {
        // ignore root images errors
      }

      res.json({
        ok: true,
        rootFolder: rootMeta,
        foldersWithImages,
        rootImages,
        totalFolders: foldersWithImages.length,
        totalImages: foldersWithImages.reduce((sum, f) => sum + f.images.length, 0) + rootImages.length,
        fetchedAt: new Date().toISOString()
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // REST API: Get Drive permissions
  app.get('/api/drive/permissions', async (_req, res) => {
    try {
      const store = readStore();
      res.json({ ok: true, permissions: Array.isArray(store.drivePermissions) ? store.drivePermissions : [] });
    } catch (err: unknown) {
      console.error('Failed to get drive permissions:', err);
      res.status(500).json({ ok: false, permissions: [], message: 'Server error retrieving permissions.' });
    }
  });

  // REST API: Grant Drive permission (Admin only)
  app.post('/api/drive/permissions', async (req, res) => {
    try {
      const { targetType, targetId, targetName, granteeType, granteeValue, granteeName, grantedBy } = req.body || {};
      if (!targetType || !targetId || !granteeType || !granteeValue) {
        res.status(400).json({ ok: false, message: 'Missing targetType, targetId, granteeType, or granteeValue' });
        return;
      }

      const token = getBearerToken(req.headers.authorization);
      if (!token) {
        res.status(401).json({ ok: false, message: 'Reconnect Google Drive, then try granting access again.' });
        return;
      }

      const store = readStore();
      if (!Array.isArray(store.drivePermissions)) {
        store.drivePermissions = [];
      }

      // Safe duplicate check
      const cleanGrantee = String(granteeValue || '').trim().toLowerCase();
      const exists = store.drivePermissions.some(
        (p) =>
          Boolean(p.googlePermissions?.length) &&
          p.targetType === targetType &&
          String(p.targetId) === String(targetId) &&
          p.granteeType === granteeType &&
          String(p.granteeValue || '').trim().toLowerCase() === cleanGrantee
      );

      if (exists) {
        const googleTargetId = targetType === 'all' ? store.config.driveRootId : String(targetId);
        await markGoogleDriveItemForApp(token, googleTargetId, store.config.driveRootId);
        res.json({ ok: true, permissions: store.drivePermissions, message: 'Permission already granted.' });
        return;
      }

      const grantEmails = getGrantEmails(store, granteeType, granteeValue);
      if (grantEmails.length === 0) {
        res.status(400).json({ ok: false, message: 'No active Google Workspace users match this permission.' });
        return;
      }

      const googleTargetId = targetType === 'all' ? store.config.driveRootId : String(targetId);
      await markGoogleDriveItemForApp(token, googleTargetId, store.config.driveRootId);
      const results = await Promise.allSettled(
        grantEmails.map((email) => createGoogleDriveReaderPermission(token, googleTargetId, email))
      );
      const failures = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => (result.reason instanceof Error ? result.reason.message : String(result.reason)));
      if (failures.length > 0) {
        res.status(502).json({ ok: false, message: `Google Drive could not grant access: ${failures.join('; ')}` });
        return;
      }
      const googlePermissions = results
        .filter((result): result is PromiseFulfilledResult<{ email: string; permissionId: string }> => result.status === 'fulfilled')
        .map((result) => result.value);

      const newGrant: DrivePermissionGrant = {
        id: `perm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        targetType,
        targetId: String(targetId),
        targetName: String(targetName || targetId),
        granteeType,
        granteeValue: String(granteeValue).trim(),
        granteeName: granteeName ? String(granteeName).trim() : undefined,
        grantedBy: grantedBy ? String(grantedBy).trim() : ADMIN_EMAIL,
        grantedAt: new Date().toISOString(),
        googlePermissions
      };

      store.drivePermissions.unshift(newGrant);
      await writeStore(store);
      res.json({ ok: true, permissions: store.drivePermissions, message: `Access granted for ${newGrant.granteeName || newGrant.granteeValue}.` });
    } catch (err: unknown) {
      console.error('Failed to grant drive permission:', err);
      res.status(500).json({ ok: false, message: `Server error: ${err instanceof Error ? err.message : String(err)}` });
    }
  });

  // REST API: Revoke Drive permission
  app.delete('/api/drive/permissions/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const store = readStore();
      if (!Array.isArray(store.drivePermissions)) {
        store.drivePermissions = [];
      }
      const existing = store.drivePermissions.find((permission) => permission?.id === id);
      if (existing?.googlePermissions?.length) {
        const token = getBearerToken(req.headers.authorization);
        if (!token) {
          res.status(401).json({ ok: false, message: 'Reconnect Google Drive, then try revoking access again.' });
          return;
        }
        const googleTargetId = existing.targetType === 'all' ? store.config.driveRootId : existing.targetId;
        await Promise.all(
          existing.googlePermissions.map((permission) =>
            deleteGoogleDrivePermission(token, googleTargetId, permission.permissionId)
          )
        );
      }
      const initialLen = store.drivePermissions.length;
      store.drivePermissions = store.drivePermissions.filter((p) => p && p.id !== id);
      await writeStore(store);
      res.json({
        ok: true,
        permissions: store.drivePermissions,
        message: store.drivePermissions.length < initialLen ? 'Permission revoked.' : 'Permission not found.'
      });
    } catch (err: unknown) {
      console.error('Failed to revoke drive permission:', err);
      res.status(500).json({ ok: false, message: `Server error: ${err instanceof Error ? err.message : String(err)}` });
    }
  });

  // REST API: Proxy Google Sheets append row
  app.post('/api/sheets/append', async (req, res) => {
    const { token, spreadsheetId, range, values } = req.body || {};
    if (!token || !spreadsheetId || !range || !Array.isArray(values)) {
      res.status(400).json({ error: 'Token, spreadsheetId, range, and values array required' });
      return;
    }

    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        range
      )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          range,
          majorDimension: 'ROWS',
          values
        })
      });
      const data = await response.text();
      res.status(response.status);
      res.setHeader('Content-Type', 'application/json');
      res.send(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // REST API: Proxy Google Sheets update row
  app.post('/api/sheets/update', async (req, res) => {
    const { token, spreadsheetId, range, values } = req.body || {};
    if (!token || !spreadsheetId || !range || !Array.isArray(values)) {
      res.status(400).json({ error: 'Token, spreadsheetId, range, and values array required' });
      return;
    }

    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        range
      )}?valueInputOption=USER_ENTERED`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          range,
          majorDimension: 'ROWS',
          values
        })
      });
      const data = await response.text();
      res.status(response.status);
      res.setHeader('Content-Type', 'application/json');
      res.send(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // REST API: Update app configuration
  app.post('/api/admin/config', async (req, res) => {
    const store = readStore();
    store.config = {
      ...store.config,
      ...(req.body || {})
    };
    await writeStore(store);
    res.json({ ok: true, config: store.config, message: 'Configuration saved to server.' });
  });

  app.post('/api/admin/sync-state', async (req, res) => {
    const store = readStore();
    const { syncHealth, syncLedger, syncLogs } = req.body || {};
    if (syncHealth && typeof syncHealth === 'object') {
      store.syncHealth = { ...store.syncHealth, ...syncHealth };
    }
    if (Array.isArray(syncLedger)) store.syncLedger = syncLedger;
    if (Array.isArray(syncLogs)) store.syncLogs = syncLogs.slice(0, 200);
    await writeStore(store);
    res.json({
      ok: true,
      syncHealth: store.syncHealth,
      syncLedger: store.syncLedger || [],
      syncLogs: store.syncLogs || [],
      message: 'Sync status saved to server.'
    });
  });

  // REST API: Add user
  app.post('/api/admin/users', async (req, res) => {
    const { email, name, role, site, shift } = req.body || {};
    if (!email || !String(email).includes('@')) {
      res.status(400).json({ ok: false, message: 'Enter a full email address.' });
      return;
    }
    const store = readStore();
    const key = normalizeEmail(email);
    if (store.people.some((p) => normalizeEmail(p.Email) === key)) {
      res.status(400).json({ ok: false, message: 'That email is already on the roster. Edit the existing row.' });
      return;
    }

    const newPerson: PersonRecord = {
      Email: String(email).trim(),
      Name: (name && String(name).trim()) || String(email).split('@')[0],
      Role: key === ADMIN_EMAIL ? 'Admin' : (role || 'Officer'),
      Site: site || 'Cebu City',
      Shift: shift || 'Peak',
      Active: true
    };
    store.people.push(newPerson);
    await writeStore(store);

    res.json({
      ok: true,
      people: store.people,
      message: `${newPerson.Email} is saved as ${newPerson.Role} on the server.`
    });
  });

  // REST API: Update user
  app.put('/api/admin/users/:email', async (req, res) => {
    const email = req.params.email;
    const patch = req.body || {};
    const store = readStore();
    const key = normalizeEmail(email);
    const index = store.people.findIndex((p) => normalizeEmail(p.Email) === key);

    if (index === -1) {
      res.status(404).json({ ok: false, message: 'That person is not on the roster.' });
      return;
    }

    const existing = store.people[index];
    const isAdminAccount = key === ADMIN_EMAIL;
    store.people[index] = {
      ...existing,
      ...patch,
      Email: existing.Email,
      Role: isAdminAccount ? 'Admin' : (patch.Role || existing.Role),
      Active: isAdminAccount ? true : (patch.Active !== undefined ? Boolean(patch.Active) : existing.Active)
    };
    await writeStore(store);

    res.json({ ok: true, people: store.people, message: `Updated ${existing.Email} on the server.` });
  });

  // REST API: Remove / Deactivate user
  app.delete('/api/admin/users/:email', async (req, res) => {
    const email = req.params.email;
    const key = normalizeEmail(email);
    if (key === ADMIN_EMAIL) {
      res.status(400).json({ ok: false, message: 'You cannot remove the primary admin account.' });
      return;
    }

    const store = readStore();
    const index = store.people.findIndex((p) => normalizeEmail(p.Email) === key);
    if (index === -1) {
      store.people.push({
        Email: email,
        Name: email.split('@')[0],
        Role: 'Officer',
        Site: 'Cebu City',
        Shift: 'Peak',
        Active: false
      });
    } else {
      store.people[index].Active = false;
    }
    await writeStore(store);

    res.json({
      ok: true,
      people: store.people,
      message: `${email} access deactivated on server. Restoring access puts them back on the roster.`
    });
  });

  // REST API: Capture toggle for admin
  app.post('/api/admin/capture-toggle', async (req, res) => {
    const store = readStore();
    store.showCaptureForAdmin = Boolean(req.body?.showCaptureForAdmin);
    await writeStore(store);
    res.json({
      ok: true,
      showCaptureForAdmin: store.showCaptureForAdmin,
      message: store.showCaptureForAdmin
        ? 'Capture media is visible on the admin view (saved to server).'
        : 'Capture media is hidden on the admin view (saved to server).'
    });
  });

  // REST API: Update Upload Record
  app.put('/api/admin/records/upload/:id', async (req, res) => {
    const { id } = req.params;
    const patch = req.body || {};
    const store = readStore();
    const index = store.uploads.findIndex((u) => u.id === id);
    if (index === -1) {
      res.status(404).json({ ok: false, message: 'Upload not found on server.' });
      return;
    }
    store.uploads[index] = { ...store.uploads[index], ...patch };
    await writeStore(store);
    res.json({ ok: true, uploads: store.uploads, message: `Updated upload ${id} on the server.` });
  });

  // REST API: Delete Single Upload Record
  app.delete('/api/admin/records/upload/:id', async (req, res) => {
    const { id } = req.params;
    const store = readStore();
    const initialLen = store.uploads.length;
    store.uploads = store.uploads.filter((u) => u.id !== id);
    if (store.uploads.length === initialLen) {
      res.status(404).json({ ok: false, message: 'Upload not found on server.' });
      return;
    }
    await writeStore(store);
    res.json({ ok: true, uploads: store.uploads, message: `Deleted upload ${id} from server. Google Drive files were not deleted.` });
  });

  // REST API: Delete All Upload Records
  app.delete('/api/admin/records/uploads', async (_req, res) => {
    const store = readStore();
    const count = store.uploads.length;
    store.uploads = [];
    await writeStore(store);
    res.json({ ok: true, uploads: [], message: `Deleted ${count} upload record(s) from server.` });
  });

  // REST API: Update Direction
  app.put('/api/admin/records/direction/:id', async (req, res) => {
    const { id } = req.params;
    const patch = req.body || {};
    const store = readStore();
    const index = store.directions.findIndex((d) => d.feedbackId === id);
    if (index === -1) {
      res.status(404).json({ ok: false, message: 'Direction not found on server.' });
      return;
    }
    store.directions[index] = { ...store.directions[index], ...patch };
    await writeStore(store);
    res.json({ ok: true, directions: store.directions, message: `Updated direction ${id} on the server.` });
  });

  // REST API: Delete Single Direction
  app.delete('/api/admin/records/direction/:id', async (req, res) => {
    const { id } = req.params;
    const store = readStore();
    const initialLen = store.directions.length;
    store.directions = store.directions.filter((d) => d.feedbackId !== id);
    if (store.directions.length === initialLen) {
      res.status(404).json({ ok: false, message: 'Direction not found on server.' });
      return;
    }
    await writeStore(store);
    res.json({ ok: true, directions: store.directions, message: `Deleted direction ${id} from server.` });
  });

  // REST API: Delete All Directions
  app.delete('/api/admin/records/directions', async (_req, res) => {
    const store = readStore();
    const count = store.directions.length;
    store.directions = [];
    await writeStore(store);
    res.json({ ok: true, directions: [], message: `Deleted ${count} direction(s) from server.` });
  });

  // REST API: Update Shift Report
  app.put('/api/admin/records/report/:id', async (req, res) => {
    const { id } = req.params;
    const patch = req.body || {};
    const store = readStore();
    const index = store.shiftReports.findIndex((r) => r.reportId === id);
    if (index === -1) {
      res.status(404).json({ ok: false, message: 'Shift report not found on server.' });
      return;
    }
    store.shiftReports[index] = { ...store.shiftReports[index], ...patch };
    await writeStore(store);
    res.json({ ok: true, shiftReports: store.shiftReports, message: `Updated report ${id} on the server.` });
  });

  // REST API: Delete Single Shift Report
  app.delete('/api/admin/records/report/:id', async (req, res) => {
    const { id } = req.params;
    const store = readStore();
    const initialLen = store.shiftReports.length;
    store.shiftReports = store.shiftReports.filter((r) => r.reportId !== id);
    if (store.shiftReports.length === initialLen) {
      res.status(404).json({ ok: false, message: 'Shift report not found on server.' });
      return;
    }
    await writeStore(store);
    res.json({ ok: true, shiftReports: store.shiftReports, message: `Deleted report ${id} from server.` });
  });

  // REST API: Delete All Shift Reports
  app.delete('/api/admin/records/reports', async (_req, res) => {
    const store = readStore();
    const count = store.shiftReports.length;
    store.shiftReports = [];
    await writeStore(store);
    res.json({ ok: true, shiftReports: [], message: `Deleted ${count} shift report(s) from server.` });
  });

  // REST API: Batch Upload Save
  app.post('/api/uploads/batch', async (req, res) => {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ ok: false, message: 'Items array required' });
      return;
    }
    const store = readStore();
    store.uploads = [...items, ...store.uploads];
    await writeStore(store);
    res.json({ ok: true, uploads: store.uploads });
  });

  // REST API: Review Upload
  app.post('/api/uploads/review', async (req, res) => {
    const { id, decision, note, reviewedBy } = req.body || {};
    const store = readStore();
    const index = store.uploads.findIndex((u) => u.id === id);
    if (index === -1) {
      res.status(404).json({ ok: false, message: 'Upload not found.' });
      return;
    }
    store.uploads[index] = {
      ...store.uploads[index],
      reviewStatus: decision,
      reviewNote: note || store.uploads[index].reviewNote,
      reviewedBy: reviewedBy || store.uploads[index].reviewedBy,
      reviewedAt: new Date().toISOString(),
      topPick: decision === 'Top pick' ? true : store.uploads[index].topPick
    };
    appendSyncLog(store, 'followups', 'Info', `${decision || 'Review'} saved for ${id} by ${reviewedBy || 'reviewer'}.`);
    await writeStore(store);
    res.json({ ok: true, uploads: store.uploads });
  });

  // REST API: Toggle Used In Final / Creative Approval
  app.post('/api/uploads/toggle-final', async (req, res) => {
    const { id, usedInFinal, creativeApprovedBy, creativeApprovedAt } = req.body || {};
    const store = readStore();
    const index = store.uploads.findIndex((u) => u.id === id);
    if (index === -1) {
      res.status(404).json({ ok: false, message: 'Upload not found.' });
      return;
    }
    const current = store.uploads[index];
    const targetUsed = typeof usedInFinal === 'boolean' ? usedInFinal : !current.usedInFinal;
    store.uploads[index] = {
      ...current,
      usedInFinal: targetUsed,
      creativeApprovedBy: targetUsed ? (creativeApprovedBy || current.creativeApprovedBy) : undefined,
      creativeApprovedAt: targetUsed ? (creativeApprovedAt || new Date().toISOString()) : undefined
    };
    await writeStore(store);
    res.json({ ok: true, uploads: store.uploads });
  });

  // REST API: Create Shift Report
  app.post('/api/reports', async (req, res) => {
    const { report } = req.body || {};
    if (!report || !report.reportId) {
      res.status(400).json({ ok: false, message: 'Valid report object required' });
      return;
    }
    const store = readStore();
    store.shiftReports = [report, ...store.shiftReports];
    await writeStore(store);
    res.json({ ok: true, shiftReports: store.shiftReports });
  });

  // REST API: Sign off report
  app.post('/api/reports/sign-off', async (req, res) => {
    const { reportId } = req.body || {};
    const store = readStore();
    const index = store.shiftReports.findIndex((r) => r.reportId === reportId);
    if (index === -1) {
      res.status(404).json({ ok: false, message: 'Shift report not found.' });
      return;
    }
    store.shiftReports[index] = {
      ...store.shiftReports[index],
      signedOff: true,
      verified: true
    };
    await writeStore(store);
    res.json({ ok: true, shiftReports: store.shiftReports });
  });

  // REST API: Acknowledge Direction
  app.post('/api/directions/acknowledge', async (req, res) => {
    const { feedbackId, email, reply, direction } = req.body || {};
    const store = readStore();
    const index = store.directions.findIndex((d) => d.feedbackId === feedbackId);
    if (index !== -1) {
      const prevAck = store.directions[index].acknowledgedBy || [];
      store.directions[index] = {
        ...store.directions[index],
        acknowledged: true,
        acknowledgedAt: new Date().toISOString(),
        acknowledgedBy: Array.from(new Set([...prevAck, email].filter(Boolean))),
        reply: reply || store.directions[index].reply
      };
      appendSyncLog(store, 'directions', 'OK', `${email || 'A user'} acknowledged task ${feedbackId}.`);
      await writeStore(store);
    } else if (direction && feedbackId) {
      const prevAck = direction.acknowledgedBy || [];
      store.directions.unshift({
        ...direction,
        acknowledged: true,
        acknowledgedAt: new Date().toISOString(),
        acknowledgedBy: Array.from(new Set([...prevAck, email].filter(Boolean))),
        reply: reply || direction.reply || ''
      });
      appendSyncLog(store, 'directions', 'OK', `${email || 'A user'} acknowledged task ${feedbackId}.`);
      await writeStore(store);
    } else if (feedbackId) {
      store.directions.unshift({
        feedbackId,
        title: 'Task ' + feedbackId,
        message: '',
        type: 'General',
        priority: 'Normal',
        targetSites: ['All'],
        targetAudience: 'All Engagement Officers',
        targetRole: 'Engagement Officer',
        acknowledged: true,
        acknowledgedAt: new Date().toISOString(),
        acknowledgedBy: email ? [email] : [],
        sentAt: new Date().toISOString(),
        status: 'Published'
      } as any);
      appendSyncLog(store, 'directions', 'OK', `${email || 'A user'} acknowledged task ${feedbackId}.`);
      await writeStore(store);
    }
    res.json({ ok: true, directions: store.directions });
  });

  // REST API: User Activities CRUD
  app.get('/api/activities', async (_req, res) => {
    const store = readStore();
    res.json({ ok: true, activities: store.activities || [] });
  });

  app.post('/api/activities', async (req, res) => {
    const { activity } = req.body || {};
    if (!activity || !activity.id) {
      res.status(400).json({ ok: false, message: 'Activity with id required' });
      return;
    }
    const store = readStore();
    if (!Array.isArray(store.activities)) store.activities = [];
    const index = store.activities.findIndex((a) => a.id === activity.id);
    if (index !== -1) {
      store.activities[index] = { ...store.activities[index], ...activity, updatedAt: new Date().toISOString() };
    } else {
      store.activities = [activity, ...store.activities];
    }
    await writeStore(store);
    res.json({ ok: true, activities: store.activities });
  });

  app.delete('/api/activities/:id', async (req, res) => {
    const { id } = req.params;
    const store = readStore();
    if (!Array.isArray(store.activities)) store.activities = [];
    store.activities = store.activities.filter((a) => a.id !== id);
    await writeStore(store);
    res.json({ ok: true, activities: store.activities });
  });

  // REST API: Publish Direction
  app.post('/api/directions/publish', async (req, res) => {
    const { feedbackId } = req.body || {};
    const store = readStore();
    const index = store.directions.findIndex((d) => d.feedbackId === feedbackId);
    if (index === -1) {
      res.status(404).json({ ok: false, message: 'Direction not found.' });
      return;
    }
    store.directions[index] = {
      ...store.directions[index],
      status: 'Published',
      sentAt: new Date().toISOString()
    };
    appendSyncLog(store, 'directions', 'OK', `Direction ${feedbackId} was published.`);
    await writeStore(store);
    res.json({ ok: true, directions: store.directions });
  });

  // REST API: ClickUp token storage on server
  app.post('/api/config/clickup-token', async (req, res) => {
    if (USE_GOOGLE_WORKSPACE_STORE) {
      res.status(400).json({
        ok: false,
        message: 'ClickUp credentials must be saved as CLICKUP_API_TOKEN in Vercel, not in Google Sheets.'
      });
      return;
    }
    const { token } = req.body || {};
    const store = readStore();
    store.clickUpToken = (token && String(token).trim()) || '';
    await writeStore(store);
    res.json({ ok: true, clickUpToken: store.clickUpToken, message: 'ClickUp token saved to server.' });
  });

  // REST API: Reset to initial sample / clean data
  app.post('/api/admin/reset-sample', async (_req, res) => {
    await writeStore(INITIAL_STORE);
    res.json({ ok: true, store: INITIAL_STORE, message: 'Server reset to initial state.' });
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('changed during this save')
      ? 409
      : message.includes('Persistent storage is unavailable')
        ? 503
        : 500;
    console.error('API request failed:', error);
    res.status(status).json({ ok: false, message });
  });

  return app;
}
