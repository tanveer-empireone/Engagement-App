import { mergeDriveRootChildren } from '../utils/driveDiscovery';

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

export interface DriveFolder {
  id: string;
  name: string;
  webViewLink?: string;
  createdTime?: string;
  modifiedTime?: string;
  itemCount?: number;
  imageCount?: number;
}

export interface DriveImageFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  createdTime?: string;
  modifiedTime?: string;
  thumbnailLink?: string;
  webViewLink?: string;
  webContentLink?: string;
  folderId?: string;
  folderName?: string;
}

export interface FolderWithImages {
  folder: DriveFolder;
  images: DriveImageFile[];
}

export interface DriveTreeResult {
  rootFolder: { id: string; name: string; webViewLink?: string };
  foldersWithImages: FolderWithImages[];
  rootImages: DriveImageFile[];
  totalFolders: number;
  totalImages: number;
  fetchedAt: string;
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
 * Fetch all Google Drive folders in the root folder, and fetch the images inside each folder.
 * Uses server proxy fallback for reliable execution in iframe preview.
 */
export async function fetchDriveTreeWithImages(
  accessToken: string,
  rootFolderId: string = TARGET_DRIVE_ROOT_FOLDER_ID
): Promise<DriveTreeResult> {
  // First try server proxy which handles nested folder batching securely and avoids CORS issues
  try {
    const proxyRes = await fetch('/api/drive/tree', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ token: accessToken, rootFolderId })
    });
    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data.ok && Array.isArray(data.foldersWithImages)) {
        return {
          rootFolder: data.rootFolder || { id: rootFolderId, name: 'E1CX Experience' },
          foldersWithImages: data.foldersWithImages,
          rootImages: data.rootImages || [],
          totalFolders: data.totalFolders || data.foldersWithImages.length,
          totalImages: data.totalImages || 0,
          fetchedAt: data.fetchedAt || new Date().toISOString()
        };
      }
    }
  } catch (proxyErr) {
    console.warn('Server proxy /api/drive/tree failed, attempting direct Drive API fetch...', proxyErr);
  }

  // Direct client fetch fallback
  const folderQuery = `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const sharedFolderQuery = `sharedWithMe = true and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const folderFields = 'files(id,name,mimeType,createdTime,modifiedTime,webViewLink,parents)';
  const folderUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=${encodeURIComponent(folderFields)}&pageSize=100&orderBy=name`;
  const sharedFolderUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(sharedFolderQuery)}&fields=${encodeURIComponent(folderFields)}&pageSize=100&orderBy=name`;

  const [folderRes, sharedFolderRes] = await Promise.all([
    fetch(folderUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
    }),
    fetch(sharedFolderUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
    })
  ]);

  if (!folderRes.ok) {
    const errText = await folderRes.text();
    throw new Error(`Google Drive API error (${folderRes.status}): ${errText}`);
  }

  const folderData = await folderRes.json();
  const sharedFolderData = sharedFolderRes.ok ? await sharedFolderRes.json() : { files: [] };
  const rawFolders: any[] = mergeDriveRootChildren(
    rootFolderId,
    folderData.files || [],
    sharedFolderData.files || []
  );

  const imageFields = 'files(id,name,mimeType,size,createdTime,modifiedTime,thumbnailLink,webViewLink,webContentLink,iconLink,parents)';
  const foldersWithImages: FolderWithImages[] = await Promise.all(
    rawFolders.map(async (folder) => {
      try {
        const imgQuery = `'${folder.id}' in parents and (mimeType contains 'image/' or mimeType contains 'video/') and trashed = false`;
        const imgUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(imgQuery)}&fields=${encodeURIComponent(imageFields)}&pageSize=100&orderBy=createdTime desc`;
        const imgRes = await fetch(imgUrl, {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
        });
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

  return {
    rootFolder: { id: rootFolderId, name: 'E1CX Experience' },
    foldersWithImages,
    rootImages: [],
    totalFolders: foldersWithImages.length,
    totalImages: foldersWithImages.reduce((sum, f) => sum + f.images.length, 0),
    fetchedAt: new Date().toISOString()
  };
}

