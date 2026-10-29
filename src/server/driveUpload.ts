import { createSign } from 'crypto';
import { ServiceUnavailableError } from './errors';

export interface DriveFileInfo {
  id: string;
  parents: string[];
  thumbnailLink?: string;
  webViewLink?: string;
}

export interface DriveClient {
  configured: boolean;
  ensureFolder(rootId: string, folderPath: string): Promise<string>;
  startResumable(input: {
    name: string;
    mimeType: string;
    size: number;
    parentId: string;
  }): Promise<string>;
  getFile(fileId: string): Promise<DriveFileInfo | null>;
}

const MISSING =
  'Google Drive is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON to a service account that can edit the Drive root folder.';

export function unconfiguredDrive(): DriveClient {
  return {
    configured: false,
    async ensureFolder() {
      throw new ServiceUnavailableError(MISSING);
    },
    async startResumable() {
      throw new ServiceUnavailableError(MISSING);
    },
    async getFile() {
      throw new ServiceUnavailableError(MISSING);
    }
  };
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export function driveClientFromEnv(env: NodeJS.ProcessEnv = process.env): DriveClient {
  const raw = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return unconfiguredDrive();
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (!parsed.client_email || !parsed.private_key) return unconfiguredDrive();
    return new GoogleServiceAccountDrive({ client_email: parsed.client_email, private_key: parsed.private_key });
  } catch {
    return unconfiguredDrive();
  }
}

export class GoogleServiceAccountDrive implements DriveClient {
  configured = true;
  private token: { value: string; exp: number } | null = null;

  constructor(private readonly account: ServiceAccount) {}

  async ensureFolder(rootId: string, folderPath: string): Promise<string> {
    let parent = rootId;
    const parts = folderPath.split('/').map((part) => part.trim()).filter(Boolean);
    for (const name of parts) {
      parent = await this.findOrCreateFolder(parent, name);
    }
    return parent;
  }

  async startResumable(input: { name: string; mimeType: string; size: number; parentId: string }): Promise<string> {
    const token = await this.accessToken();
    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': input.mimeType,
          'X-Upload-Content-Length': String(input.size)
        },
        body: JSON.stringify({ name: input.name, parents: [input.parentId] })
      }
    );
    if (!response.ok) {
      throw new Error(`Drive upload session failed (${response.status}).`);
    }
    const location = response.headers.get('location');
    if (!location) throw new Error('Drive did not return an upload session.');
    return location;
  }

  async getFile(fileId: string): Promise<DriveFileInfo | null> {
    const token = await this.accessToken();
    const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
    url.searchParams.set('fields', 'id,parents,thumbnailLink,webViewLink');
    url.searchParams.set('supportsAllDrives', 'true');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Drive file lookup failed (${response.status}).`);
    const body = (await response.json()) as DriveFileInfo;
    return { id: body.id, parents: body.parents || [], thumbnailLink: body.thumbnailLink, webViewLink: body.webViewLink };
  }

  private async findOrCreateFolder(parentId: string, name: string): Promise<string> {
    const token = await this.accessToken();
    const escaped = name.replace(/'/g, "\\'");
    const query = `name = '${escaped}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', query);
    url.searchParams.set('fields', 'files(id,name)');
    url.searchParams.set('pageSize', '1');
    url.searchParams.set('supportsAllDrives', 'true');
    url.searchParams.set('includeItemsFromAllDrives', 'true');
    const found = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!found.ok) throw new Error(`Drive folder lookup failed (${found.status}).`);
    const listed = (await found.json()) as { files?: Array<{ id: string }> };
    if (listed.files?.[0]?.id) return listed.files[0].id;
    const created = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
    });
    if (!created.ok) throw new Error(`Drive folder create failed (${created.status}).`);
    const folder = (await created.json()) as { id: string };
    return folder.id;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.exp > Date.now() + 60_000) return this.token.value;
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claim = Buffer.from(
      JSON.stringify({
        iss: this.account.client_email,
        scope: 'https://www.googleapis.com/auth/drive',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600
      })
    ).toString('base64url');
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${claim}`);
    const assertion = `${header}.${claim}.${signer.sign(this.account.private_key).toString('base64url')}`;
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
    });
    if (!response.ok) throw new ServiceUnavailableError('Google Drive rejected the service account.');
    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new ServiceUnavailableError('Google Drive did not return an access token.');
    this.token = { value: body.access_token, exp: Date.now() + (body.expires_in || 3600) * 1000 };
    return body.access_token;
  }
}
