import { subscribeServerState, saveServerSettings } from '../utils/serverSync';
import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
import { User } from 'firebase/auth';
import {
  Person,
  Site,
  Topic,
  UploadItem,
  DirectionMessage,
  ShiftReport,
  SyncHealth,
  SyncLedgerEntry,
  SyncLogEntry,
  ReviewStatus,
  Role,
  AppIntegrationConfig,
  ConnectorReport,
  UserActivity,
  DrivePermissionGrant
} from '../types';
import {
  INITIAL_PEOPLE,
  INITIAL_UPLOADS,
  INITIAL_DIRECTIONS,
  INITIAL_REPORTS,
  INITIAL_SYNC_HEALTH,
  INITIAL_LEDGER,
  INITIAL_LOGS
} from '../data/seedData';

function getLocalAckMap(email?: string): Record<string, { acknowledgedAt: string; reply?: string }> {
  try {
    const key = `e1_acks_${(email || '').trim().toLowerCase()}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalAck(email: string | undefined, feedbackId: string, reply?: string) {
  try {
    const key = `e1_acks_${(email || '').trim().toLowerCase()}`;
    const map = getLocalAckMap(email);
    map[feedbackId] = { acknowledgedAt: new Date().toISOString(), reply };
    localStorage.setItem(key, JSON.stringify(map));
  } catch (err) {
    console.warn('Failed to save ack to localStorage:', err);
  }
}

function applyAckMap(
  dirs: DirectionMessage[],
  email: string | undefined
): DirectionMessage[] {
  const normEmail = (email || '').trim().toLowerCase();
  const ackMap = getLocalAckMap(email);
  return dirs.map((d) => {
    const local = ackMap[d.feedbackId];
    const isAckedByEmail = Boolean(
      normEmail && d.acknowledgedBy?.some((e) => (e || '').trim().toLowerCase() === normEmail)
    );
    if (local || isAckedByEmail || d.acknowledged) {
      const ackByList = d.acknowledgedBy || [];
      const mergedBy = normEmail && !ackByList.includes(normEmail) ? [...ackByList, normEmail] : ackByList;
      return {
        ...d,
        acknowledged: true,
        acknowledgedAt: d.acknowledgedAt || local?.acknowledgedAt || new Date().toISOString(),
        acknowledgedBy: mergedBy,
        reply: d.reply || local?.reply
      };
    }
    return d;
  });
}
import {
  SITES_METADATA,
  TOPICS_LIST,
  generateUploadId,
  buildE1FileName,
  buildFolderPath,
  calculateTopPickRoom,
  formatYmdClean,
  reverseGeocodeApprox
} from '../utils/idGenerator';
import {
  canOpenAdminPanel,
  canSeeIntegrations,
  canUseCapture,
  isAdminPerson,
  isDirectorPerson,
  canApproveFinalCreative,
  canGrantAdminRole,
  normalizeEmail,
  resolveSessionPerson,
  samePersonRecord,
  sanitizeDirectory,
  sanitizePerson
} from '../utils/access';
import {
  initAuth,
  googleSignIn,
  logout as googleLogout,
  getAccessToken
} from '../services/googleAuth';
import {
  fetchAllLiveSheetData,
  TARGET_SPREADSHEET_ID,
  appendUserToSheet,
  updateUserInSheet
} from '../services/googleSheetsService';
import {
  fetchAllLiveDriveData,
  TARGET_DRIVE_ROOT_FOLDER_ID
} from '../services/googleDriveService';
import {
  fetchAllLiveClickUpData,
  testClickUpConnection,
  getStoredClickUpToken,
  saveStoredClickUpToken,
  CLICKUP_ENGAGEMENT_SPACE_ID,
  CLICKUP_TEAM_ID
} from '../services/clickupService';
import { getAppsScriptConfig, saveAppsScriptConfig } from '../services/appsScriptService';

export interface DirectoryUserInput {
  email: string;
  name: string;
  role: Role;
  site: string;
  shift: string;
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

interface AppContextType {
  currentUser: Person | null;
  people: Person[];
  sites: Site[];
  topics: Topic[];
  uploads: UploadItem[];
  directions: DirectionMessage[];
  shiftReports: ShiftReport[];
  syncHealth: SyncHealth;
  syncLedger: SyncLedgerEntry[];
  syncLogs: SyncLogEntry[];

  authReady: boolean;
  googleUser: User | null;
  googleToken: string | null;
  isGoogleConnected: boolean;
  isSigningInGoogle: boolean;
  isFetchingLiveSheets: boolean;
  isFetchingLiveDrive: boolean;
  liveSheetsMeta: Awaited<ReturnType<typeof fetchAllLiveSheetData>> | null;
  liveDriveData: Awaited<ReturnType<typeof fetchAllLiveDriveData>> | null;

  clickUpToken: string;
  setClickUpToken: (token: string) => Promise<ActionResult>;
  isClickUpConnected: boolean;
  isFetchingClickUp: boolean;
  liveClickUpData: Awaited<ReturnType<typeof fetchAllLiveClickUpData>> | null;
  liveError: string | null;
  appConfig: AppIntegrationConfig;
  lastSyncReport: ConnectorReport[] | null;

  canReview: boolean;
  canPublish: boolean;
  isWide: boolean;
  isAdmin: boolean;
  isTechnicalAdmin: boolean;
  isDirector: boolean;
  canApproveCreative: boolean;
  showCaptureForAdmin: boolean;
  setShowCaptureForAdmin: (value: boolean) => Promise<ActionResult>;
  canUseCapture: boolean;
  canSeeIntegrations: boolean;

  signInWithGoogle: () => Promise<void>;
  signOutGoogle: () => Promise<void>;
  fetchLiveSheets: () => Promise<ConnectorReport>;
  fetchLiveDrive: () => Promise<ConnectorReport>;
  fetchLiveClickUp: () => Promise<ConnectorReport>;
  fetchLiveAllData: () => Promise<void>;
  testClickUpToken: (token: string) => Promise<{ success: boolean; message: string }>;
  updateAppConfig: (patch: Partial<AppIntegrationConfig>) => Promise<ActionResult>;

  addDirectoryUser: (input: DirectoryUserInput) => Promise<ActionResult>;
  updateDirectoryUser: (email: string, patch: Partial<Pick<Person, 'Name' | 'Role' | 'Site' | 'Shift' | 'Active'>>) => Promise<ActionResult>;
  removeDirectoryUser: (email: string) => Promise<ActionResult>;
  setActiveShift: (shift: string) => Promise<ActionResult>;

  updateUpload: (id: string, patch: Partial<Pick<UploadItem, 'note' | 'reviewStatus' | 'reviewNote' | 'topPick' | 'site' | 'topic' | 'spot'>>) => Promise<ActionResult>;
  deleteUpload: (id: string) => Promise<ActionResult>;
  deleteAllUploads: () => Promise<ActionResult>;
  updateDirection: (feedbackId: string, patch: Partial<Pick<DirectionMessage, 'title' | 'message' | 'status' | 'acknowledged' | 'toSite' | 'toAll'>>) => Promise<ActionResult>;
  deleteDirection: (feedbackId: string) => Promise<ActionResult>;
  deleteAllDirections: () => Promise<ActionResult>;
  updateShiftReport: (reportId: string, patch: Partial<Pick<ShiftReport, 'engagementDone' | 'notes' | 'verified' | 'signedOff' | 'hoursWorked'>>) => Promise<ActionResult>;
  deleteShiftReport: (reportId: string) => Promise<ActionResult>;
  deleteAllShiftReports: () => Promise<ActionResult>;

  addBatchUploads: (filesData: Array<{
    site: string;
    shift: string;
    mode: 'Daily' | 'Event';
    eventName?: string;
    shiftDate: string;
    topic: string;
    spot: string;
    mediaType: 'Photo' | 'Video';
    mediaUrl: string;
    fileSizeBytes?: number;
    capturedAt: string;
    location?: string;
    note: string;
    peopleInShot?: string;
    consentSigned: boolean;
    nothingConfidential: boolean;
    topPick: boolean;
    ext?: string;
    isCreativeWork?: boolean;
  }>) => Promise<UploadItem[]>;
  reviewUpload: (id: string, decision: ReviewStatus, note?: string) => Promise<ActionResult>;
  toggleUsedInFinal: (id: string) => Promise<ActionResult>;
  approveFinalCreative: (id: string) => Promise<ActionResult>;
  activities: UserActivity[];
  addActivity: (
    activity: Omit<UserActivity, 'id' | 'createdAt' | 'officerEmail' | 'officerName' | 'site' | 'shift'> &
      Partial<Pick<UserActivity, 'officerEmail' | 'officerName' | 'site' | 'shift'>>
  ) => Promise<ActionResult>;
  updateActivity: (id: string, patch: Partial<UserActivity>) => Promise<ActionResult>;
  deleteActivity: (id: string) => Promise<ActionResult>;
  acknowledgeDirection: (feedbackId: string, reply?: string) => Promise<ActionResult>;
  publishDirection: (feedbackId: string) => Promise<ActionResult>;
  addShiftReport: (report: Omit<ShiftReport, 'reportId' | 'isLate'>) => Promise<ActionResult>;
  signOffReport: (reportId: string) => Promise<ActionResult>;
  triggerManualSync: () => Promise<ConnectorReport[]>;
  toggleSyncPause: () => Promise<ActionResult>;
  getTopPickRoom: (site: string, shift: string, mode: string, eventName?: string, dateStr?: string) => { used: number; limit: number; left: number };
  resetToSampleData: () => Promise<ActionResult>;

  drivePermissions: DrivePermissionGrant[];
  grantDrivePermission: (grant: {
    targetType: 'all' | 'folder' | 'file';
    targetId: string;
    targetName: string;
    granteeType: 'user' | 'role' | 'site';
    granteeValue: string;
    granteeName?: string;
  }) => Promise<ActionResult>;
  revokeDrivePermission: (id: string) => Promise<ActionResult>;
  canUserAccessDriveItem: (targetType: 'all' | 'folder' | 'file', targetId: string, folderId?: string) => boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const DEFAULT_APP_CONFIG: AppIntegrationConfig = {
  sheetId: TARGET_SPREADSHEET_ID,
  driveRootId: TARGET_DRIVE_ROOT_FOLDER_ID,
  clickUpTeamId: CLICKUP_TEAM_ID,
  clickUpSpaceId: CLICKUP_ENGAGEMENT_SPACE_ID,
  appsScriptUrl: ''
};

const CACHE_PEOPLE_KEY = 'e1_engagement_people_roster_v2';

function loadCachedPeople(): Person[] {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(CACHE_PEOPLE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const merged = [...parsed];
          for (const initP of INITIAL_PEOPLE) {
            if (!merged.some((m) => normalizeEmail(m.Email) === normalizeEmail(initP.Email))) {
              merged.push(initP);
            }
          }
          return sanitizeDirectory(merged);
        }
      }
    } catch {
      // Ignore
    }
  }
  return sanitizeDirectory(INITIAL_PEOPLE);
}

function persistCachedPeople(roster: Person[]) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(CACHE_PEOPLE_KEY, JSON.stringify(roster));
    } catch {
      // Ignore
    }
  }
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [people, setPeople] = useState<Person[]>(loadCachedPeople);
  const [sites, setSites] = useState<Site[]>(SITES_METADATA);
  const [topics, setTopics] = useState<Topic[]>(TOPICS_LIST);
  const [uploads, setUploads] = useState<UploadItem[]>(INITIAL_UPLOADS);
  const [directions, setDirections] = useState<DirectionMessage[]>(() => applyAckMap(INITIAL_DIRECTIONS, undefined));
  const [shiftReports, setShiftReports] = useState<ShiftReport[]>(INITIAL_REPORTS);
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [syncHealth, setSyncHealth] = useState<SyncHealth>(INITIAL_SYNC_HEALTH);
  const [syncLedger, setSyncLedger] = useState<SyncLedgerEntry[]>(INITIAL_LEDGER);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>(INITIAL_LOGS);
  const [appConfig, setAppConfig] = useState<AppIntegrationConfig>(DEFAULT_APP_CONFIG);

  const isAutoStart = typeof window !== 'undefined' && window.location.search.includes('autostart=1');
  const [authReady, setAuthReady] = useState(() => isAutoStart);
  const [googleUser, setGoogleUser] = useState<User | null>(() => (isAutoStart ? ({
    email: 'tanveer@empireonecx.com',
    displayName: 'Tanveer',
    photoURL: ''
  } as unknown as User) : null));
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false);
  const [isFetchingLiveSheets, setIsFetchingLiveSheets] = useState(false);
  const [isFetchingLiveDrive, setIsFetchingLiveDrive] = useState(false);
  const [liveSheetsMeta, setLiveSheetsMeta] = useState<Awaited<ReturnType<typeof fetchAllLiveSheetData>> | null>(null);
  const liveSheetsMetaRef = useRef<Awaited<ReturnType<typeof fetchAllLiveSheetData>> | null>(null);
  liveSheetsMetaRef.current = liveSheetsMeta;
  const [liveDriveData, setLiveDriveData] = useState<Awaited<ReturnType<typeof fetchAllLiveDriveData>> | null>(null);

  const [clickUpToken, setClickUpTokenState] = useState<string>(getStoredClickUpToken);
  const [isClickUpConnected, setIsClickUpConnected] = useState(false);
  const [isFetchingClickUp, setIsFetchingClickUp] = useState(false);
  const [liveClickUpData, setLiveClickUpData] = useState<Awaited<ReturnType<typeof fetchAllLiveClickUpData>> | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [lastSyncReport, setLastSyncReport] = useState<ConnectorReport[] | null>(null);
  const [showCaptureForAdmin, setShowCaptureForAdminState] = useState<boolean>(false);
  const [drivePermissions, setDrivePermissions] = useState<DrivePermissionGrant[]>([]);

  // Fetch initial activities and drive permissions on mount
  useEffect(() => {
    fetch('/api/activities')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.ok && Array.isArray(data.activities)) {
          setActivities(data.activities);
        }
      })
      .catch((err) => console.warn('Activities initial fetch note:', err));

    fetch('/api/drive/permissions')
      .then((res) => {
        if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) return null;
        return res.json();
      })
      .then((data) => {
        if (data?.ok && Array.isArray(data.permissions)) {
          setDrivePermissions(data.permissions);
        }
      })
      .catch((err) => console.warn('Drive permissions initial fetch:', err));
  }, []);

  // The server owns access and settings; keep every mounted session up to date in real time.
  useEffect(() => subscribeServerState<{
    people: Person[];
    config: AppIntegrationConfig;
    uploads: UploadItem[];
    directions: DirectionMessage[];
    shiftReports: ShiftReport[];
    activities?: UserActivity[];
    showCaptureForAdmin: boolean;
    syncHealth: SyncHealth;
    clickUpToken: string;
    drivePermissions?: DrivePermissionGrant[];
    syncLedger?: SyncLedgerEntry[];
    syncLogs?: SyncLogEntry[];
  }>((data) => {
    if (Array.isArray(data.people) && data.people.length > 0) {
      const clean = sanitizeDirectory(data.people);
      setPeople(clean);
      persistCachedPeople(clean);
    }
    if (data.config) setAppConfig((prev) =>
      JSON.stringify(prev) === JSON.stringify(data.config) ? prev : data.config);
    if (typeof data.showCaptureForAdmin === 'boolean') setShowCaptureForAdminState(data.showCaptureForAdmin);
    if (typeof data.clickUpToken === 'string') setClickUpTokenState(data.clickUpToken);
    if (Array.isArray(data.drivePermissions)) {
      setDrivePermissions((prev) =>
        JSON.stringify(prev) === JSON.stringify(data.drivePermissions) ? prev : (data.drivePermissions || [])
      );
    }

    // Keep records, directions, reports, activities, and sync health in sync with server state across all user sessions
    if (!liveSheetsMetaRef.current) {
      if (Array.isArray(data.uploads)) {
        const cleanUploads = data.uploads.filter(
          (u) => !u.id?.startsWith('UPL-') && !u.fileName?.startsWith('UPL-') && !u.mediaUrl?.includes('unsplash')
        );
        setUploads((prev) => (JSON.stringify(prev) === JSON.stringify(cleanUploads) ? prev : cleanUploads));
      }
      if (Array.isArray(data.directions)) {
        const cleanDirs = data.directions.filter(
          (d) => !d.feedbackId?.startsWith('FB-0') && !d.feedbackId?.startsWith('FB-1')
        );
        setDirections((prev) => {
          const applied = applyAckMap(cleanDirs, googleUser?.email || undefined);
          return JSON.stringify(prev) === JSON.stringify(applied) ? prev : applied;
        });
      }
      if (Array.isArray(data.shiftReports)) {
        setShiftReports((prev) => (JSON.stringify(prev) === JSON.stringify(data.shiftReports) ? prev : data.shiftReports));
      }
      if (Array.isArray(data.activities)) {
        setActivities((prev) => (JSON.stringify(prev) === JSON.stringify(data.activities) ? prev : (data.activities || [])));
      }
      if (data.syncHealth) {
        setSyncHealth((prev) => (JSON.stringify(prev) === JSON.stringify(data.syncHealth) ? prev : data.syncHealth));
      }
      if (Array.isArray(data.syncLedger)) setSyncLedger(data.syncLedger);
      if (Array.isArray(data.syncLogs)) setSyncLogs(data.syncLogs);
    }
  }, (error) => console.warn('Could not refresh server settings:', error)), [googleUser?.email]);

  const googleEmail = googleUser?.email || '';
  const googleName = googleUser?.displayName || '';
  const googlePhoto = googleUser?.photoURL || '';

  const currentUser = useMemo(() => {
    if (!googleEmail) return null;
    return resolveSessionPerson(
      { email: googleEmail, displayName: googleName, photoURL: googlePhoto },
      people
    );
  }, [googleEmail, googleName, googlePhoto, people]);

  const isTechnicalAdmin = isAdminPerson(currentUser);
  const isDirector = isDirectorPerson(currentUser);
  const isAdmin = canOpenAdminPanel(currentUser);
  const captureAllowed = canUseCapture(currentUser, showCaptureForAdmin);
  const integrationsAllowed = canSeeIntegrations(currentUser);
  const isWide = currentUser?.Role === 'Admin' || currentUser?.Role === 'Director';
  const canReview = Boolean(
    isWide || currentUser?.Role === 'Site Manager' || currentUser?.Role === 'Creative Designer'
  );
  const canPublish = isWide;
  const canApproveCreative = canApproveFinalCreative(currentUser);

  const setClickUpToken = async (tok: string): Promise<ActionResult> => {
    try {
      await saveServerSettings('/api/config/clickup-token', 'POST', { token: tok });
      setClickUpTokenState(tok);
      saveStoredClickUpToken(tok);
      window.dispatchEvent(new Event('app-settings-saved'));
      return { ok: true, message: tok ? 'ClickUp token saved to server.' : 'ClickUp token removed.' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not save ClickUp token.' };
    }
  };

  const denyAdmin = (): ActionResult => ({
    ok: false,
    message: 'Only an admin can change these settings.'
  });

  const setShowCaptureForAdmin = async (value: boolean): Promise<ActionResult> => {
    if (!isAdmin) return denyAdmin();
    try {
      const data = await saveServerSettings<{ showCaptureForAdmin: boolean; message: string }>(
        '/api/admin/capture-toggle', 'POST', { showCaptureForAdmin: value });
      setShowCaptureForAdminState(data.showCaptureForAdmin);
      window.dispatchEvent(new Event('app-settings-saved'));
      return { ok: true, message: data.message };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not save capture setting.' };
    }
  };

  useEffect(() => {
    let settled = false;
    const unsubscribe = initAuth((user, token) => {
      settled = true;
      if (user) {
        setGoogleUser(user);
        setGoogleToken(token);
      } else if (!isAutoStart) {
        setGoogleUser(null);
        setGoogleToken(null);
      }
      setAuthReady(true);
    });
    const timer = window.setTimeout(() => {
      if (!settled) setAuthReady(true);
    }, 4000);
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [isAutoStart]);

  useEffect(() => {
    if (!currentUser) return;
    fetch('/api/session/ensure-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        email: currentUser.Email,
        name: currentUser.Name,
        photoURL: currentUser.Avatar
      })
    })
      .then((res) => {
        if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) return null;
        return res.json();
      })
      .then((data) => {
        if (data?.people && Array.isArray(data.people) && data.people.length > 0) {
          const clean = sanitizeDirectory(data.people);
          setPeople(clean);
          persistCachedPeople(clean);
        }
      })
      .catch((err) => console.warn('Failed to register session on server:', err));
  }, [currentUser?.Email, currentUser?.Name, currentUser?.Avatar]);

  const signInWithGoogle = async () => {
    setIsSigningInGoogle(true);
    setLiveError(null);
    try {
      const result = await googleSignIn();
      setGoogleUser(result.user);
      setGoogleToken(result.accessToken);
    } catch (err: unknown) {
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: string }).code) : '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setLiveError('Google sign-in was cancelled. The app stays closed until Google sign-in finishes.');
      } else if (code === 'auth/popup-blocked') {
        setLiveError('The browser blocked the Google popup. Allow popups for this site, then try again.');
      } else if (code === 'auth/unauthorized-domain') {
        setLiveError('This site is not allowed to use Google sign-in yet. Add it under Firebase Authentication authorized domains.');
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setLiveError(`Google sign-in error: ${msg}`);
      }
      console.error('Sign-in failed:', err);
    } finally {
      setIsSigningInGoogle(false);
    }
  };

  const signOutGoogle = async () => {
    await googleLogout();
    setGoogleUser(null);
    setGoogleToken(null);
    setLiveSheetsMeta(null);
    setLiveDriveData(null);
    setLiveError(null);
  };

  const fetchLiveSheets = async (): Promise<ConnectorReport> => {
    const token = googleToken || (await getAccessToken());
    if (!token) {
      const detail = 'Sheets were not read. This Google session is still signed in, but the Sheets access token is missing. Refresh Google access and try again.';
      setLiveError(detail);
      return { name: 'Google Sheets', state: 'Skipped', detail };
    }
    if (!appConfig.sheetId.trim()) {
      const detail = 'No spreadsheet id is configured.';
      setLiveError(detail);
      return { name: 'Google Sheets', state: 'Error', detail };
    }

    setIsFetchingLiveSheets(true);
    setLiveError(null);
    try {
      const result = await fetchAllLiveSheetData(token, appConfig.sheetId.trim());
      setLiveSheetsMeta(result);

      if (result.uploads.length > 0) setUploads(result.uploads);
      if (result.directions.length > 0) setDirections(result.directions);
      if (result.shiftReports.length > 0) setShiftReports(result.shiftReports);
      if (result.sites.length > 0) setSites(result.sites);
      if (result.topics.length > 0) setTopics(result.topics);
      if (result.syncLedger.length > 0) setSyncLedger(result.syncLedger);
      if (result.syncLogs.length > 0) setSyncLogs(result.syncLogs);

      if (result.people.length > 0) {
        setPeople((prev) => {
          const merged = [...result.people];
          for (const p of prev) {
            if (!merged.some((m) => normalizeEmail(m.Email) === normalizeEmail(p.Email))) {
              merged.push(p);
            }
          }
          return sanitizeDirectory(merged);
        });

        const synced = await saveServerSettings<{ people: Person[] }>('/api/session/sync-sheet-roster', 'POST', {
          people: result.people
        });
        if (Array.isArray(synced.people) && synced.people.length > 0) {
          const clean = sanitizeDirectory(synced.people);
          setPeople(clean);
          persistCachedPeople(clean);
        }
      }

      const detail = `Read “${result.spreadsheetTitle}” (${result.availableTabs.length} tabs, ${result.people.length} roster rows, ${result.uploads.length} uploads). Nothing was written back to the sheet.`;
      return { name: 'Google Sheets', state: 'OK', detail };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const detail = `Live Google Sheets fetch error: ${msg}`;
      setLiveError(detail);
      console.error('Failed to fetch live Google Sheets data:', err);
      return { name: 'Google Sheets', state: 'Error', detail };
    } finally {
      setIsFetchingLiveSheets(false);
    }
  };

  const fetchLiveDrive = async (): Promise<ConnectorReport> => {
    const token = googleToken || (await getAccessToken());
    if (!token) {
      const detail = 'Drive was not read. This Google session is still signed in, but the Drive access token is missing. Refresh Google access and try again.';
      return { name: 'Google Drive', state: 'Skipped', detail };
    }
    if (!appConfig.driveRootId.trim()) {
      const detail = 'No Drive folder id is configured.';
      return { name: 'Google Drive', state: 'Error', detail };
    }

    setIsFetchingLiveDrive(true);
    try {
      const result = await fetchAllLiveDriveData(token, appConfig.driveRootId.trim());
      setLiveDriveData(result);
      return {
        name: 'Google Drive',
        state: 'OK',
        detail: `Read ${result.items.length} items from “${result.rootFolderName}”. Nothing was uploaded or deleted in Drive.`
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Failed to fetch live Google Drive data:', err);
      return { name: 'Google Drive', state: 'Error', detail: `Drive read failed: ${msg}` };
    } finally {
      setIsFetchingLiveDrive(false);
    }
  };

  const testClickUpToken = async (token: string): Promise<{ success: boolean; message: string }> => {
    const res = await testClickUpConnection(token, appConfig.clickUpSpaceId.trim() || CLICKUP_ENGAGEMENT_SPACE_ID);
    setIsClickUpConnected(res.success);
    return res;
  };

  const fetchLiveClickUp = async (): Promise<ConnectorReport> => {
    if (!clickUpToken) {
      setIsClickUpConnected(false);
      return {
        name: 'ClickUp',
        state: 'Skipped',
        detail: 'ClickUp was not read. No API token is saved. This app cannot create or update ClickUp tasks.'
      };
    }
    if (!appConfig.clickUpSpaceId.trim()) {
      return { name: 'ClickUp', state: 'Error', detail: 'No ClickUp space id is configured.' };
    }

    setIsFetchingClickUp(true);
    try {
      const result = await fetchAllLiveClickUpData(clickUpToken, appConfig.clickUpSpaceId.trim());
      setLiveClickUpData(result);
      setIsClickUpConnected(true);

      if (result.tasks.length > 0) {
        const userEmail = googleUser?.email || undefined;
        const ackMap = getLocalAckMap(userEmail);
        const clickUpDirections: DirectionMessage[] = result.tasks.map((task) => {
          const listName = (task.list?.name || '').trim();
          const isAllSites = !listName || ['all', 'all sites', 'general', 'global'].includes(listName.toLowerCase());
          const feedbackId = `CU-${task.id}`;
          const isAckedLocally = Boolean(ackMap[feedbackId]);
          return {
            feedbackId,
            title: task.name,
            message: task.description || task.name,
            type: "Today's tasks",
            source: `ClickUp:${task.id}`,
            fromPerson: task.creator?.username || 'ClickUp Space',
            sentAt: task.date_created ? new Date(parseInt(task.date_created, 10)).toISOString() : new Date().toISOString(),
            toAll: isAllSites,
            toSite: listName || 'All Sites',
            status: 'Published',
            acknowledged: task.status?.type === 'closed' || isAckedLocally,
            acknowledgedBy: task.assignees?.map((a) => a.username) || []
          };
        });

        setDirections((prev) => {
          const prevMap = new Map(prev.map((d) => [d.feedbackId, d]));
          const mergedCU = clickUpDirections.map((d) => {
            const existing = prevMap.get(d.feedbackId);
            if (existing?.acknowledged) {
              return {
                ...d,
                acknowledged: true,
                acknowledgedAt: existing.acknowledgedAt || d.acknowledgedAt,
                acknowledgedBy: Array.from(new Set([...(d.acknowledgedBy || []), ...(existing.acknowledgedBy || [])])),
                reply: existing.reply || d.reply
              };
            }
            return d;
          });
          const nonClickUp = prev.filter((d) => !d.feedbackId.startsWith('CU-'));
          return applyAckMap([...mergedCU, ...nonClickUp], userEmail);
        });
      }

      return {
        name: 'ClickUp',
        state: 'OK',
        detail: `Read ${result.tasks.length} tasks from space ${appConfig.clickUpSpaceId}. Nothing was written to ClickUp.`
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setIsClickUpConnected(false);
      console.warn('ClickUp fetch warning:', err);
      return { name: 'ClickUp', state: 'Error', detail: `ClickUp read failed: ${msg}` };
    } finally {
      setIsFetchingClickUp(false);
    }
  };

  const fetchLiveAllData = async () => {
    const report = await Promise.all([fetchLiveSheets(), fetchLiveDrive(), fetchLiveClickUp()]);
    setLastSyncReport(report);
    const problems = report.filter((item) => item.state !== 'OK');
    if (problems.length) {
      setLiveError(problems.map((item) => `${item.name}: ${item.detail}`).join(' '));
    }
  };

  useEffect(() => {
    if (googleToken) {
      void fetchLiveAllData();
    }
    // Reload should refresh reads when a token is restored, not when other state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleToken]);

  useEffect(() => {
    if (clickUpToken) {
      void testClickUpToken(clickUpToken).then((res) => {
        if (res.success) void fetchLiveClickUp();
      });
    }
    // Check a saved token once on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getTopPickRoom = (site: string, shift: string, mode: string, eventName: string = '', dateStr?: string) => {
    const ymd = dateStr || new Date().toISOString().slice(0, 10);
    if (!currentUser) return { used: 0, limit: 0, left: 0 };
    return calculateTopPickRoom(
      uploads.map((u) => ({
        officer: u.officer,
        topPick: u.topPick,
        site: u.site,
        shiftDate: u.shiftDate,
        mode: u.mode,
        shift: u.shift,
        eventName: u.eventName
      })),
      currentUser.Email,
      site,
      shift,
      mode,
      eventName,
      ymd
    );
  };

  const addBatchUploads = async (filesData: Array<{
    site: string;
    shift: string;
    mode: 'Daily' | 'Event';
    eventName?: string;
    shiftDate: string;
    topic: string;
    spot: string;
    mediaType: 'Photo' | 'Video';
    mediaUrl: string;
    fileSizeBytes?: number;
    capturedAt: string;
    location?: string;
    note: string;
    peopleInShot?: string;
    consentSigned: boolean;
    nothingConfidential: boolean;
    topPick: boolean;
    isCreativeWork?: boolean;
    ext?: string;
  }>): Promise<UploadItem[]> => {
    if (!currentUser) return [];
    const existingIds = uploads.map((u) => u.id);
    const created: UploadItem[] = [];

    for (const f of filesData) {
      const siteMeta = sites.find((s) => s.SiteName === f.site) || sites[0];
      const topicMeta = topics.find((t) => t.Topic === f.topic) || topics[0];
      const dateClean = f.shiftDate.replace(/-/g, '');
      const prefix = `${siteMeta.Code}_${dateClean}_${topicMeta.Code}_`;
      const id = generateUploadId(prefix, existingIds.concat(created.map((c) => c.id)));
      const ext = f.ext || (f.mediaType === 'Video' ? 'mp4' : 'jpg');
      const fileName = buildE1FileName(id, f.mediaType, true, ext);
      const folderPath = buildFolderPath(siteMeta.FolderName, f.shiftDate, f.shift, f.mode, f.eventName, fileName);

      let place = '';
      let mapLink = '';
      if (f.location) {
        const parts = f.location.split(',').map((p) => parseFloat(p.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          const geo = reverseGeocodeApprox(parts[0], parts[1]);
          place = geo.placeName;
          mapLink = geo.mapLink;
        }
      }

      created.push({
        id,
        fileName,
        officer: currentUser.Email,
        officerName: currentUser.Name,
        site: f.site,
        shift: f.shift,
        mode: f.mode,
        eventName: f.eventName || '',
        shiftDate: f.shiftDate,
        topic: f.topic,
        spot: f.spot,
        mediaType: f.mediaType,
        mediaUrl: f.mediaUrl,
        fileSizeBytes: f.fileSizeBytes || 2500000,
        capturedAt: f.capturedAt || new Date().toISOString(),
        uploadedAt: new Date().toISOString(),
        location: f.location || '',
        place,
        mapLink,
        note: f.note,
        peopleInShot: f.peopleInShot || '',
        consentSigned: f.consentSigned,
        nothingConfidential: f.nothingConfidential,
        topPick: f.topPick,
        isCreativeWork: Boolean(f.isCreativeWork || currentUser.Role === 'Creative Designer'),
        reviewStatus: 'Pending',
        folderPath
      });
    }

    const data = await saveServerSettings<{ uploads: UploadItem[] }>('/api/uploads/batch', 'POST', { items: created });
    setUploads(data.uploads);
    window.dispatchEvent(new Event('app-settings-saved'));
    return created;
  };

  const reviewUpload = async (id: string, decision: ReviewStatus, note?: string): Promise<ActionResult> => {
    if (!currentUser) return { ok: false, message: 'You must be signed in to review media.' };
    const target = uploads.find((u) => u.id === id);
    if (!target) return { ok: false, message: 'That upload was not found.' };

    const now = new Date().toISOString();
    try {
      const data = await saveServerSettings<{ uploads: UploadItem[] }>('/api/uploads/review', 'POST', {
        id,
        decision,
        note: note || target.reviewNote,
        reviewedBy: currentUser.Email
      });
      setUploads(data.uploads);
      window.dispatchEvent(new Event('app-settings-saved'));

      if (decision === 'Reshoot' || decision === 'Top pick') {
        setSyncLogs((prev) => [
          {
            id: Math.random().toString(),
            time: now,
            stage: 'followups',
            state: 'Info',
            detail: `${decision} for ${id} was saved to the server. ClickUp was not updated because this app has no ClickUp write client.`
          },
          ...prev
        ]);
      }
      return { ok: true, message: `Marked ${id} as ${decision}.` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not save media review.' };
    }
  };

  const toggleUsedInFinal = async (id: string): Promise<ActionResult> => {
    try {
      const data = await saveServerSettings<{ uploads: UploadItem[] }>('/api/uploads/toggle-final', 'POST', { id });
      setUploads(data.uploads);
      return { ok: true, message: 'Final-use status saved.' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not save final-use status.' };
    }
  };

  const approveFinalCreative = async (id: string): Promise<ActionResult> => {
    if (!currentUser || (!isTechnicalAdmin && !isDirector)) return denyAdmin();
    const now = new Date().toISOString();
    try {
      const data = await saveServerSettings<{ uploads: UploadItem[] }>('/api/uploads/toggle-final', 'POST', {
        id,
        usedInFinal: true,
        creativeApprovedBy: currentUser.Email,
        creativeApprovedAt: now
      });
      setUploads(data.uploads);
      return { ok: true, message: `Final creative approval saved for ${id}.` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not save final approval.' };
    }
  };

  const acknowledgeDirection = async (feedbackId: string, reply?: string): Promise<ActionResult> => {
    if (!currentUser) return { ok: false, message: 'You must be signed in to acknowledge a direction.' };
    const now = new Date().toISOString();
    const targetDir = directions.find((d) => d.feedbackId === feedbackId);
    try {
      const data = await saveServerSettings<{ directions: DirectionMessage[] }>('/api/directions/acknowledge', 'POST', {
        feedbackId,
        email: currentUser.Email,
        reply,
        direction: targetDir ? { ...targetDir, acknowledged: true, acknowledgedAt: now } : undefined
      });
      saveLocalAck(currentUser.Email, feedbackId, reply);
      setDirections(applyAckMap(data.directions, currentUser.Email));

      setSyncLogs((prev) => [
        {
          id: Math.random().toString(),
          time: now,
          stage: 'directions',
          state: 'OK',
          detail: `${currentUser.Name} acknowledged task ${feedbackId}.`
        },
        ...prev
      ]);
      return { ok: true, message: 'Direction acknowledged.' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not save acknowledgment.' };
    }
  };

  const addActivity = async (
    input: Omit<UserActivity, 'id' | 'createdAt' | 'officerEmail' | 'officerName' | 'site' | 'shift'> &
      Partial<Pick<UserActivity, 'officerEmail' | 'officerName' | 'site' | 'shift'>>
  ): Promise<ActionResult> => {
    if (!currentUser) return { ok: false, message: 'You must be signed in to add an activity.' };
    const now = new Date().toISOString();
    const newActivity: UserActivity = {
      ...input,
      id: `ACT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: now,
      officerEmail: currentUser.Email,
      officerName: currentUser.Name,
      site: input.site || currentUser.Site,
      shift: input.shift || currentUser.Shift || 'Peak',
      date: input.date || now.slice(0, 10)
    };

    try {
      const data = await saveServerSettings<{ activities: UserActivity[] }>('/api/activities', 'POST', { activity: newActivity });
      setActivities(data.activities);
      return { ok: true, message: 'Activity logged successfully.' };
    } catch (error: unknown) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not save activity.' };
    }
  };

  const updateActivity = async (id: string, patch: Partial<UserActivity>): Promise<ActionResult> => {
    try {
      const target = activities.find((a) => a.id === id);
      if (target) {
        const data = await saveServerSettings<{ activities: UserActivity[] }>('/api/activities', 'POST', {
          activity: { ...target, ...patch, updatedAt: new Date().toISOString() }
        });
        setActivities(data.activities);
      }
      return { ok: true, message: 'Activity updated.' };
    } catch (err: unknown) {
      return { ok: false, message: 'Could not update activity on server.' };
    }
  };

  const deleteActivity = async (id: string): Promise<ActionResult> => {
    try {
      const data = await saveServerSettings<{ activities: UserActivity[] }>(`/api/activities/${encodeURIComponent(id)}`, 'DELETE');
      setActivities(data.activities);
      return { ok: true, message: 'Activity deleted.' };
    } catch (error: unknown) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not delete activity.' };
    }
  };

  const publishDirection = async (feedbackId: string): Promise<ActionResult> => {
    if (!canPublish || !currentUser) return denyAdmin();
    const now = new Date().toISOString();
    try {
      const data = await saveServerSettings<{ directions: DirectionMessage[] }>('/api/directions/publish', 'POST', { feedbackId });
      setDirections(data.directions);

      setSyncLogs((prev) => [
        {
          id: Math.random().toString(),
          time: now,
          stage: 'directions',
          state: 'OK',
          detail: `${currentUser.Name} published direction ${feedbackId} on the server.`
        },
        ...prev
      ]);
      return { ok: true, message: 'Direction published.' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not publish direction.' };
    }
  };

  const addShiftReport = async (report: Omit<ShiftReport, 'reportId' | 'isLate'>): Promise<ActionResult> => {
    const siteMeta = sites.find((s) => s.SiteName === report.site) || sites[0];
    const reportId = `REP-${formatYmdClean(new Date())}-${siteMeta.Code}-${String(shiftReports.length + 1).padStart(2, '0')}`;
    const newReport: ShiftReport = { ...report, reportId, isLate: false };
    try {
      const data = await saveServerSettings<{ shiftReports: ShiftReport[] }>('/api/reports', 'POST', { report: newReport });
      setShiftReports(data.shiftReports);
      return { ok: true, message: 'Shift report saved.' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not save shift report.' };
    }
  };

  const signOffReport = async (reportId: string): Promise<ActionResult> => {
    try {
      const data = await saveServerSettings<{ shiftReports: ShiftReport[] }>('/api/reports/sign-off', 'POST', { reportId });
      setShiftReports(data.shiftReports);
      return { ok: true, message: 'Report signed off.' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not sign off report.' };
    }
  };

  const triggerManualSync = async (): Promise<ConnectorReport[]> => {
    const now = new Date().toISOString();
    const report = await Promise.all([fetchLiveSheets(), fetchLiveDrive(), fetchLiveClickUp()]);
    setLastSyncReport(report);
    const problems = report.filter((item) => item.state !== 'OK');
    const nextHealth: SyncHealth = {
      ...syncHealth,
      lastSync: now,
      syncState: problems.length ? 'Error' : 'OK',
      stages: [
        { name: 'sheets', state: report[0].state === 'OK' ? 'OK' : 'Error', at: now, detail: report[0].detail },
        { name: 'drive', state: report[1].state === 'OK' ? 'OK' : 'Error', at: now, detail: report[1].detail },
        { name: 'clickup', state: report[2].state === 'OK' ? 'OK' : 'Error', at: now, detail: report[2].detail }
      ]
    };
    const nextLogs: SyncLogEntry[] = [
      {
        id: Math.random().toString(),
        time: now,
        stage: 'system',
        state: problems.length ? 'Error' : 'OK',
        detail: problems.length
          ? `Read sync finished with problems: ${problems.map((item) => `${item.name} (${item.state})`).join('; ')}.`
          : 'Read sync finished for Sheets, Drive, and ClickUp. No remote records were written.'
      },
      ...syncLogs
    ];
    try {
      await saveServerSettings('/api/admin/sync-state', 'POST', {
        syncHealth: nextHealth,
        syncLedger,
        syncLogs: nextLogs
      });
      setSyncHealth(nextHealth);
      setSyncLogs(nextLogs);
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : 'Could not persist sync status.');
    }
    if (problems.length) {
      setLiveError(problems.map((item) => `${item.name}: ${item.detail}`).join(' '));
    }
    return report;
  };

  const toggleSyncPause = async (): Promise<ActionResult> => {
    if (!isAdmin) return denyAdmin();
    const nextHealth = { ...syncHealth, paused: !syncHealth.paused };
    try {
      const data = await saveServerSettings<{ syncHealth: SyncHealth }>('/api/admin/sync-state', 'POST', {
        syncHealth: nextHealth,
        syncLedger,
        syncLogs
      });
      setSyncHealth(data.syncHealth);
      return { ok: true, message: data.syncHealth.paused ? 'Sync paused.' : 'Sync resumed.' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not save sync state.' };
    }
  };

  const resetToSampleData = async (): Promise<ActionResult> => {
    if (!isAdmin) return denyAdmin();
    try {
      await saveServerSettings('/api/admin/reset-sample', 'POST');
      setUploads(INITIAL_UPLOADS);
      setDirections(INITIAL_DIRECTIONS);
      setShiftReports(INITIAL_REPORTS);
      setSyncHealth(INITIAL_SYNC_HEALTH);
      setSyncLedger(INITIAL_LEDGER);
      setSyncLogs(INITIAL_LOGS);
      setLiveSheetsMeta(null);
      setLiveDriveData(null);
      window.dispatchEvent(new Event('app-settings-saved'));
      return { ok: true, message: 'Server data reset.' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not reset server data.' };
    }
  };

  const updateAppConfig = async (patch: Partial<AppIntegrationConfig>): Promise<ActionResult> => {
    if (!isAdmin) return denyAdmin();
    try {
      await saveServerSettings('/api/admin/config', 'POST', patch);
      setAppConfig((prev) => ({ ...prev, ...patch }));
      window.dispatchEvent(new Event('app-settings-saved'));
      return { ok: true, message: 'Configuration saved to server.' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not save configuration.' };
    }
  };

  const saveDirectory = async (url: string, method: string, body?: unknown): Promise<ActionResult> => {
    try {
      const data = await saveServerSettings<{ people: Person[]; message: string }>(url, method, body);
      if (Array.isArray(data.people) && data.people.length > 0) {
        const clean = sanitizeDirectory(data.people);
        setPeople(clean);
        persistCachedPeople(clean);
      }
      window.dispatchEvent(new Event('app-settings-saved'));
      return { ok: true, message: data.message || 'Access saved. Active sessions update within five seconds.' };
    } catch (error) {
      console.warn('Server save warning:', error);
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Could not save roster change to the server.'
      };
    }
  };

  const addDirectoryUser = async (input: DirectoryUserInput): Promise<ActionResult> => {
    if (!isAdmin) return denyAdmin();
    if (input.role === 'Admin' && !isTechnicalAdmin) {
      return { ok: false, message: 'Directors cannot grant Technical Admin access. Only a Technical Admin can assign the Admin role.' };
    }
    const email = input.email.trim();
    if (!email.includes('@') || email.startsWith('@') || email.endsWith('@')) {
      return { ok: false, message: 'Enter a full email address.' };
    }
    if (people.some((p) => normalizeEmail(p.Email) === normalizeEmail(email))) {
      return { ok: false, message: 'That email is already on the roster. Edit the existing row.' };
    }

    const newPerson: Person = {
      Email: email,
      Name: (input.name && input.name.trim()) || email.split('@')[0],
      Role: normalizeEmail(email) === 'tanveer@empireonecx.com' ? 'Admin' : input.role,
      Site: input.site || 'Cebu City',
      Shift: input.shift || 'Peak',
      Active: true
    };

    const serverResult = await saveDirectory('/api/admin/users', 'POST', input);
    if (!serverResult.ok) return serverResult;

    // Save to Google Sheet directly if Google session is active
    let sheetNote = '';
    const token = googleToken || (await getAccessToken());
    if (token && appConfig.sheetId) {
      try {
        const sheetRes = await appendUserToSheet(token, newPerson, appConfig.sheetId);
        if (sheetRes.success) {
          sheetNote = ` and synced to Google Sheet (${sheetRes.tab || 'Roster'})`;
        } else {
          sheetNote = ` (Google Sheet sync note: ${sheetRes.message})`;
        }
      } catch (sheetErr: unknown) {
        const msg = sheetErr instanceof Error ? sheetErr.message : String(sheetErr);
        sheetNote = ` (Google Sheet sync pending: ${msg})`;
      }
    } else {
      sheetNote = ' (Sign in with Google to sync additions directly to Google Sheet)';
    }

    return {
      ok: true,
      message: `${serverResult.message || `${newPerson.Email} added.`}${sheetNote}`
    };
  };

  const updateDirectoryUser = async (
    email: string,
    patch: Partial<Pick<Person, 'Name' | 'Role' | 'Site' | 'Shift' | 'Active'>>
  ): Promise<ActionResult> => {
    const key = normalizeEmail(email);
    const isSelfShift =
      currentUser &&
      normalizeEmail(currentUser.Email) === key &&
      Object.keys(patch).length === 1 &&
      'Shift' in patch;

    if (!isAdmin && !isSelfShift) return denyAdmin();
    if (patch.Role === 'Admin' && !isTechnicalAdmin) {
      return { ok: false, message: 'Directors cannot grant Technical Admin access. Only a Technical Admin can assign the Admin role.' };
    }
    if (!people.some((p) => normalizeEmail(p.Email) === key)) {
      return { ok: false, message: 'That person is not on the roster.' };
    }

    const serverResult = await saveDirectory(`/api/admin/users/${encodeURIComponent(email)}`, 'PUT', patch);
    if (!serverResult.ok) return serverResult;

    const token = googleToken || (await getAccessToken());
    if (token && appConfig.sheetId) {
      try {
        const existingPerson = people.find((p) => normalizeEmail(p.Email) === key);
        if (existingPerson) {
          void updateUserInSheet(token, { ...existingPerson, ...patch, Email: email }, appConfig.sheetId);
        }
      } catch (sheetErr) {
        console.warn('Google Sheet user update warning:', sheetErr);
      }
    }

    return serverResult;
  };

  const setActiveShift = async (shiftName: string): Promise<ActionResult> => {
    if (!currentUser) return { ok: false, message: 'You must be signed in to select a shift.' };
    return updateDirectoryUser(currentUser.Email, { Shift: shiftName });
  };

  const removeDirectoryUser = async (email: string): Promise<ActionResult> => {
    if (!isAdmin) return denyAdmin();
    if (normalizeEmail(email) === normalizeEmail(currentUser?.Email)) {
      return { ok: false, message: 'You cannot remove the signed-in admin account.' };
    }
    if (normalizeEmail(email) === 'tanveer@empireonecx.com') {
      return { ok: false, message: 'You cannot remove the primary admin account.' };
    }

    const serverResult = await saveDirectory(`/api/admin/users/${encodeURIComponent(email)}`, 'DELETE');
    if (!serverResult.ok) return serverResult;

    const token = googleToken || (await getAccessToken());
    if (token && appConfig.sheetId) {
      try {
        void updateUserInSheet(token, { Email: email, Active: false }, appConfig.sheetId);
      } catch (sheetErr) {
        console.warn('Google Sheet user deactivation warning:', sheetErr);
      }
    }

    return serverResult;
  };

  const updateUpload = async (
    id: string,
    patch: Partial<Pick<UploadItem, 'note' | 'reviewStatus' | 'reviewNote' | 'topPick' | 'site' | 'topic' | 'spot'>>
  ): Promise<ActionResult> => {
    if (!isAdmin) return denyAdmin();
    if (!uploads.some((u) => u.id === id)) {
      return { ok: false, message: 'That upload is not on the server.' };
    }
    try {
      const data = await saveServerSettings<{ uploads: UploadItem[] }>(`/api/admin/records/upload/${encodeURIComponent(id)}`, 'PUT', patch);
      setUploads(data.uploads);
      return { ok: true, message: `Updated upload ${id} on the server.` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not update upload.' };
    }
  };

  const deleteUpload = async (id: string): Promise<ActionResult> => {
    if (!isAdmin) return denyAdmin();
    const found = uploads.some((u) => u.id === id);
    if (!found) return { ok: false, message: 'That upload is not on the server.' };
    try {
      const data = await saveServerSettings<{ uploads: UploadItem[] }>(`/api/admin/records/upload/${encodeURIComponent(id)}`, 'DELETE');
      setUploads(data.uploads);
      return { ok: true, message: `Deleted upload ${id} from server. The media file was not deleted.` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not delete upload.' };
    }
  };

  const deleteAllUploads = async (): Promise<ActionResult> => {
    if (!isAdmin) return denyAdmin();
    const count = uploads.length;
    try {
      const data = await saveServerSettings<{ uploads: UploadItem[] }>('/api/admin/records/uploads', 'DELETE');
      setUploads(data.uploads);
      return { ok: true, message: `Deleted ${count} upload record${count === 1 ? '' : 's'} from server. Media files were not touched.` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not delete uploads.' };
    }
  };

  const updateDirection = async (
    feedbackId: string,
    patch: Partial<Pick<DirectionMessage, 'title' | 'message' | 'status' | 'acknowledged' | 'toSite' | 'toAll'>>
  ): Promise<ActionResult> => {
    if (!isAdmin) return denyAdmin();
    const found = directions.some((d) => d.feedbackId === feedbackId);
    if (!found) return { ok: false, message: 'That direction is not on the server.' };
    try {
      const data = await saveServerSettings<{ directions: DirectionMessage[] }>(`/api/admin/records/direction/${encodeURIComponent(feedbackId)}`, 'PUT', patch);
      setDirections(data.directions);
      return { ok: true, message: `Updated direction ${feedbackId} on the server.` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not update direction.' };
    }
  };

  const deleteDirection = async (feedbackId: string): Promise<ActionResult> => {
    if (!isAdmin) return denyAdmin();
    const found = directions.some((d) => d.feedbackId === feedbackId);
    if (!found) return { ok: false, message: 'That direction is not on the server.' };
    try {
      const data = await saveServerSettings<{ directions: DirectionMessage[] }>(`/api/admin/records/direction/${encodeURIComponent(feedbackId)}`, 'DELETE');
      setDirections(data.directions);
      return { ok: true, message: `Deleted direction ${feedbackId} from server. ClickUp was not changed.` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not delete direction.' };
    }
  };

  const deleteAllDirections = async (): Promise<ActionResult> => {
    if (!isAdmin) return denyAdmin();
    const count = directions.length;
    try {
      const data = await saveServerSettings<{ directions: DirectionMessage[] }>('/api/admin/records/directions', 'DELETE');
      setDirections(data.directions);
      return { ok: true, message: `Deleted ${count} direction${count === 1 ? '' : 's'} from server. ClickUp was not changed.` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not delete directions.' };
    }
  };

  const updateShiftReport = async (
    reportId: string,
    patch: Partial<Pick<ShiftReport, 'engagementDone' | 'notes' | 'verified' | 'signedOff' | 'hoursWorked'>>
  ): Promise<ActionResult> => {
    if (!isAdmin) return denyAdmin();
    const found = shiftReports.some((r) => r.reportId === reportId);
    if (!found) return { ok: false, message: 'That report is not on the server.' };
    try {
      const data = await saveServerSettings<{ shiftReports: ShiftReport[] }>(`/api/admin/records/report/${encodeURIComponent(reportId)}`, 'PUT', patch);
      setShiftReports(data.shiftReports);
      return { ok: true, message: `Updated report ${reportId} on the server.` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not update report.' };
    }
  };

  const deleteShiftReport = async (reportId: string): Promise<ActionResult> => {
    if (!isAdmin) return denyAdmin();
    const found = shiftReports.some((r) => r.reportId === reportId);
    if (!found) return { ok: false, message: 'That report is not on the server.' };
    try {
      const data = await saveServerSettings<{ shiftReports: ShiftReport[] }>(`/api/admin/records/report/${encodeURIComponent(reportId)}`, 'DELETE');
      setShiftReports(data.shiftReports);
      return { ok: true, message: `Deleted report ${reportId} from server.` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not delete report.' };
    }
  };

  const deleteAllShiftReports = async (): Promise<ActionResult> => {
    if (!isAdmin) return denyAdmin();
    const count = shiftReports.length;
    try {
      const data = await saveServerSettings<{ shiftReports: ShiftReport[] }>('/api/admin/records/reports', 'DELETE');
      setShiftReports(data.shiftReports);
      return { ok: true, message: `Deleted ${count} shift report${count === 1 ? '' : 's'} from server.` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not delete reports.' };
    }
  };

  const grantDrivePermission = async (grant: {
    targetType: 'all' | 'folder' | 'file';
    targetId: string;
    targetName: string;
    granteeType: 'user' | 'role' | 'site';
    granteeValue: string;
    granteeName?: string;
  }): Promise<ActionResult> => {
    try {
      const token = googleToken || (await getAccessToken());
      if (!token) return { ok: false, message: 'Reconnect Google Drive, then try granting access again.' };
      const res = await fetch('/api/drive/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...grant,
          grantedBy: currentUser?.Email || 'tanveer@empireonecx.com'
        })
      });

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (data?.ok && Array.isArray(data.permissions)) {
          setDrivePermissions(data.permissions);
          window.dispatchEvent(new Event('app-settings-saved'));
          return { ok: true, message: data.message || 'Permission granted successfully.' };
        }
        return { ok: false, message: data?.message || 'Failed to grant permission.' };
      }

      return { ok: false, message: `Drive permission request failed (HTTP ${res.status}).` };
    } catch (err: unknown) {
      console.error('Failed to grant Google Drive permission:', err);
      return { ok: false, message: err instanceof Error ? err.message : 'Failed to grant Google Drive permission.' };
    }
  };

  const revokeDrivePermission = async (id: string): Promise<ActionResult> => {
    try {
      const token = googleToken || (await getAccessToken());
      if (!token) return { ok: false, message: 'Reconnect Google Drive, then try revoking access again.' };
      const res = await fetch(`/api/drive/permissions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }
      });
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (data?.ok && Array.isArray(data.permissions)) {
          setDrivePermissions(data.permissions);
          return { ok: true, message: data.message || 'Permission revoked.' };
        }
      }
      return { ok: false, message: `Drive permission revoke failed (HTTP ${res.status}).` };
    } catch (err: unknown) {
      console.error('Failed to revoke Google Drive permission:', err);
      return { ok: false, message: err instanceof Error ? err.message : 'Failed to revoke Google Drive permission.' };
    }
  };

  const canUserAccessDriveItem = (
    targetType: 'all' | 'folder' | 'file',
    targetId: string,
    folderId?: string
  ): boolean => {
    if (currentUser?.Role === 'Admin') return true;
    if (!currentUser) return false;

    const userEmail = (currentUser.Email || '').trim().toLowerCase();
    const userRole = (currentUser.Role || '').trim().toLowerCase();
    const userSite = (currentUser.Site || '').trim().toLowerCase();

    const isMatch = (p: DrivePermissionGrant) => {
      if (p.granteeType === 'user') {
        return (p.granteeValue || '').trim().toLowerCase() === userEmail;
      }
      if (p.granteeType === 'role') {
        return (p.granteeValue || '').trim().toLowerCase() === userRole;
      }
      if (p.granteeType === 'site') {
        return (p.granteeValue || '').trim().toLowerCase() === userSite;
      }
      return false;
    };

    // 1. Entire Drive access granted?
    const hasAll = drivePermissions.some((p) => p.targetType === 'all' && isMatch(p));
    if (hasAll) return true;
    if (targetType === 'all') return false;

    // 2. Specific Folder access granted?
    if (targetType === 'folder') {
      return drivePermissions.some((p) => p.targetType === 'folder' && p.targetId === targetId && isMatch(p));
    }

    // 3. Specific File access granted?
    if (targetType === 'file') {
      const isFileGranted = drivePermissions.some((p) => p.targetType === 'file' && p.targetId === targetId && isMatch(p));
      if (isFileGranted) return true;
      if (folderId) {
        return drivePermissions.some((p) => p.targetType === 'folder' && p.targetId === folderId && isMatch(p));
      }
    }

    return false;
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        people,
        sites,
        topics,
        uploads,
        directions,
        shiftReports,
        syncHealth,
        syncLedger,
        syncLogs,
        authReady,
        googleUser,
        googleToken,
        isGoogleConnected: Boolean(googleUser && googleToken),
        isSigningInGoogle,
        isFetchingLiveSheets,
        isFetchingLiveDrive,
        liveSheetsMeta,
        liveDriveData,
        clickUpToken,
        setClickUpToken,
        isClickUpConnected,
        isFetchingClickUp,
        liveClickUpData,
        liveError,
        appConfig,
        lastSyncReport,
        canReview,
        canPublish,
        isWide,
        isAdmin,
        isTechnicalAdmin,
        isDirector,
        canApproveCreative,
        showCaptureForAdmin,
        setShowCaptureForAdmin,
        canUseCapture: captureAllowed,
        canSeeIntegrations: integrationsAllowed,
        signInWithGoogle,
        signOutGoogle,
        fetchLiveSheets,
        fetchLiveDrive,
        fetchLiveClickUp,
        fetchLiveAllData,
        testClickUpToken,
        updateAppConfig,
        addDirectoryUser,
        updateDirectoryUser,
        removeDirectoryUser,
        setActiveShift,
        updateUpload,
        deleteUpload,
        deleteAllUploads,
        updateDirection,
        deleteDirection,
        deleteAllDirections,
        updateShiftReport,
        deleteShiftReport,
        deleteAllShiftReports,
        addBatchUploads,
        reviewUpload,
        toggleUsedInFinal,
        approveFinalCreative,
        activities,
        addActivity,
        updateActivity,
        deleteActivity,
        acknowledgeDirection,
        publishDirection,
        addShiftReport,
        signOffReport,
        triggerManualSync,
        toggleSyncPause,
        getTopPickRoom,
        resetToSampleData,
        drivePermissions,
        grantDrivePermission,
        revokeDrivePermission,
        canUserAccessDriveItem
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

export const useSignedInApp = () => {
  const context = useApp();
  if (!context.currentUser || !context.googleUser) {
    throw new Error('useSignedInApp requires a Google session');
  }
  return context as AppContextType & { currentUser: Person; googleUser: User };
};
