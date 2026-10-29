import type { UploadItem } from '../types';
import { stripSecrets } from './secrets';
import type { PublicState, UploadRecord } from './store';

export function presentUpload(upload: UploadRecord): UploadItem {
  const stored = upload.mediaStatus === 'stored' && !!upload.driveFileId;
  const driveFileId = stored ? upload.driveFileId : undefined;
  const presented: UploadItem = {
    ...upload,
    driveFileId,
    mediaStatus: upload.mediaStatus,
    mediaUrl: driveFileId
      ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveFileId)}&sz=w400`
      : '',
    webViewLink: driveFileId ? `https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/view` : undefined
  };
  delete (presented as { driveFolderId?: string }).driveFolderId;
  if (!stored) {
    presented.mediaUrl = '';
    delete presented.webViewLink;
  }
  return stripSecrets(presented);
}

export function presentState(state: PublicState): PublicState {
  return stripSecrets({
    ...state,
    uploads: state.uploads.map((upload) => presentUpload(upload as UploadRecord))
  });
}
