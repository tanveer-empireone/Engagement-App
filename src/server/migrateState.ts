import { isAdminEmail, normalizeEmail, clampRole } from '../utils/access';
import { safeLogLine } from './secrets';
import type { AppStore, PersonRecord, UploadRecord } from './store';
import { FOUNDING_ADMIN } from './store';
import type { DirectionMessage, ShiftReport } from '../types';

export interface MigrationPlan {
  people: number;
  directions: number;
  reports: number;
  uploads: number;
  unrecoverableUploads: number;
  tokenFieldPresent: boolean;
  lines: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function inspectServerState(raw: unknown): MigrationPlan {
  const body = asRecord(raw);
  const people = Array.isArray(body.people) ? body.people : [];
  const directions = Array.isArray(body.directions) ? body.directions : [];
  const reports = Array.isArray(body.shiftReports) ? body.shiftReports : [];
  const uploads = Array.isArray(body.uploads) ? body.uploads : [];
  const tokenFieldPresent = typeof body.clickUpToken === 'string' && body.clickUpToken.length > 0;
  const unrecoverableUploads = uploads.filter((item) => {
    const mediaUrl = String(asRecord(item).mediaUrl || '');
    return !mediaUrl || mediaUrl.startsWith('blob:');
  }).length;
  const lines = [
    `people: ${people.length}`,
    `directions: ${directions.length}`,
    `reports: ${reports.length}`,
    `uploads: ${uploads.length}`,
    `unrecoverable uploads: ${unrecoverableUploads}`,
    `token field present: ${tokenFieldPresent ? 'yes' : 'no'}`
  ].map(safeLogLine);
  return {
    people: people.length,
    directions: directions.length,
    reports: reports.length,
    uploads: uploads.length,
    unrecoverableUploads,
    tokenFieldPresent,
    lines
  };
}

export async function applyServerState(store: AppStore, raw: unknown): Promise<MigrationPlan> {
  const plan = inspectServerState(raw);
  const body = asRecord(raw);
  const people = Array.isArray(body.people) ? body.people : [];
  for (const item of people) {
    const row = asRecord(item);
    const email = normalizeEmail(String(row.Email || ''));
    if (!email.includes('@')) continue;
    const person: PersonRecord = {
      Email: email,
      Name: String(row.Name || email.split('@')[0]),
      Role: clampRole(email, String(row.Role || 'Officer')),
      Site: String(row.Site || 'Cebu City'),
      Shift: String(row.Shift || 'Peak'),
      Active: isAdminEmail(email) ? true : row.Active !== false,
      Avatar: typeof row.Avatar === 'string' && !row.Avatar.includes('pk_') ? row.Avatar : undefined
    };
    const existing = await store.findPerson(email);
    if (existing) await store.updatePerson(email, person);
    else await store.insertPerson(person);
  }
  if (!(await store.findPerson(FOUNDING_ADMIN.Email))) {
    await store.insertPerson(FOUNDING_ADMIN);
  } else {
    await store.updatePerson(FOUNDING_ADMIN.Email, { Role: 'Admin', Active: true });
  }

  for (const item of Array.isArray(body.directions) ? body.directions : []) {
    const direction = item as DirectionMessage;
    if (!direction?.feedbackId) continue;
    if (await store.findDirection(direction.feedbackId)) continue;
    await store.insertDirection(direction);
  }
  for (const item of Array.isArray(body.shiftReports) ? body.shiftReports : []) {
    const report = item as ShiftReport;
    if (!report?.reportId) continue;
    if (await store.findReport(report.reportId)) continue;
    await store.insertReport(report);
  }

  const config = asRecord(body.config);
  await store.updateConfig({
    sheetId: typeof config.sheetId === 'string' ? config.sheetId : undefined,
    driveRootId: typeof config.driveRootId === 'string' ? config.driveRootId : undefined,
    clickUpTeamId: typeof config.clickUpTeamId === 'string' ? config.clickUpTeamId : undefined,
    clickUpSpaceId: typeof config.clickUpSpaceId === 'string' ? config.clickUpSpaceId : undefined,
    appsScriptUrl: typeof config.appsScriptUrl === 'string' ? config.appsScriptUrl : undefined,
    showCaptureForAdmin: Boolean(body.showCaptureForAdmin)
  });

  for (const item of Array.isArray(body.uploads) ? body.uploads : []) {
    const row = asRecord(item);
    const id = String(row.id || '');
    if (!id || (await store.findUpload(id))) continue;
    const mediaUrl = String(row.mediaUrl || '');
    const unrecoverable = !mediaUrl || mediaUrl.startsWith('blob:');
    const upload: UploadRecord = {
      id,
      fileName: String(row.fileName || id),
      officer: normalizeEmail(String(row.officer || '')),
      officerName: String(row.officerName || ''),
      site: String(row.site || ''),
      shift: String(row.shift || ''),
      mode: row.mode === 'Event' ? 'Event' : 'Daily',
      eventName: String(row.eventName || ''),
      shiftDate: String(row.shiftDate || ''),
      topic: String(row.topic || ''),
      spot: String(row.spot || ''),
      mediaType: row.mediaType === 'Video' ? 'Video' : 'Photo',
      mediaUrl: '',
      capturedAt: String(row.capturedAt || ''),
      uploadedAt: String(row.uploadedAt || ''),
      note: unrecoverable ? String(row.note || '') : `${String(row.note || '')} Previous link was not imported as access.`.trim(),
      peopleInShot: String(row.peopleInShot || ''),
      consentSigned: Boolean(row.consentSigned),
      nothingConfidential: Boolean(row.nothingConfidential),
      topPick: Boolean(row.topPick),
      reviewStatus: (row.reviewStatus as UploadRecord['reviewStatus']) || 'Pending',
      folderPath: String(row.folderPath || ''),
      driveFileId: undefined,
      mediaStatus: unrecoverable ? 'unrecoverable' : 'unrecoverable'
    };
    await store.insertUpload(upload);
  }
  return plan;
}
