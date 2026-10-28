import { Person, UploadItem, DirectionMessage, ShiftReport, SyncHealth, SyncLedgerEntry, SyncLogEntry } from '../types';

// Nobody is signed in until Google auth succeeds. The admin role is granted
// only to tanveer@empireonecx.com at sign-in, not by seeding a session.
export const INITIAL_PEOPLE: Person[] = [];

// Demo items removed: Clean operational slate
export const INITIAL_UPLOADS: UploadItem[] = [];

export const INITIAL_DIRECTIONS: DirectionMessage[] = [];

export const INITIAL_REPORTS: ShiftReport[] = [];

export const INITIAL_SYNC_HEALTH: SyncHealth = {
  version: '2.0.0',
  workspace: '90161592694',
  space: '1300380000003391',
  spaceName: 'Engagement',
  runner: 'engagement@empireonecx.com',
  paused: false,
  lastSync: '',
  syncState: 'OK',
  stages: []
};

export const INITIAL_LEDGER: SyncLedgerEntry[] = [];

export const INITIAL_LOGS: SyncLogEntry[] = [];
