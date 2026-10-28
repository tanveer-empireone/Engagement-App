/**
 * Google Drive Live Read Service
 * STRICTLY READ-ONLY: All API requests use HTTP GET. No create, upload, delete, or rename operations.
 */

export const TARGET_DRIVE_ROOT_FOLDER_ID = '1U-cZodmbBU6R7cFwp0p4Ily2_KPhPiSN';

export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  size?: number;
  createdTime?: string;
  modifiedTime?: string;
  thumbnailLink?: string;
  webViewLink?: string;
  webContentLink?: string;
  iconLink?: string;
  parents?: string[];
}

export interface LiveDriveResult {
  rootFolderId: string;
  rootFolderName: string;
  items: DriveItem[];
  folders: DriveItem[];
  recentMedia: DriveItem[];
  fetchedAt: string;
}

/**
 * Fetch files and folders inside a specific parent folder in Google Drive (HTTP GET only)
 */
export async function fetchDriveItemsInFolder(
  accessToken: string,
  folderId: string = TARGET_DRIVE_ROOT_FOLDER_ID
): Promise<DriveItem[]> {
  const query = `'${folderId}' in parents and trashed = false`;
  const fields = 'files(id,name,mimeType,size,createdTime,modifiedTime,thumbnailLink,webViewLink,webContentLink,iconLink,parents)';
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    query
  )}&fields=${encodeURIComponent(fields)}&pageSize=100&orderBy=folder,name`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Google Drive API error (${res.status}): ${errorText}`);
  }

  const json = await res.json();
  const rawFiles: any[] = json.files || [];

  return rawFiles.map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    isFolder: f.mimeType === 'application/vnd.google-apps.folder',
    size: f.size ? Number(f.size) : undefined,
    createdTime: f.createdTime,
    modifiedTime: f.modifiedTime,
    thumbnailLink: f.thumbnailLink,
    webViewLink: f.webViewLink,
    webContentLink: f.webContentLink,
    iconLink: f.iconLink,
    parents: f.parents
  }));
}

/**
 * Fetch recently uploaded media (images & videos) across Drive (HTTP GET only)
 */
export async function fetchRecentDriveMedia(
  accessToken: string,
  limit: number = 30
): Promise<DriveItem[]> {
  const query = `trashed = false and (mimeType contains 'image/' or mimeType contains 'video/')`;
  const fields = 'files(id,name,mimeType,size,createdTime,modifiedTime,thumbnailLink,webViewLink,webContentLink,parents)';
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    query
  )}&fields=${encodeURIComponent(fields)}&pageSize=${limit}&orderBy=createdTime desc`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  });

  if (!res.ok) {
    console.warn(`Could not query recent media from Drive (${res.status})`);
    return [];
  }

  const json = await res.json();
  const rawFiles: any[] = json.files || [];

  return rawFiles.map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    isFolder: false,
    size: f.size ? Number(f.size) : undefined,
    createdTime: f.createdTime,
    modifiedTime: f.modifiedTime,
    thumbnailLink: f.thumbnailLink,
    webViewLink: f.webViewLink,
    webContentLink: f.webContentLink,
    parents: f.parents
  }));
}

/**
 * Get folder metadata (e.g. name of the root folder)
 */
export async function getDriveItemDetails(
  accessToken: string,
  itemId: string = TARGET_DRIVE_ROOT_FOLDER_ID
): Promise<{ id: string; name: string; webViewLink?: string }> {
  const url = `https://www.googleapis.com/drive/v3/files/${itemId}?fields=id,name,webViewLink`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  });

  if (!res.ok) {
    return { id: itemId, name: 'E1CX Experience' };
  }

  const json = await res.json();
  return {
    id: json.id,
    name: json.name || 'E1CX Experience',
    webViewLink: json.webViewLink
  };
}

/**
 * Master function to fetch live Google Drive state for the E1CX root folder.
 * Guaranteed READ-ONLY.
 */
export async function fetchAllLiveDriveData(accessToken: string): Promise<LiveDriveResult> {
  const [rootDetails, items, recentMedia] = await Promise.all([
    getDriveItemDetails(accessToken, TARGET_DRIVE_ROOT_FOLDER_ID).catch(() => ({
      id: TARGET_DRIVE_ROOT_FOLDER_ID,
      name: 'E1CX Experience'
    })),
    fetchDriveItemsInFolder(accessToken, TARGET_DRIVE_ROOT_FOLDER_ID).catch(() => []),
    fetchRecentDriveMedia(accessToken, 30).catch(() => [])
  ]);

  const folders = items.filter((i) => i.isFolder);

  return {
    rootFolderId: TARGET_DRIVE_ROOT_FOLDER_ID,
    rootFolderName: rootDetails.name,
    items,
    folders,
    recentMedia,
    fetchedAt: new Date().toISOString()
  };
}
