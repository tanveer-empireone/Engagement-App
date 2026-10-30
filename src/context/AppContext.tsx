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
  ConnectorReport
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
  TARGET_SPREADSHEET_ID
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
  setClickUpToken: (token: string) => void;
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

  updateUpload: (id: string, patch: Partial<Pick<UploadItem, 'note' | 'reviewStatus' | 'reviewNote' | 'topPick' | 'site' | 'topic' | 'spot'>>) => ActionResult;
  deleteUpload: (id: string) => ActionResult;
  deleteAllUploads: () => ActionResult;
  updateDirection: (feedbackId: string, patch: Partial<Pick<DirectionMessage, 'title' | 'message' | 'status' | 'acknowledged'>>) => ActionResult;
  deleteDirection: (feedbackId: string) => ActionResult;
  deleteAllDirections: () => ActionResult;
  updateShiftReport: (reportId: string, patch: Partial<Pick<ShiftReport, 'engagementDone' | 'notes' | 'verified' | 'signedOff' | 'hoursWorked'>>) => ActionResult;
  deleteShiftReport: (reportId: string) => ActionResult;
  deleteAllShiftReports: () => ActionResult;

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
  reviewUpload: (id: string, decision: ReviewStatus, note?: string) => Promise<void>;
  toggleUsedInFinal: (id: string) => void;
  approveFinalCreative: (id: string) => void;
  acknowledgeDirection: (feedbackId: string, reply?: string) => void;
  publishDirection: (feedbackId: string) => void;
  addShiftReport: (report: Omit<ShiftReport, 'reportId' | 'isLate'>) => void;
  signOffReport: (reportId: string) => void;
  triggerManualSync: () => Promise<ConnectorReport[]>;
  toggleSyncPause: () => void;
  getTopPickRoom: (site: string, shift: string, mode: string, eventName?: string, dateStr?: string) => { used: number; limit: number; left: number };
  resetToSampleData: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const DEFAULT_APP_CONFIG: AppIntegrationConfig = {
  sheetId: TARGET_SPREADSHEET_ID,
  driveRootId: TARGET_DRIVE_ROOT_FOLDER_ID,
  clickUpTeamId: CLICKUP_TEAM_ID,
  clickUpSpaceId: CLICKUP_ENGAGEMENT_SPACE_ID,
  appsScriptUrl: ''
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [people, setPeople] = useState<Person[]>(() => sanitizeDirectory(INITIAL_PEOPLE));
  const [sites, setSites] = useState<Site[]>(SITES_METADATA);
  const [topics, setTopics] = useState<Topic[]>(TOPICS_LIST);
  const [uploads, setUploads] = useState<UploadItem[]>(INITIAL_UPLOADS);
  const [directions, setDirections] = useState<DirectionMessage[]>(INITIAL_DIRECTIONS);
  const [shiftReports, setShiftReports] = useState<ShiftReport[]>(INITIAL_REPORTS);
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

  // The server owns access and settings; keep every mounted session up to date in real time.
  useEffect(() => subscribeServerState<{
    people: Person[];
    config: AppIntegrationConfig;
    uploads: UploadItem[];
    directions: DirectionMessage[];
    shiftReports: ShiftReport[];
    showCaptureForAdmin: boolean;
    syncHealth: SyncHealth;
    clickUpToken: string;
  }>((data) => {
    if (Array.isArray(data.people)) setPeople(sanitizeDirectory(data.people));
    if (data.config) setAppConfig((prev) =>
      JSON.stringify(prev) === JSON.stringify(data.config) ? prev : data.config);
    if (typeof data.showCaptureForAdmin === 'boolean') setShowCaptureForAdminState(data.showCaptureForAdmin);
    if (typeof data.clickUpToken === 'string') setClickUpTokenState(data.clickUpToken);

    // Keep records, directions, reports, and sync health in sync with server state across all user sessions
    if (!liveSheetsMetaRef.current) {
      if (Array.isArray(data.uploads)) {
        setUploads((prev) => (JSON.stringify(prev) === JSON.stringify(data.uploads) ? prev : data.uploads));
      }
      if (Array.isArray(data.directions)) {
        setDirections((prev) => (JSON.stringify(prev) === JSON.stringify(data.directions) ? prev : data.directions));
      }
      if (Array.isArray(data.shiftReports)) {
        setShiftReports((prev) => (JSON.stringify(prev) === JSON.stringify(data.shiftReports) ? prev : data.shiftReports));
      }
      if (data.syncHealth) {
        setSyncHealth((prev) => (JSON.stringify(prev) === JSON.stringify(data.syncHealth) ? prev : data.syncHealth));
      }
    }
  }, (error) => console.warn('Could not refresh server settings:', error)), []);

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

  const setClickUpToken = (tok: string) => {
    setClickUpTokenState(tok);
    saveStoredClickUpToken(tok);
    fetch('/api/config/clickup-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tok })
    }).catch((err) => console.error('Failed to save ClickUp token to server:', err));
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: currentUser.Email,
        name: currentUser.Name,
        photoURL: currentUser.Avatar
      })
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.people && Array.isArray(data.people)) {
          setPeople(sanitizeDirectory(data.people));
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

        // Save imported sheet roster to server
        fetch('/api/session/sync-sheet-roster', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ people: result.people })
        })
          .then((res) => res.json())
          .then((data) => {
            if (data?.people && Array.isArray(data.people)) {
              setPeople(sanitizeDirectory(data.people));
            }
          })
          .catch((err) => console.warn('Failed to persist sheet roster to server:', err));
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
        const clickUpDirections: DirectionMessage[] = result.tasks.map((task) => ({
          feedbackId: `CU-${task.id}`,
          title: task.name,
          message: task.description || task.name,
          type: "Today's tasks",
          source: `ClickUp:${task.id}`,
          fromPerson: task.creator?.username || 'ClickUp Space',
          sentAt: task.date_created ? new Date(parseInt(task.date_created, 10)).toISOString() : new Date().toISOString(),
          toAll: true,
          toSite: task.list?.name || 'All Sites',
          status: 'Published',
          acknowledged: task.status?.type === 'closed',
          acknowledgedBy: task.assignees?.map((a) => a.username) || []
        }));

        setDirections((prev) => {
          const nonClickUp = prev.filter((d) => !d.feedbackId.startsWith('CU-'));
          return [...clickUpDirections, ...nonClickUp];
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

    setUploads((prev) => [...created, ...prev]);
    fetch('/api/uploads/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: created })
    }).catch((err) => console.error('Failed to save batch uploads to server:', err));
    return created;
  };

  const reviewUpload = async (id: string, decision: ReviewStatus, note?: string) => {
    if (!currentUser) return;
    const target = uploads.find((u) => u.id === id);
    if (!target) return;

    const now = new Date().toISOString();
    setUploads((prev) =>
      prev.map((u) => {
        if (u.id !== id) return u;
        return {
          ...u,
          reviewStatus: decision,
          reviewNote: note || u.reviewNote,
          reviewedBy: currentUser.Email,
          reviewedAt: now,
          topPick: decision === 'Top pick' ? true : u.topPick
        };
      })
    );

    fetch('/api/uploads/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        decision,
        note: note || target.reviewNote,
        reviewedBy: currentUser.Email
      })
    }).catch((err) => console.error('Failed to save upload review to server:', err));

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
  };

  const toggleUsedInFinal = (id: string) => {
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, usedInFinal: !u.usedInFinal } : u)));
    fetch('/api/uploads/toggle-final', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    }).catch((err) => console.error('Failed to toggle final on server:', err));
  };

  const approveFinalCreative = (id: string) => {
    if (!currentUser || (!isTechnicalAdmin && !isDirector)) return;
    const now = new Date().toISOString();
    setUploads((prev) =>
      prev.map((u) =>
        u.id === id
          ? {
              ...u,
              usedInFinal: true,
              creativeApprovedBy: currentUser.Email,
              creativeApprovedAt: now
            }
          : u
      )
    );
    fetch('/api/uploads/toggle-final', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        usedInFinal: true,
        creativeApprovedBy: currentUser.Email,
        creativeApprovedAt: now
      })
    }).catch((err) => console.error('Failed to save final creative approval on server:', err));
  };

  const acknowledgeDirection = (feedbackId: string, reply?: string) => {
    if (!currentUser) return;
    const now = new Date().toISOString();
    setDirections((prev) =>
      prev.map((d) => {
        if (d.feedbackId !== feedbackId) return d;
        const list = d.acknowledgedBy || [];
        return {
          ...d,
          acknowledged: true,
          acknowledgedAt: now,
          acknowledgedBy: Array.from(new Set([...list, currentUser.Email])),
          reply: reply || d.reply
        };
      })
    );

    fetch('/api/directions/acknowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedbackId, email: currentUser.Email, reply })
    }).catch((err) => console.error('Failed to save direction acknowledgment to server:', err));

    setSyncLogs((prev) => [
      {
        id: Math.random().toString(),
        time: now,
        stage: 'directions',
        state: 'OK',
        detail: `${currentUser.Name} acknowledged direction ${feedbackId} on the server.`
      },
      ...prev
    ]);
  };

  const publishDirection = (feedbackId: string) => {
    if (!canPublish || !currentUser) return;
    const now = new Date().toISOString();
    setDirections((prev) =>
      prev.map((d) => (d.feedbackId === feedbackId ? { ...d, status: 'Published', sentAt: now } : d))
    );
    fetch('/api/directions/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedbackId })
    }).catch((err) => console.error('Failed to publish direction to server:', err));

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
  };

  const addShiftReport = (report: Omit<ShiftReport, 'reportId' | 'isLate'>) => {
    const siteMeta = sites.find((s) => s.SiteName === report.site) || sites[0];
    const reportId = `REP-${formatYmdClean(new Date())}-${siteMeta.Code}-${String(shiftReports.length + 1).padStart(2, '0')}`;
    const newReport: ShiftReport = { ...report, reportId, isLate: false };
    setShiftReports((prev) => [newReport, ...prev]);
    fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report: newReport })
    }).catch((err) => console.error('Failed to save shift report to server:', err));
  };

  const signOffReport = (reportId: string) => {
    setShiftReports((prev) =>
      prev.map((r) => (r.reportId === reportId ? { ...r, signedOff: true, verified: true } : r))
    );
    fetch('/api/reports/sign-off', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId })
    }).catch((err) => console.error('Failed to sign off report on server:', err));
  };

  const triggerManualSync = async (): Promise<ConnectorReport[]> => {
    const now = new Date().toISOString();
    const report = await Promise.all([fetchLiveSheets(), fetchLiveDrive(), fetchLiveClickUp()]);
    setLastSyncReport(report);
    const problems = report.filter((item) => item.state !== 'OK');
    setSyncHealth((prev) => ({
      ...prev,
      lastSync: now,
      syncState: problems.length ? 'Error' : 'OK',
      stages: [
        { name: 'sheets', state: report[0].state === 'OK' ? 'OK' : 'Error', at: now, detail: report[0].detail },
        { name: 'drive', state: report[1].state === 'OK' ? 'OK' : 'Error', at: now, detail: report[1].detail },
        { name: 'clickup', state: report[2].state === 'OK' ? 'OK' : 'Error', at: now, detail: report[2].detail }
      ]
    }));
    setSyncLogs((prev) => [
      {
        id: Math.random().toString(),
        time: now,
        stage: 'system',
        state: problems.length ? 'Error' : 'OK',
        detail: problems.length
          ? `Read sync finished with problems: ${problems.map((item) => `${item.name} (${item.state})`).join('; ')}.`
          : 'Read sync finished for Sheets, Drive, and ClickUp. No remote records were written.'
      },
      ...prev
    ]);
    if (problems.length) {
      setLiveError(problems.map((item) => `${item.name}: ${item.detail}`).join(' '));
    }
    return report;
  };

  const toggleSyncPause = () => {
    if (!isAdmin) return;
    setSyncHealth((prev) => ({ ...prev, paused: !prev.paused }));
  };

  const resetToSampleData = () => {
    if (!isAdmin) return;
    setUploads(INITIAL_UPLOADS);
    setDirections(INITIAL_DIRECTIONS);
    setShiftReports(INITIAL_REPORTS);
    setSyncHealth(INITIAL_SYNC_HEALTH);
    setSyncLedger(INITIAL_LEDGER);
    setSyncLogs(INITIAL_LOGS);
    setLiveSheetsMeta(null);
    setLiveDriveData(null);
    fetch('/api/admin/reset-sample', {
      method: 'POST'
    }).then(() => window.dispatchEvent(new Event('app-settings-saved')))
      .catch((err) => console.error('Failed to reset sample data on server:', err));
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
      if (!Array.isArray(data.people)) throw new Error('Server did not confirm the updated roster.');
      setPeople(sanitizeDirectory(data.people));
      window.dispatchEvent(new Event('app-settings-saved'));
      return { ok: true, message: data.message || 'Access saved. Active sessions update within five seconds.' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not save access changes.' };
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
    return saveDirectory('/api/admin/users', 'POST', input);
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
    return saveDirectory(`/api/admin/users/${encodeURIComponent(email)}`, 'PUT', patch);
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
    return saveDirectory(`/api/admin/users/${encodeURIComponent(email)}`, 'DELETE');
  };

  const updateUpload = (
    id: string,
    patch: Partial<Pick<UploadItem, 'note' | 'reviewStatus' | 'reviewNote' | 'topPick' | 'site' | 'topic' | 'spot'>>
  ): ActionResult => {
    if (!isAdmin) return denyAdmin();
    if (!uploads.some((u) => u.id === id)) {
      return { ok: false, message: 'That upload is not on the server.' };
    }
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    fetch(`/api/admin/records/upload/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    }).then(() => window.dispatchEvent(new Event('app-settings-saved')))
      .catch((err) => console.error('Failed to update upload on server:', err));

    return { ok: true, message: `Updated upload ${id} on the server.` };
  };

  const deleteUpload = (id: string): ActionResult => {
    if (!isAdmin) return denyAdmin();
    const found = uploads.some((u) => u.id === id);
    if (!found) return { ok: false, message: 'That upload is not on the server.' };
    setUploads((prev) => prev.filter((u) => u.id !== id));
    fetch(`/api/admin/records/upload/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    }).then(() => window.dispatchEvent(new Event('app-settings-saved')))
      .catch((err) => console.error('Failed to delete upload on server:', err));

    return { ok: true, message: `Deleted upload ${id} from server. The file was not deleted from Google Drive.` };
  };

  const deleteAllUploads = (): ActionResult => {
    if (!isAdmin) return denyAdmin();
    const count = uploads.length;
    setUploads([]);
    fetch('/api/admin/records/uploads', {
      method: 'DELETE'
    }).then(() => window.dispatchEvent(new Event('app-settings-saved')))
      .catch((err) => console.error('Failed to delete all uploads on server:', err));

    return { ok: true, message: `Deleted ${count} upload record${count === 1 ? '' : 's'} from server. Drive files were not touched.` };
  };

  const updateDirection = (
    feedbackId: string,
    patch: Partial<Pick<DirectionMessage, 'title' | 'message' | 'status' | 'acknowledged'>>
  ): ActionResult => {
    if (!isAdmin) return denyAdmin();
    const found = directions.some((d) => d.feedbackId === feedbackId);
    if (!found) return { ok: false, message: 'That direction is not on the server.' };
    setDirections((prev) => prev.map((d) => (d.feedbackId === feedbackId ? { ...d, ...patch } : d)));
    fetch(`/api/admin/records/direction/${encodeURIComponent(feedbackId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    }).then(() => window.dispatchEvent(new Event('app-settings-saved')))
      .catch((err) => console.error('Failed to update direction on server:', err));

    return { ok: true, message: `Updated direction ${feedbackId} on the server.` };
  };

  const deleteDirection = (feedbackId: string): ActionResult => {
    if (!isAdmin) return denyAdmin();
    const found = directions.some((d) => d.feedbackId === feedbackId);
    if (!found) return { ok: false, message: 'That direction is not on the server.' };
    setDirections((prev) => prev.filter((d) => d.feedbackId !== feedbackId));
    fetch(`/api/admin/records/direction/${encodeURIComponent(feedbackId)}`, {
      method: 'DELETE'
    }).then(() => window.dispatchEvent(new Event('app-settings-saved')))
      .catch((err) => console.error('Failed to delete direction on server:', err));

    return { ok: true, message: `Deleted direction ${feedbackId} from server. ClickUp was not changed.` };
  };

  const deleteAllDirections = (): ActionResult => {
    if (!isAdmin) return denyAdmin();
    const count = directions.length;
    setDirections([]);
    fetch('/api/admin/records/directions', {
      method: 'DELETE'
    }).then(() => window.dispatchEvent(new Event('app-settings-saved')))
      .catch((err) => console.error('Failed to delete all directions on server:', err));

    return { ok: true, message: `Deleted ${count} direction${count === 1 ? '' : 's'} from server. ClickUp was not changed.` };
  };

  const updateShiftReport = (
    reportId: string,
    patch: Partial<Pick<ShiftReport, 'engagementDone' | 'notes' | 'verified' | 'signedOff' | 'hoursWorked'>>
  ): ActionResult => {
    if (!isAdmin) return denyAdmin();
    const found = shiftReports.some((r) => r.reportId === reportId);
    if (!found) return { ok: false, message: 'That report is not on the server.' };
    setShiftReports((prev) => prev.map((r) => (r.reportId === reportId ? { ...r, ...patch } : r)));
    fetch(`/api/admin/records/report/${encodeURIComponent(reportId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    }).then(() => window.dispatchEvent(new Event('app-settings-saved')))
      .catch((err) => console.error('Failed to update report on server:', err));

    return { ok: true, message: `Updated report ${reportId} on the server.` };
  };

  const deleteShiftReport = (reportId: string): ActionResult => {
    if (!isAdmin) return denyAdmin();
    const found = shiftReports.some((r) => r.reportId === reportId);
    if (!found) return { ok: false, message: 'That report is not on the server.' };
    setShiftReports((prev) => prev.filter((r) => r.reportId !== reportId));
    fetch(`/api/admin/records/report/${encodeURIComponent(reportId)}`, {
      method: 'DELETE'
    }).then(() => window.dispatchEvent(new Event('app-settings-saved')))
      .catch((err) => console.error('Failed to delete report on server:', err));

    return { ok: true, message: `Deleted report ${reportId} from server.` };
  };

  const deleteAllShiftReports = (): ActionResult => {
    if (!isAdmin) return denyAdmin();
    const count = shiftReports.length;
    setShiftReports([]);
    fetch('/api/admin/records/reports', {
      method: 'DELETE'
    }).then(() => window.dispatchEvent(new Event('app-settings-saved')))
      .catch((err) => console.error('Failed to delete all reports on server:', err));

    return { ok: true, message: `Deleted ${count} shift report${count === 1 ? '' : 's'} from server.` };
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
        acknowledgeDirection,
        publishDirection,
        addShiftReport,
        signOffReport,
        triggerManualSync,
        toggleSyncPause,
        getTopPickRoom,
        resetToSampleData
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
