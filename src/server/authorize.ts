import { isAdminEmail, normalizeEmail, clampRole } from '../utils/access';
import type { PersonRecord, UploadRecord } from './store';
import type { ShiftReport } from '../types';

export function isActiveAdmin(person: PersonRecord | null): boolean {
  return !!person && person.Active !== false && person.Role === 'Admin';
}

export function canReviewUpload(person: PersonRecord, upload: { site: string }): boolean {
  if (person.Active === false) return false;
  if (person.Role === 'Admin' || person.Role === 'Engagement Lead' || person.Role === 'Creative Designer') {
    return true;
  }
  if (person.Role === 'Site Manager') return person.Site === upload.site;
  return false;
}

export function canReviewReport(person: PersonRecord, report: Pick<ShiftReport, 'site'>): boolean {
  return canReviewUpload(person, report);
}

export function canPublishDirection(person: PersonRecord): boolean {
  return person.Active !== false && (person.Role === 'Admin' || person.Role === 'Engagement Lead');
}

export function selfEditForbidden(caller: PersonRecord, targetEmail: string, existing: PersonRecord, patch: Partial<PersonRecord>): boolean {
  if (normalizeEmail(caller.Email) !== normalizeEmail(targetEmail)) return false;
  if (isAdminEmail(targetEmail)) return false;
  if (patch.Role !== undefined && patch.Role !== existing.Role) return true;
  if (patch.Site !== undefined && patch.Site !== existing.Site) return true;
  if (patch.Shift !== undefined && patch.Shift !== existing.Shift) return true;
  if (patch.Active !== undefined && Boolean(patch.Active) !== existing.Active) return true;
  return false;
}

export function applyPersonPatch(existing: PersonRecord, patch: Partial<PersonRecord>): PersonRecord {
  const next: PersonRecord = {
    ...existing,
    Name: typeof patch.Name === 'string' && patch.Name.trim() ? patch.Name.trim() : existing.Name,
    Site: typeof patch.Site === 'string' && patch.Site.trim() ? patch.Site : existing.Site,
    Shift: typeof patch.Shift === 'string' && patch.Shift.trim() ? patch.Shift : existing.Shift,
    Avatar: patch.Avatar !== undefined ? patch.Avatar : existing.Avatar
  };
  if (isAdminEmail(existing.Email)) {
    next.Role = 'Admin';
    next.Active = true;
    return next;
  }
  if (patch.Role !== undefined) next.Role = clampRole(existing.Email, patch.Role);
  if (patch.Active !== undefined) next.Active = Boolean(patch.Active);
  return next;
}

export function canAccessUploadRecord(_person: PersonRecord, _upload: UploadRecord): boolean {
  return true;
}
