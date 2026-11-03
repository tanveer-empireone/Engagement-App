import crypto from 'node:crypto';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const STATE_TABS = {
  people: 'App_People',
  config: 'App_Config',
  uploads: 'App_Uploads',
  directions: 'App_Directions',
  shiftReports: 'App_ShiftReports',
  activities: 'App_Activities',
  settings: 'App_Settings',
  drivePermissions: 'App_DrivePermissions',
  syncLedger: 'App_SyncLedger',
  syncLogs: 'App_SyncLogs'
} as const;

type StateKey = keyof typeof STATE_TABS;

export interface GoogleWorkspaceStore {
  people: any[];
  config: Record<string, any>;
  uploads: any[];
  directions: any[];
  shiftReports: any[];
  activities: any[];
  showCaptureForAdmin: boolean;
  syncHealth: Record<string, any>;
  clickUpToken: string;
  drivePermissions?: any[];
  syncLedger?: any[];
  syncLogs?: any[];
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;
let writeQueue: Promise<void> = Promise.resolve();
const initializedSpreadsheets = new Set<string>();

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function getServiceAccountConfig(): { email: string; privateKey: string; subject?: string } | null {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
  if (!email || !rawKey) return null;
  return {
    email,
    privateKey: rawKey.replace(/\\n/g, '\n'),
    subject: process.env.GOOGLE_WORKSPACE_IMPERSONATED_USER?.trim() || undefined
  };
}

export function isGoogleWorkspaceStorageConfigured(): boolean {
  return Boolean(getServiceAccountConfig() && process.env.GOOGLE_STATE_SPREADSHEET_ID?.trim());
}

export function getGoogleStateSpreadsheetId(): string {
  const id = process.env.GOOGLE_STATE_SPREADSHEET_ID?.trim();
  if (!id) throw new Error('GOOGLE_STATE_SPREADSHEET_ID is not configured.');
  return id;
}

export async function getGoogleWorkspaceAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.accessToken;
  const account = getServiceAccountConfig();
  if (!account) {
    throw new Error('Google service account credentials are not configured.');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: account.email,
    scope: `${SHEETS_SCOPE} ${DRIVE_SCOPE}`,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
    ...(account.subject ? { sub: account.subject } : {})
  }));
  const unsigned = `${header}.${claims}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), account.privateKey);
  const assertion = `${unsigned}.${base64Url(signature)}`;

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Google OAuth failed (HTTP ${response.status}).`);
  }
  cachedToken = {
    accessToken: String(data.access_token),
    expiresAt: Date.now() + Math.max(300, Number(data.expires_in) || 3600) * 1000
  };
  return cachedToken.accessToken;
}

async function googleJson(url: string, init: RequestInit = {}): Promise<any> {
  const token = await getGoogleWorkspaceAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', 'application/json');
  const response = await fetch(url, { ...init, headers });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `Google API request failed (HTTP ${response.status}).`);
  }
  return data;
}

async function ensureStateTabs(spreadsheetId: string): Promise<void> {
  if (initializedSpreadsheets.has(spreadsheetId)) return;
  const metadata = await googleJson(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`
  );
  const existing = new Set<string>((metadata.sheets || []).map((sheet: any) => String(sheet?.properties?.title || '')));
  const missing = Object.values(STATE_TABS).filter((title) => !existing.has(title));
  if (missing.length === 0) {
    initializedSpreadsheets.add(spreadsheetId);
    return;
  }

  try {
    await googleJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: missing.map((title) => ({ addSheet: { properties: { title } } })) })
    });
    initializedSpreadsheets.add(spreadsheetId);
  } catch (error) {
    // Another function instance can create the same tabs between the metadata read and update.
    const refreshed = await googleJson(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`
    );
    const refreshedTitles = new Set<string>((refreshed.sheets || []).map((sheet: any) => String(sheet?.properties?.title || '')));
    if (missing.some((title) => !refreshedTitles.has(title))) throw error;
    initializedSpreadsheets.add(spreadsheetId);
  }
}

function parseJsonRows(values: any): any[] {
  if (!Array.isArray(values)) return [];
  return values.flatMap((row: any) => {
    if (!Array.isArray(row) || typeof row[1] !== 'string') return [];
    try {
      return [JSON.parse(row[1])];
    } catch {
      return [];
    }
  });
}

function recordId(value: any, index: number): string {
  return String(
    value?.Email || value?.id || value?.feedbackId || value?.reportId || value?.key || `row-${index + 1}`
  );
}

function jsonRows(values: any[]): string[][] {
  return values.map((value, index) => [recordId(value, index), JSON.stringify(value)]);
}

