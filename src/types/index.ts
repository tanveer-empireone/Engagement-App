export type Role = 'Admin' | 'Director' | 'Site Manager' | 'Creative Designer' | 'Officer';

export interface Site {
  Code: string; // e.g. 'CEB', 'CAR', 'SNC', 'URD', 'TOR', 'SMR'
  SiteName: string;
  FolderName: string;
  Timezone: string;
  Coordinates: { lat: number; lng: number };
  BulkFolder?: string;
}

export interface Person {
  Email: string;
  Name: string;
  Role: Role;
  Site: string;
  Shift?: string;
  Active: boolean;
  Avatar?: string;
}

export interface Topic {
  Topic: string;
  Code: string;
  Description?: string;
}

export type ReviewStatus = 'Pending' | 'Accepted' | 'Top pick' | 'Reshoot';
export type MediaType = 'Photo' | 'Video';
export type UploadMode = 'Daily' | 'Event';

export interface UploadItem {
  id: string; // e.g. CEB_20261027_REC_01
  fileName: string;
  officer: string;
  officerName?: string;
  site: string;
  shift: string;
  mode: UploadMode;
  eventName?: string;
  shiftDate: string; // yyyy-MM-dd
  topic: string;
  spot: string;
  mediaType: MediaType;
  mediaUrl: string; // URL / data URI / unsplash placeholder
  capturedAt: string; // ISO
  uploadedAt: string; // ISO
  location?: string; // "lat, lng"
  place?: string; // Geocoded name
  mapLink?: string; // Google Maps URL
  note: string;
  peopleInShot?: string;
  consentSigned: boolean;
  nothingConfidential: boolean;
  topPick: boolean;
  usedInFinal?: boolean;
  isCreativeWork?: boolean;
  creativeApprovedBy?: string;
  creativeApprovedAt?: string;
  reviewStatus: ReviewStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
  clickUpTask?: string;
  folderPath: string;
  fileSizeBytes?: number;
}

export interface DirectionMessage {
  feedbackId: string;
  title: string;
  message: string;
  type: 'Theme to communicate' | "Today's tasks";
  source: string; // "ClickUp:task_id:due" or "Meet:doc_id"
  fromPerson: string;
  sentAt: string;
  toAll: boolean;
  toSite?: string;
  toPerson?: string;
  status: 'Published' | 'Draft';
  acknowledged: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string[];
  reply?: string;
}

export interface ShiftReport {
  reportId: string;
  officer: string;
  officerName: string;
  site: string;
  shift: string;
  shiftDate: string;
  submittedAt?: string;
  engagementDone: string;
  photosCount: number;
  videosCount: number;
  hoursWorked: number;
  spotChecks: string[];
  notes?: string;
  verified: boolean;
  signedOff: boolean;
  clickUpTask?: string;
  isLate?: boolean;
}

export interface SyncStage {
  name: 'places' | 'directions' | 'followups' | 'events' | 'sheets' | 'drive' | 'clickup';
  state: 'OK' | 'Error' | 'Running' | 'Not run';
  at?: string;
  detail?: string;
}

export interface AppIntegrationConfig {
  sheetId: string;
  driveRootId: string;
  clickUpTeamId: string;
  clickUpSpaceId: string;
  appsScriptUrl: string;
}

export interface ConnectorReport {
  name: 'Google Sheets' | 'Google Drive' | 'ClickUp';
  state: 'OK' | 'Error' | 'Skipped';
  detail: string;
}

export interface SyncHealth {
  version: string;
  workspace: string;
  space: string;
  spaceName: string;
  runner: string;
  paused: boolean;
  lastSync: string;
  syncState: 'OK' | 'Error' | 'Not run';
  stages: SyncStage[];
}

export interface SyncLedgerEntry {
  key: string;
  listId: string;
  taskId: string;
  state: 'Pending' | 'Posting' | 'Created' | 'Commented' | 'Adopted' | 'Uncertain';
  updatedAt: string;
  error?: string;
}

export interface SyncLogEntry {
  id: string;
  time: string;
  stage: string;
  state: 'OK' | 'Error' | 'Info';
  detail: string;
}
