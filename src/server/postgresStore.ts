import pg from 'pg';
import { DirectionMessage, ShiftReport } from '../types';
import { SCHEMA_SQL } from './schema';
import {
  AppConfigState,
  AppStore,
  DEFAULT_CONFIG,
  FOUNDING_ADMIN,
  PendingUpload,
  PersonRecord,
  UploadRecord
} from './store';

const { Pool } = pg;

function personFromRow(row: {
  email: string;
  name: string;
  role: PersonRecord['Role'];
  site: string;
  shift: string;
  active: boolean;
  avatar: string | null;
}): PersonRecord {
  return {
    Email: row.email,
    Name: row.name,
    Role: row.role,
    Site: row.site,
    Shift: row.shift,
    Active: row.active,
    Avatar: row.avatar || undefined
  };
}

function uploadFromRow(row: {
  id: string;
  officer_email: string;
  drive_file_id: string | null;
  drive_folder_id: string | null;
  media_status: UploadRecord['mediaStatus'];
  payload: UploadRecord;
}): UploadRecord {
  return {
    ...row.payload,
    id: row.id,
    officer: row.officer_email,
    driveFileId: row.drive_file_id || undefined,
    driveFolderId: row.drive_folder_id || undefined,
    mediaStatus: row.media_status,
    mediaUrl: ''
  };
}

export class PostgresStore implements AppStore {
  constructor(private readonly pool: pg.Pool) {}

  static async connect(databaseUrl: string): Promise<PostgresStore> {
    const pool = new Pool({ connectionString: databaseUrl });
    const store = new PostgresStore(pool);
    await store.pool.query(SCHEMA_SQL);
    const existing = await store.pool.query('SELECT email FROM people WHERE email = $1', [FOUNDING_ADMIN.Email]);
    if (existing.rowCount === 0) {
      const people = await store.pool.query('SELECT count(*)::int AS count FROM people');
      if (people.rows[0].count === 0) await store.insertPerson(FOUNDING_ADMIN);
    }
    const config = await store.pool.query('SELECT id FROM config WHERE id = 1');
    if (config.rowCount === 0) await store.updateConfig(DEFAULT_CONFIG);
    return store;
  }

  async close() {
    await this.pool.end();
  }

  async listPeople() {
    const result = await this.pool.query(
      'SELECT email, name, role, site, shift, active, avatar FROM people ORDER BY email'
    );
    return result.rows.map(personFromRow);
  }

  async findPerson(email: string) {
    const result = await this.pool.query(
      'SELECT email, name, role, site, shift, active, avatar FROM people WHERE email = $1',
      [email.trim().toLowerCase()]
    );
    return result.rows[0] ? personFromRow(result.rows[0]) : null;
  }

