import React, { createContext, useContext, useState, useEffect } from 'react';
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
  ReviewStatus
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
  initAuth,
  googleSignIn,
  logout as googleLogout,
  getAccessToken
} from '../services/googleAuth';
import {
  fetchAllLiveSheetData,
  LiveSheetDataResult,
  TARGET_SPREADSHEET_ID
} from '../services/googleSheetsService';
import {
  fetchAllLiveDriveData,
  LiveDriveResult,
  TARGET_DRIVE_ROOT_FOLDER_ID
} from '../services/googleDriveService';
import {
  fetchAllLiveClickUpData,
  testClickUpConnection,
  getStoredClickUpToken,
  saveStoredClickUpToken,
  LiveClickUpResult,
  CLICKUP_ENGAGEMENT_SPACE_ID,
  CLICKUP_TEAM_ID
} from '../services/clickupService';

interface AppContextType {
  currentUser: Person;
  setCurrentUser: (p: Person) => void;
  people: Person[];
  sites: Site[];
  topics: Topic[];
  uploads: UploadItem[];
  directions: DirectionMessage[];
  shiftReports: ShiftReport[];
  syncHealth: SyncHealth;
  syncLedger: SyncLedgerEntry[];
  syncLogs: SyncLogEntry[];

  // Live Integration State
  googleUser: User | null;
  googleToken: string | null;
  isGoogleConnected: boolean;
  isSigningInGoogle: boolean;
  isFetchingLiveSheets: boolean;
  isFetchingLiveDrive: boolean;
  liveSheetsMeta: LiveSheetDataResult | null;
  liveDriveData: LiveDriveResult | null;

  // ClickUp Integration State
  clickUpToken: string;
  setClickUpToken: (token: string) => void;
  isClickUpConnected: boolean;
  isFetchingClickUp: boolean;
  liveClickUpData: LiveClickUpResult | null;
  liveError: string | null;

  // Capabilities
  canReview: boolean;
  canPublish: boolean;
  isWide: boolean;

  // Actions
  signInWithGoogle: () => Promise<void>;
  signOutGoogle: () => Promise<void>;
  fetchLiveSheets: () => Promise<void>;
  fetchLiveDrive: () => Promise<void>;
  fetchLiveClickUp: () => Promise<void>;
  fetchLiveAllData: () => Promise<void>;
  testClickUpToken: (token: string) => Promise<{ success: boolean; message: string }>;

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
  }>) => Promise<UploadItem[]>;
  reviewUpload: (id: string, decision: ReviewStatus, note?: string) => Promise<void>;
  toggleUsedInFinal: (id: string) => void;
  acknowledgeDirection: (feedbackId: string, reply?: string) => void;
  publishDirection: (feedbackId: string) => void;
  addShiftReport: (report: Omit<ShiftReport, 'reportId' | 'isLate'>) => void;
  signOffReport: (reportId: string) => void;
  triggerManualSync: () => Promise<void>;
  toggleSyncPause: () => void;
  getTopPickRoom: (site: string, shift: string, mode: string, eventName?: string, dateStr?: string) => { used: number; limit: number; left: number };
  resetToSampleData: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEY_UPLOADS = 'e1_engagement_uploads_v4';