export async function loadStoreFromGoogleSheets<T extends GoogleWorkspaceStore>(
  normalize: (value: any) => T,
  fallback: T
): Promise<{ store: T; initialized: boolean }> {
  const spreadsheetId = getGoogleStateSpreadsheetId();
  await ensureStateTabs(spreadsheetId);
  const params = new URLSearchParams({ majorDimension: 'ROWS', valueRenderOption: 'UNFORMATTED_VALUE' });
  for (const title of Object.values(STATE_TABS)) params.append('ranges', `'${title}'!A2:B`);
  const data = await googleJson(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params}`
  );
  const ranges: any[] = Array.isArray(data.valueRanges) ? data.valueRanges : [];
  const rows = Object.fromEntries(
    (Object.keys(STATE_TABS) as StateKey[]).map((key, index) => [key, parseJsonRows(ranges[index]?.values)])
  ) as Record<StateKey, any[]>;
  const initialized = Object.values(rows).some((items) => items.length > 0);
  if (!initialized) return { store: structuredClone(fallback), initialized: false };

  const settings = Object.fromEntries((rows.settings || []).map((entry: any) => [entry?.key, entry?.value]));
  const config = rows.config[0] || fallback.config;
  return {
    initialized: true,
    store: normalize({
      ...fallback,
      people: rows.people,
      config,
      uploads: rows.uploads,
      directions: rows.directions,
      shiftReports: rows.shiftReports,
      activities: rows.activities,
      showCaptureForAdmin: Boolean(settings.showCaptureForAdmin),
      syncHealth: settings.syncHealth || fallback.syncHealth,
      // Secrets stay in Vercel environment variables rather than spreadsheet cells.
      clickUpToken: process.env.CLICKUP_API_TOKEN || '',
      drivePermissions: rows.drivePermissions,
      syncLedger: rows.syncLedger,
      syncLogs: rows.syncLogs
    })
  };
}

export async function saveStoreToGoogleSheets(store: GoogleWorkspaceStore): Promise<void> {
  const spreadsheetId = getGoogleStateSpreadsheetId();
  const valuesByKey: Record<StateKey, any[]> = {
    people: store.people,
    config: [store.config],
    uploads: store.uploads,
    directions: store.directions,
    shiftReports: store.shiftReports,
    activities: store.activities,
    settings: [
      { key: 'showCaptureForAdmin', value: store.showCaptureForAdmin },
      { key: 'syncHealth', value: store.syncHealth }
    ],
    drivePermissions: store.drivePermissions || [],
    syncLedger: store.syncLedger || [],
    syncLogs: store.syncLogs || []
  };

  const performWrite = async () => {
    await ensureStateTabs(spreadsheetId);
    const metadata = await googleJson(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties(sheetId,title,gridProperties.rowCount)`
    );
    const sheetByTitle = new Map<string, any>(
      (metadata.sheets || []).map((sheet: any) => [String(sheet?.properties?.title || ''), sheet?.properties])
    );
    await googleJson(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: (Object.keys(STATE_TABS) as StateKey[]).map((key) => {
            const properties = sheetByTitle.get(STATE_TABS[key]);
            if (!properties) throw new Error(`Google Sheet tab ${STATE_TABS[key]} is unavailable.`);
            const values = [['Record ID', 'JSON'], ...jsonRows(valuesByKey[key])];
            return {
              updateCells: {
                range: {
                  sheetId: properties.sheetId,
                  startRowIndex: 0,
                  endRowIndex: Math.max(Number(properties.gridProperties?.rowCount) || 1000, values.length),
                  startColumnIndex: 0,
                  endColumnIndex: 2
                },
                rows: values.map((row) => ({
                  values: row.map((cell) => ({ userEnteredValue: { stringValue: cell } }))
                })),
                fields: 'userEnteredValue'
              }
            };
          })
        })
      }
    );
  };

  writeQueue = writeQueue.catch(() => undefined).then(performWrite);
  await writeQueue;
}

export async function createGoogleDriveUploadSession(input: {
  fileName: string;
  mimeType: string;
  size: number;
  parentFolderId: string;
}): Promise<{ uploadUrl: string }> {
  const token = await getGoogleWorkspaceAccessToken();
  const query = new URLSearchParams({
    uploadType: 'resumable',
    supportsAllDrives: 'true',
    fields: 'id,name,mimeType,webViewLink,webContentLink,thumbnailLink'
  });
  const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files?${query}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': input.mimeType,
      'X-Upload-Content-Length': String(input.size),
      Accept: 'application/json'
    },
    body: JSON.stringify({ name: input.fileName, parents: [input.parentFolderId] })
  });
  const uploadUrl = response.headers.get('location');
  if (!response.ok || !uploadUrl) {
    const data: any = await response.json().catch(() => ({}));
    throw new Error(data?.error?.message || `Google Drive upload session failed (HTTP ${response.status}).`);
  }
  return { uploadUrl };
}

export async function uploadBufferToGoogleDrive(input: {
  fileName: string;
  mimeType: string;
  bytes: Buffer;
  parentFolderId: string;
}): Promise<{ id: string }> {
  const token = await getGoogleWorkspaceAccessToken();
  const boundary = `engagement_app_${crypto.randomBytes(12).toString('hex')}`;
  const metadata = JSON.stringify({ name: input.fileName, parents: [input.parentFolderId] });
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`
  );
  const suffix = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([prefix, input.bytes, suffix]);
  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(body.length),
        Accept: 'application/json'
      },
      body
    }
  );
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || !data?.id) {
    throw new Error(data?.error?.message || `Google Drive migration upload failed (HTTP ${response.status}).`);
  }
  return { id: String(data.id) };
}

export async function fetchGoogleDriveMedia(fileId: string): Promise<Response> {
  const token = await getGoogleWorkspaceAccessToken();
  return fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}
