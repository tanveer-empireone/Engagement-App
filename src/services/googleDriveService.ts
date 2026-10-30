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
export async function fetchAllLiveDriveData(
  accessToken: string,
  rootFolderId: string = TARGET_DRIVE_ROOT_FOLDER_ID
): Promise<LiveDriveResult> {
  const [rootDetails, items, recentMedia] = await Promise.all([
    getDriveItemDetails(accessToken, rootFolderId).catch(() => ({
      id: rootFolderId,
      name: 'E1CX Experience'
    })),
    fetchDriveItemsInFolder(accessToken, rootFolderId).catch(() => []),
    fetchRecentDriveMedia(accessToken, 30).catch(() => [])
  ]);

  const folders = items.filter((i) => i.isFolder);

  return {
    rootFolderId,
    rootFolderName: rootDetails.name,
    items,
    folders,
    recentMedia,
    fetchedAt: new Date().toISOString()
  };
}

/**
 * Find or create a subfolder by name inside a parent folder in Google Drive.
 */
export async function ensureDriveFolder(
  accessToken: string,
  parentFolderId: string,
  folderName: string
): Promise<string> {
  const query = `'${parentFolderId}' in parents and name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1`;

  const searchRes = await fetch(searchUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  });

  if (searchRes.ok) {
    const data = await searchRes.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
  }

  // Create folder
  const createUrl = 'https://www.googleapis.com/drive/v3/files?fields=id,name';
  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId]
    })
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Failed to create Drive folder "${folderName}": ${err}`);
  }

  const created = await createRes.json();
  return created.id;
}

/**
 * Ensure a full nested folder path in Google Drive, e.g. ['Bacolod HQ', 'Daily', '2026-10-30'].
 */
export async function ensureFolderPath(
  accessToken: string,
  rootFolderId: string = TARGET_DRIVE_ROOT_FOLDER_ID,
  pathParts: string[]
): Promise<string> {
  let currentParent = rootFolderId;
  for (const part of pathParts) {
    if (!part || !part.trim()) continue;
    currentParent = await ensureDriveFolder(accessToken, currentParent, part.trim());
  }
  return currentParent;
}

/**
 * Upload a media File or Blob to Google Drive using multipart upload.
 * Returns the Drive fileId, webViewLink, and thumbnailLink.
 */
export async function uploadFileToDrive(
  accessToken: string,
  folderId: string,
  file: File | Blob,
  fileName: string
): Promise<{ id: string; name: string; webViewLink?: string; thumbnailLink?: string }> {
  const boundary = `-------e1_upload_${Date.now()}`;
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const mimeType = file.type || 'image/jpeg';
  const metadata = JSON.stringify({
    name: fileName,
    parents: [folderId],
    description: 'Uploaded via E1 Engagement Capture'
  });

  const multipartBlob = new Blob([
    `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${metadata}`,
    `${delimiter}Content-Type: ${mimeType}\r\n\r\n`,
    file,
    closeDelimiter
  ]);

  const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,thumbnailLink';
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: multipartBlob
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Google Drive upload failed (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  return {
    id: data.id,
    name: data.name || fileName,
    webViewLink: data.webViewLink,
    thumbnailLink: data.thumbnailLink || (data.id ? `https://drive.google.com/thumbnail?id=${data.id}&sz=w800` : undefined)
  };
}
