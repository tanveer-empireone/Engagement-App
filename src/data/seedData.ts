import { Person, UploadItem, DirectionMessage, ShiftReport, SyncHealth, SyncLedgerEntry, SyncLogEntry } from '../types';

export const INITIAL_PEOPLE: Person[] = [
  {
    Email: 'tanveer@empireonecx.com',
    Name: 'Tanveer (Admin)',
    Role: 'Admin',
    Site: 'Cebu City',
    Shift: 'Peak',
    Active: true,
    Avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'
  }
];

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