const STORAGE_KEY_DIRECTIONS = 'e1_engagement_directions_v4';
const STORAGE_KEY_REPORTS = 'e1_engagement_reports_v4';
const STORAGE_KEY_USER = 'e1_engagement_active_user_v5';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [people, setPeople] = useState<Person[]>(INITIAL_PEOPLE);
  const [sites, setSites] = useState<Site[]>(SITES_METADATA);
  const [topics, setTopics] = useState<Topic[]>(TOPICS_LIST);

  const [currentUser, setCurrentUser] = useState<Person>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_USER);
      if (saved) {
        const found = INITIAL_PEOPLE.find((p) => p.Email === saved);
        if (found) return found;
      }
    } catch {}
    return INITIAL_PEOPLE[0]; // Tanveer (Admin)
  });

  const [uploads, setUploads] = useState<UploadItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_UPLOADS);
      if (saved) return JSON.parse(saved);
    } catch {}
    return INITIAL_UPLOADS;
  });

  const [directions, setDirections] = useState<DirectionMessage[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DIRECTIONS);
      if (saved) return JSON.parse(saved);
    } catch {}
    return INITIAL_DIRECTIONS;
  });

  const [shiftReports, setShiftReports] = useState<ShiftReport[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_REPORTS);
      if (saved) return JSON.parse(saved);
    } catch {}
    return INITIAL_REPORTS;
  });

  const [syncHealth, setSyncHealth] = useState<SyncHealth>(INITIAL_SYNC_HEALTH);
  const [syncLedger, setSyncLedger] = useState<SyncLedgerEntry[]>(INITIAL_LEDGER);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>(INITIAL_LOGS);

  // Live Google Workspace state
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false);
  const [isFetchingLiveSheets, setIsFetchingLiveSheets] = useState(false);
  const [isFetchingLiveDrive, setIsFetchingLiveDrive] = useState(false);
  const [liveSheetsMeta, setLiveSheetsMeta] = useState<LiveSheetDataResult | null>(null);
  const [liveDriveData, setLiveDriveData] = useState<LiveDriveResult | null>(null);

  // ClickUp state
  const [clickUpToken, setClickUpTokenState] = useState<string>(getStoredClickUpToken);
  const [isClickUpConnected, setIsClickUpConnected] = useState(false);
  const [isFetchingClickUp, setIsFetchingClickUp] = useState(false);
  const [liveClickUpData, setLiveClickUpData] = useState<LiveClickUpResult | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);

  const setClickUpToken = (tok: string) => {
    setClickUpTokenState(tok);
    saveStoredClickUpToken(tok);
  };

  // Listen to Google Auth state
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setGoogleUser(user);
        if (token) {
          setGoogleToken(token);
        }
      },
      () => {
        setGoogleUser(null);
        setGoogleToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // When Google token becomes available, trigger automatic live read (strictly GET)
  useEffect(() => {
    if (googleToken) {
      fetchLiveAllData();
    }
  }, [googleToken]);

  // If ClickUp token is already stored, test and load space
  useEffect(() => {
    if (clickUpToken) {
      testClickUpToken(clickUpToken).then((res) => {
        if (res.success) {
          fetchLiveClickUp();
        }
      });
    }
  }, []);

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_UPLOADS, JSON.stringify(uploads));
    } catch {}
  }, [uploads]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_DIRECTIONS, JSON.stringify(directions));
    } catch {}
  }, [directions]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(shiftReports));
    } catch {}
  }, [shiftReports]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_USER, currentUser.Email);
    } catch {}
  }, [currentUser]);

  // Google Sign-In action
  const signInWithGoogle = async () => {
    setIsSigningInGoogle(true);
    setLiveError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setGoogleUser(result.user);
        setGoogleToken(result.accessToken);

        // Map signed-in user into app active user if matched by email
        const matched = people.find((p) => p.Email.toLowerCase() === (result.user.email || '').toLowerCase());
        if (matched) {
          setCurrentUser(matched);
        } else if (result.user.email) {
          const newUser: Person = {
            Email: result.user.email,
            Name: result.user.displayName || result.user.email.split('@')[0],
            Role: 'Officer',
            Site: sites[0]?.SiteName || 'Bacolod HQ',
            Active: true,
            Avatar: result.user.photoURL || undefined
          };
          setPeople((prev) => [newUser, ...prev]);
          setCurrentUser(newUser);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLiveError(`Google sign-in error: ${msg}`);
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
  };

  // Strictly READ-ONLY fetch for Google Sheets
  const fetchLiveSheets = async () => {
    const token = googleToken || (await getAccessToken());
    if (!token) return;

    setIsFetchingLiveSheets(true);
    setLiveError(null);
    try {
      const result = await fetchAllLiveSheetData(token);
      setLiveSheetsMeta(result);

      // Populate app with live sheet data if available
      if (result.uploads.length > 0) {
        setUploads(result.uploads);
      }
      if (result.directions.length > 0) {
        setDirections(result.directions);
      }
      if (result.shiftReports.length > 0) {
        setShiftReports(result.shiftReports);
      }
      if (result.people.length > 0) {
        setPeople(result.people);
      }
      if (result.sites.length > 0) {
        setSites(result.sites);
      }
      if (result.topics.length > 0) {
        setTopics(result.topics);
      }
      if (result.syncLedger.length > 0) {
        setSyncLedger(result.syncLedger);
      }
      if (result.syncLogs.length > 0) {
        setSyncLogs(result.syncLogs);
      }

      setSyncHealth((prev) => ({
        ...prev,
        lastSync: new Date().toISOString(),
        syncState: 'OK'
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLiveError(`Live Google Sheets fetch error: ${msg}`);
      console.error('Failed to fetch live Google Sheets data:', err);
    } finally {
      setIsFetchingLiveSheets(false);
    }
  };

  // Strictly READ-ONLY fetch for Google Drive
  const fetchLiveDrive = async () => {
    const token = googleToken || (await getAccessToken());
    if (!token) return;

    setIsFetchingLiveDrive(true);
    try {
      const result = await fetchAllLiveDriveData(token);
      setLiveDriveData(result);
    } catch (err: unknown) {
      console.error('Failed to fetch live Google Drive data:', err);
    } finally {
      setIsFetchingLiveDrive(false);
    }
  };

  // Test and fetch ClickUp
  const testClickUpToken = async (token: string): Promise<{ success: boolean; message: string }> => {
    const res = await testClickUpConnection(token);
    setIsClickUpConnected(res.success);
    return res;
  };

  // Strictly READ-ONLY fetch for ClickUp
  const fetchLiveClickUp = async () => {
    if (!clickUpToken) return;

    setIsFetchingClickUp(true);
    try {
      const result = await fetchAllLiveClickUpData(clickUpToken);
      setLiveClickUpData(result);
      setIsClickUpConnected(true);

      // Merge ClickUp tasks into directions if not already present
      if (result.tasks.length > 0) {
        const clickUpDirections: DirectionMessage[] = result.tasks.map((task) => ({
          feedbackId: `CU-${task.id}`,
          title: task.name,
          message: task.description || task.name,
          type: "Today's tasks",
          source: `ClickUp:${task.id}`,
          fromPerson: task.creator?.username || 'ClickUp Space',
          sentAt: task.date_created ? new Date(parseInt(task.date_created)).toISOString() : new Date().toISOString(),
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
    } catch (err: unknown) {
      console.warn('ClickUp fetch warning:', err);
    } finally {
      setIsFetchingClickUp(false);
    }
  };

  // Master live fetch
  const fetchLiveAllData = async () => {
    await Promise.all([fetchLiveSheets(), fetchLiveDrive(), fetchLiveClickUp()]);
  };

  // Role flags matching Apps Script
  const isWide = ['Admin', 'Engagement Lead'].includes(currentUser.Role);
  const canReview = isWide || currentUser.Role === 'Site Manager' || currentUser.Role === 'Creative Designer';
  const canPublish = isWide;

  const getTopPickRoom = (site: string, shift: string, mode: string, eventName: string = '', dateStr?: string) => {
    const ymd = dateStr || new Date().toISOString().slice(0, 10);
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
    ext?: string;
  }>): Promise<UploadItem[]> => {
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
      const folderPath = buildFolderPath(
        siteMeta.FolderName,
        f.shiftDate,
        f.shift,
        f.mode,
        f.eventName,
        fileName
      );

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

      const item: UploadItem = {
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
        reviewStatus: 'Pending',
        folderPath
      };

      created.push(item);
    }

    setUploads((prev) => [...created, ...prev]);
    return created;
  };

  const reviewUpload = async (id: string, decision: ReviewStatus, note?: string) => {
    const target = uploads.find((u) => u.id === id);
    if (!target) return;

    const now = new Date().toISOString();
    let createdTaskId: string | undefined = undefined;

    if (decision === 'Reshoot' || decision === 'Top pick') {
      const generatedId = '868z' + Math.random().toString(36).substring(2, 7);
      createdTaskId = generatedId;

      const ledgerKey = `upload-${id}-${decision === 'Reshoot' ? 'reshoot' : 'top'}`;
      const listId = decision === 'Reshoot' ? '1300380000010216' : '1300380000010227';

      setSyncLedger((prev) => [
        {
          key: ledgerKey,
          listId,
          taskId: generatedId,
          state: 'Created',
          updatedAt: now
        },
        ...prev
      ]);

      setSyncLogs((prev) => [
        {
          id: Math.random().toString(),
          time: now,
          stage: 'followups',
          state: 'OK',
          detail: `${decision === 'Reshoot' ? 'Reshoot task created for officer in site list' : 'Top pick added to Marketing Content Handoff'} (${id} -> ClickUp #${generatedId})`
        },
        ...prev
      ]);
    }

    setUploads((prev) =>
      prev.map((u) => {
        if (u.id === id) {
          return {
            ...u,
            reviewStatus: decision,
            reviewNote: note || u.reviewNote,
            reviewedBy: currentUser.Email,
            reviewedAt: now,
            topPick: decision === 'Top pick' ? true : u.topPick,
            clickUpTask: createdTaskId || u.clickUpTask
          };
        }
        return u;
      })
    );
  };

  const toggleUsedInFinal = (id: string) => {
    setUploads((prev) =>
      prev.map((u) => (u.id === id ? { ...u, usedInFinal: !u.usedInFinal } : u))
    );
  };

  const acknowledgeDirection = (feedbackId: string, reply?: string) => {
    const now = new Date().toISOString();
    setDirections((prev) =>
      prev.map((d) => {
        if (d.feedbackId === feedbackId) {
          const list = d.acknowledgedBy || [];
          return {
            ...d,
            acknowledged: true,
            acknowledgedAt: now,
            acknowledgedBy: Array.from(new Set([...list, currentUser.Email])),
            reply: reply || d.reply
          };
        }
        return d;
      })
    );

    setSyncLogs((prev) => [
      {
        id: Math.random().toString(),
        time: now,
        stage: 'directions',
        state: 'OK',
        detail: `Officer ${currentUser.Name} acknowledged direction (${feedbackId}) with comment: "${reply || 'Read in app'}"`
      },
      ...prev
    ]);
  };

  const publishDirection = (feedbackId: string) => {
    if (!canPublish) return;
    const now = new Date().toISOString();
    setDirections((prev) =>
      prev.map((d) => {
        if (d.feedbackId === feedbackId) {
          return {
            ...d,
            status: 'Published',
            sentAt: now
          };
        }
        return d;
      })
    );

    setSyncLogs((prev) => [
      {
        id: Math.random().toString(),
        time: now,
        stage: 'directions',
        state: 'OK',
        detail: `Lead published draft feedback (${feedbackId}) to team`
      },
      ...prev
    ]);
  };

  const addShiftReport = (report: Omit<ShiftReport, 'reportId' | 'isLate'>) => {
    const siteMeta = sites.find((s) => s.SiteName === report.site) || sites[0];
    const reportId = `REP-${formatYmdClean(new Date())}-${siteMeta.Code}-${String(shiftReports.length + 1).padStart(2, '0')}`;
    const newReport: ShiftReport = {
      ...report,
      reportId,
      isLate: false
    };
    setShiftReports((prev) => [newReport, ...prev]);
  };

  const signOffReport = (reportId: string) => {
    setShiftReports((prev) =>
      prev.map((r) => (r.reportId === reportId ? { ...r, signedOff: true, verified: true } : r))
    );
  };

  const triggerManualSync = async () => {
    const now = new Date().toISOString();
    await fetchLiveAllData();

    setSyncHealth((prev) => ({
      ...prev,
      lastSync: now,
      syncState: 'OK',
      stages: [
        { name: 'places', state: 'OK', at: now, detail: `Geocoded all uploads with GPS coordinates` },
        { name: 'directions', state: 'OK', at: now, detail: `Pulled site tasks from ClickUp space ${prev.space}` },
        { name: 'followups', state: 'OK', at: now, detail: `Synced review actions and status ledgers` },
        { name: 'events', state: 'OK', at: now, detail: `Checked 4 upcoming site activity schedules` }
      ]
    }));

    setSyncLogs((prev) => [
      {
        id: Math.random().toString(),
        time: now,
        stage: 'system',
        state: 'OK',
        detail: `Admin ${currentUser.Name} triggered manual sync cycle. Fetched live data.`
      },
      ...prev
    ]);
  };

  const toggleSyncPause = () => {
    setSyncHealth((prev) => ({
      ...prev,
      paused: !prev.paused
    }));
  };

  const resetToSampleData = () => {
    setUploads(INITIAL_UPLOADS);
    setDirections(INITIAL_DIRECTIONS);
    setShiftReports(INITIAL_REPORTS);
    setSyncHealth(INITIAL_SYNC_HEALTH);
    setSyncLedger(INITIAL_LEDGER);
    setSyncLogs(INITIAL_LOGS);
    setLiveSheetsMeta(null);
    setLiveDriveData(null);
    localStorage.removeItem(STORAGE_KEY_UPLOADS);
    localStorage.removeItem(STORAGE_KEY_DIRECTIONS);
    localStorage.removeItem(STORAGE_KEY_REPORTS);
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        people,
        sites,
        topics,
        uploads,
        directions,
        shiftReports,
        syncHealth,
        syncLedger,
        syncLogs,

        // Live Integration
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

        canReview,
        canPublish,
        isWide,

        signInWithGoogle,
        signOutGoogle,
        fetchLiveSheets,
        fetchLiveDrive,
        fetchLiveClickUp,
        fetchLiveAllData,
        testClickUpToken,

        addBatchUploads,
        reviewUpload,
        toggleUsedInFinal,
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