  async insertPerson(person: PersonRecord) {
    const email = person.Email.trim().toLowerCase();
    await this.pool.query(
      `INSERT INTO people (email, name, role, site, shift, active, avatar)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [email, person.Name, person.Role, person.Site, person.Shift || 'Peak', person.Active, person.Avatar || null]
    );
    return { ...person, Email: email };
  }

  async updatePerson(email: string, patch: Partial<PersonRecord>) {
    const existing = await this.findPerson(email);
    if (!existing) return null;
    const next = { ...existing, ...patch, Email: existing.Email };
    await this.pool.query(
      `UPDATE people SET name = $2, role = $3, site = $4, shift = $5, active = $6, avatar = $7 WHERE email = $1`,
      [existing.Email, next.Name, next.Role, next.Site, next.Shift || 'Peak', next.Active, next.Avatar || null]
    );
    return next;
  }

  async listUploadIds() {
    const result = await this.pool.query('SELECT id FROM uploads');
    return result.rows.map((row) => row.id as string);
  }

  async findUpload(id: string) {
    const result = await this.pool.query(
      'SELECT id, officer_email, drive_file_id, drive_folder_id, media_status, payload FROM uploads WHERE id = $1',
      [id]
    );
    return result.rows[0] ? uploadFromRow(result.rows[0]) : null;
  }

  async listUploads() {
    const result = await this.pool.query(
      'SELECT id, officer_email, drive_file_id, drive_folder_id, media_status, payload FROM uploads ORDER BY payload->>\'uploadedAt\' DESC NULLS LAST'
    );
    return result.rows.map(uploadFromRow);
  }

  async insertUpload(upload: UploadRecord) {
    const payload = { ...upload };
    delete payload.driveFolderId;
    payload.mediaUrl = '';
    await this.pool.query(
      `INSERT INTO uploads (id, officer_email, drive_file_id, drive_folder_id, media_status, payload)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        upload.id,
        upload.officer.trim().toLowerCase(),
        upload.driveFileId || null,
        upload.driveFolderId || null,
        upload.mediaStatus,
        JSON.stringify(payload)
      ]
    );
  }

  async updateUpload(id: string, patch: Partial<UploadRecord>) {
    const existing = await this.findUpload(id);
    if (!existing) return null;
    const next = { ...existing, ...patch, id: existing.id };
    await this.pool.query('DELETE FROM uploads WHERE id = $1', [id]);
    await this.insertUpload(next);
    return next;
  }

  async deleteUpload(id: string) {
    const result = await this.pool.query('DELETE FROM uploads WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  async deleteAllUploads() {
    const result = await this.pool.query('DELETE FROM uploads');
    return result.rowCount || 0;
  }

  async listDirections() {
    const result = await this.pool.query('SELECT payload FROM directions');
    return result.rows.map((row) => row.payload as DirectionMessage);
  }

  async findDirection(id: string) {
    const result = await this.pool.query('SELECT payload FROM directions WHERE feedback_id = $1', [id]);
    return (result.rows[0]?.payload as DirectionMessage) || null;
  }

  async insertDirection(direction: DirectionMessage) {
    await this.pool.query('INSERT INTO directions (feedback_id, payload) VALUES ($1, $2::jsonb)', [
      direction.feedbackId,
      JSON.stringify(direction)
    ]);
  }

  async updateDirection(id: string, patch: Partial<DirectionMessage>) {
    const existing = await this.findDirection(id);
    if (!existing) return null;
    const next = { ...existing, ...patch, feedbackId: existing.feedbackId };
    await this.pool.query('UPDATE directions SET payload = $2::jsonb WHERE feedback_id = $1', [id, JSON.stringify(next)]);
    return next;
  }

  async deleteDirection(id: string) {
    const result = await this.pool.query('DELETE FROM directions WHERE feedback_id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  async deleteAllDirections() {
    const result = await this.pool.query('DELETE FROM directions');
    return result.rowCount || 0;
  }

  async listReports() {
    const result = await this.pool.query('SELECT payload FROM reports');
    return result.rows.map((row) => row.payload as ShiftReport);
  }

  async findReport(id: string) {
    const result = await this.pool.query('SELECT payload FROM reports WHERE report_id = $1', [id]);
    return (result.rows[0]?.payload as ShiftReport) || null;
  }

  async insertReport(report: ShiftReport) {
    await this.pool.query('INSERT INTO reports (report_id, payload) VALUES ($1, $2::jsonb)', [
      report.reportId,
      JSON.stringify(report)
    ]);
  }

  async updateReport(id: string, patch: Partial<ShiftReport>) {
    const existing = await this.findReport(id);
    if (!existing) return null;
    const next = { ...existing, ...patch, reportId: existing.reportId };
    await this.pool.query('UPDATE reports SET payload = $2::jsonb WHERE report_id = $1', [id, JSON.stringify(next)]);
    return next;
  }

  async deleteReport(id: string) {
    const result = await this.pool.query('DELETE FROM reports WHERE report_id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  async deleteAllReports() {
    const result = await this.pool.query('DELETE FROM reports');
    return result.rowCount || 0;
  }

  async getConfig(): Promise<AppConfigState> {
    const result = await this.pool.query(
      `SELECT sheet_id, drive_root_id, clickup_team_id, clickup_space_id, apps_script_url, show_capture_for_admin, sync_health
       FROM config WHERE id = 1`
    );
    const row = result.rows[0];
    if (!row) return { ...DEFAULT_CONFIG };
    return {
      sheetId: row.sheet_id,
      driveRootId: row.drive_root_id,
      clickUpTeamId: row.clickup_team_id,
      clickUpSpaceId: row.clickup_space_id,
      appsScriptUrl: row.apps_script_url,
      showCaptureForAdmin: row.show_capture_for_admin,
      syncHealth: row.sync_health || DEFAULT_CONFIG.syncHealth
    };
  }

  async updateConfig(patch: Partial<AppConfigState>) {
    const current = await this.getConfig();
    const next = { ...DEFAULT_CONFIG, ...current };
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) (next as Record<string, unknown>)[key] = value;
    }
    await this.pool.query(
      `INSERT INTO config (id, sheet_id, drive_root_id, clickup_team_id, clickup_space_id, apps_script_url, show_capture_for_admin, sync_health)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         sheet_id = EXCLUDED.sheet_id,
         drive_root_id = EXCLUDED.drive_root_id,
         clickup_team_id = EXCLUDED.clickup_team_id,
         clickup_space_id = EXCLUDED.clickup_space_id,
         apps_script_url = EXCLUDED.apps_script_url,
         show_capture_for_admin = EXCLUDED.show_capture_for_admin,
         sync_health = EXCLUDED.sync_health`,
      [
        next.sheetId,
        next.driveRootId,
        next.clickUpTeamId,
        next.clickUpSpaceId,
        next.appsScriptUrl,
        next.showCaptureForAdmin,
        JSON.stringify(next.syncHealth)
      ]
    );
    return next;
  }

  async savePending(pending: PendingUpload) {
    await this.pool.query(
      `INSERT INTO pending_uploads (id, officer_email, folder_id, folder_path, file_name, payload)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (id) DO UPDATE SET folder_id = EXCLUDED.folder_id, payload = EXCLUDED.payload`,
      [
        pending.id,
        pending.officerEmail,
        pending.folderId,
        pending.folderPath,
        pending.fileName,
        JSON.stringify(pending.payload)
      ]
    );
  }

  async getPending(id: string) {
    const result = await this.pool.query(
      'SELECT id, officer_email, folder_id, folder_path, file_name, payload FROM pending_uploads WHERE id = $1',
      [id]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      officerEmail: row.officer_email,
      folderId: row.folder_id,
      folderPath: row.folder_path,
      fileName: row.file_name,
      payload: row.payload
    };
  }

  async deletePending(id: string) {
    await this.pool.query('DELETE FROM pending_uploads WHERE id = $1', [id]);
  }

  async resetSample() {
    await this.pool.query('DELETE FROM pending_uploads');
    await this.pool.query('DELETE FROM uploads');
    await this.pool.query('DELETE FROM directions');
    await this.pool.query('DELETE FROM reports');
    await this.pool.query('DELETE FROM people');
    await this.insertPerson(FOUNDING_ADMIN);
    await this.updateConfig(DEFAULT_CONFIG);
  }
}

export function assertLocalOrExplicitDatabaseUrl(databaseUrl: string, allowRemote: boolean): void {
  let host = '';
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new Error('DATABASE_URL is not a valid URL.');
  }
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (/prod/i.test(host)) {
    throw new Error('Refusing a database host whose name contains "prod".');
  }
  if (!local && !allowRemote) {
    throw new Error('Refusing a non-local DATABASE_URL. Set E1_ALLOW_REMOTE_DATABASE=1 only for the staging database.');
  }
}
