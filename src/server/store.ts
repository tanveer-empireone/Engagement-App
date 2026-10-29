import { DirectionMessage, Person, ReviewStatus, Role, ShiftReport, SyncHealth, UploadItem } from '../types';

export type MediaStatus = 'pending' | 'stored' | 'unrecoverable';

export interface PersonRecord {
  Email: string;
  Name: string;
  Role: Role;
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

export interface AppConfigState extends AppIntegrationConfig {
  showCaptureForAdmin: boolean;
  syncHealth: SyncHealth;
}

export interface UploadRecord extends UploadItem {
  driveFileId?: string;
  driveFolderId?: string;
  mediaStatus: MediaStatus;
  webViewLink?: string;
}

export interface PendingUpload {
  id: string;
  officerEmail: string;
  folderId: string;
  folderPath: string;
  fileName: string;
  payload: Record<string, unknown>;
}

export interface PublicState {
  people: Person[];
  config: AppIntegrationConfig;
  uploads: UploadItem[];
  directions: DirectionMessage[];
  shiftReports: ShiftReport[];
  showCaptureForAdmin: boolean;
  syncHealth: SyncHealth;
}

export const DEFAULT_CONFIG: AppConfigState = {
  sheetId: '1Ts2VFZawgF2SmU4VSQf0ld6p7cEHkmE2GLzc-dKfk5E',
  driveRootId: '1U-cZodmbBU6R7cFwp0p4Ily2_KPhPiSN',
  clickUpTeamId: '90161592694',
  clickUpSpaceId: '1300380000003391',
  appsScriptUrl: '',
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
  }
};

export const FOUNDING_ADMIN: PersonRecord = {
  Email: 'tanveer@empireonecx.com',
  Name: 'Tanveer',
  Role: 'Admin',
  Site: 'Cebu City',
  Shift: 'Peak',
  Active: true
};

export interface AppStore {
  listPeople(): Promise<PersonRecord[]>;
  findPerson(email: string): Promise<PersonRecord | null>;
  insertPerson(person: PersonRecord): Promise<PersonRecord>;
  updatePerson(email: string, patch: Partial<PersonRecord>): Promise<PersonRecord | null>;
  listUploadIds(): Promise<string[]>;
  findUpload(id: string): Promise<UploadRecord | null>;
  listUploads(): Promise<UploadRecord[]>;
  insertUpload(upload: UploadRecord): Promise<void>;
  updateUpload(id: string, patch: Partial<UploadRecord>): Promise<UploadRecord | null>;
  deleteUpload(id: string): Promise<boolean>;
  deleteAllUploads(): Promise<number>;
  listDirections(): Promise<DirectionMessage[]>;
  findDirection(id: string): Promise<DirectionMessage | null>;
  insertDirection(direction: DirectionMessage): Promise<void>;
  updateDirection(id: string, patch: Partial<DirectionMessage>): Promise<DirectionMessage | null>;
  deleteDirection(id: string): Promise<boolean>;
  deleteAllDirections(): Promise<number>;
  listReports(): Promise<ShiftReport[]>;
  findReport(id: string): Promise<ShiftReport | null>;
  insertReport(report: ShiftReport): Promise<void>;
  updateReport(id: string, patch: Partial<ShiftReport>): Promise<ShiftReport | null>;
  deleteReport(id: string): Promise<boolean>;
  deleteAllReports(): Promise<number>;
  getConfig(): Promise<AppConfigState>;
  updateConfig(patch: Partial<AppConfigState>): Promise<AppConfigState>;
  savePending(pending: PendingUpload): Promise<void>;
  getPending(id: string): Promise<PendingUpload | null>;
  deletePending(id: string): Promise<void>;
  resetSample(): Promise<void>;
}

export type ReviewDecision = ReviewStatus;
