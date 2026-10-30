import { Person, UploadItem, DirectionMessage, ShiftReport, SyncHealth, SyncLedgerEntry, SyncLogEntry } from '../types';

export const INITIAL_PEOPLE: Person[] = [
  {
    Email: 'tanveer@empireonecx.com',
    Name: 'Tanveer Hussain',
    Role: 'Admin',
    Site: 'Cebu City',
    Shift: 'Peak',
    Active: true
  },
  {
    Email: 'shawn@empireonecx.com',
    Name: 'Shawn Habib',
    Role: 'Officer',
    Site: 'Toronto',
    Shift: 'Peak',
    Active: true
  },
  {
    Email: 'mika@empireonecx.com',
    Name: 'Mika Leopoldo',
    Role: 'Admin',
    Site: 'Cebu City',
    Shift: 'Peak',
    Active: true
  },
  {
    Email: 'maricarm@empireonegroup.com',
    Name: 'Maricar Montalban',
    Role: 'Officer',
    Site: 'Carcar',
    Shift: 'Peak',
    Active: true
  },
  {
    Email: 'hashie@empireonegroup.com',
    Name: 'Hashie Mae Bendecio',
    Role: 'Officer',
    Site: 'Carcar',
    Shift: 'Early',
    Active: true
  },
  {
    Email: 'scengagement@empireonegroup.com',
    Name: 'Ma. Teresa Detalla',
    Role: 'Officer',
    Site: 'San Carlos',
    Shift: 'Peak',
    Active: true
  },
  {
    Email: 'rheanne@empireonegroup.com',
    Name: 'Cris Rheanne Villaver',
    Role: 'Officer',
    Site: 'Cebu City',
    Shift: 'Peak',
    Active: false
  },
  {
    Email: 'marc@empireonecx.com',
    Name: 'Marc Louise Castanares',
    Role: 'Site Manager',
    Site: 'Carcar',
    Shift: 'Peak',
    Active: true
  },
  {
    Email: 'mark@empireonecx.com',
    Name: 'Mark Valencia',
    Role: 'Site Manager',
    Site: 'San Carlos',
    Shift: 'Peak',
    Active: true
  },
  {
    Email: 'dana@empireonecx.com',
    Name: 'Dana Surio',
    Role: 'Site Manager',
    Site: 'Urdaneta',
    Shift: 'Peak',
    Active: true
  },
  {
    Email: 'engagement@empireonecx.com',
    Name: 'E1 App Account',
    Role: 'Admin',
    Site: 'Toronto',
    Shift: 'Peak',
    Active: true
  }
];

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
