/**
 * Google Sheets Live Service
 * Read, append, and update operations for Google Sheets API v4.
 */

import {
  UploadItem,
  DirectionMessage,
  ShiftReport,
  Person,
  Site,
  Topic,
  SyncLedgerEntry,
  SyncLogEntry,
  ReviewStatus,
  Role
} from '../types';

export const TARGET_SPREADSHEET_ID = '1Ts2VFZawgF2SmU4VSQf0ld6p7cEHkmE2GLzc-dKfk5E';

export interface SheetTabInfo {
  sheetId: number;
  title: string;
  rowCount?: number;
  columnCount?: number;
}

export interface LiveSheetDataResult {
  spreadsheetTitle: string;
  availableTabs: string[];
  uploads: UploadItem[];
  directions: DirectionMessage[];
  shiftReports: ShiftReport[];
  people: Person[];
  sites: Site[];
  topics: Topic[];
  syncLedger: SyncLedgerEntry[];
  syncLogs: SyncLogEntry[];
  rawRowsCount: Record<string, number>;
  fetchedAt: string;
}

/**
 * Fetch spreadsheet metadata to discover actual tab names.
 * Supports direct client fetch with transparent server-proxy fallback.
 */
export async function fetchSpreadsheetMetadata(
  accessToken: string,
  spreadsheetId: string = TARGET_SPREADSHEET_ID
): Promise<{ title: string; tabs: SheetTabInfo[] }> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties`;
  let res: Response | null = null;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      }
    });
  } catch (directErr) {
    console.warn('Direct Sheets metadata fetch failed, attempting server proxy fallback...', directErr);
  }

  // Fallback to server proxy if direct fetch failed or received an error
  if (!res || !res.ok) {
    try {
      const proxyRes = await fetch('/api/sheets/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: accessToken, spreadsheetId })
      });
      if (proxyRes.ok) {
        res = proxyRes;
      }
    } catch (proxyErr) {
      console.warn('Server proxy metadata fetch failed:', proxyErr);
    }
  }

  if (!res || !res.ok) {
    const errorText = res ? await res.text() : 'Network error or blocked request';
    throw new Error(`Google Sheets API error (${res?.status ?? 'Network'}): ${errorText}`);
  }

  const data = await res.json();
  const title = data.properties?.title || 'E1 Engagement Tracker';
  const tabs: SheetTabInfo[] = (data.sheets || []).map((s: any) => ({
    sheetId: s.properties?.sheetId,
    title: s.properties?.title || '',
    rowCount: s.properties?.gridProperties?.rowCount,
    columnCount: s.properties?.gridProperties?.columnCount
  }));

  return { title, tabs };
}

/**
 * Fetch raw 2D array of values for a tab range (HTTP GET only)
 * Supports direct client fetch with transparent server-proxy fallback.
 */
export async function fetchTabValues(
  accessToken: string,
  tabName: string,
  range: string = 'A1:Z500',
  spreadsheetId: string = TARGET_SPREADSHEET_ID
): Promise<any[][]> {
  const fullRange = `${tabName}!${range}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
    fullRange
  )}?valueRenderOption=UNFORMATTED_VALUE`;

  let res: Response | null = null;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      }
    });
  } catch (directErr) {
    console.warn(`Direct Sheets fetch for tab ${tabName} failed, trying server proxy...`, directErr);
  }

  // Fallback to server proxy if direct fetch failed
  if (!res || !res.ok) {
    try {
      const proxyRes = await fetch('/api/sheets/values', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: accessToken, spreadsheetId, tabName, range })
      });
      if (proxyRes.ok) {
        res = proxyRes;
      }
    } catch (proxyErr) {
      console.warn(`Proxy Sheets fetch for tab ${tabName} failed:`, proxyErr);
    }
  }

  if (!res || !res.ok) {
    console.warn(`Tab ${tabName} could not be fetched (${res?.status ?? 'Network'})`);
    return [];
  }

  const json = await res.json();
  return json.values || [];
}

/**
 * Parse rows into objects mapping headers to row values (case-insensitive header lookup)
 */
function rowsToObjects(rows: any[][]): Record<string, any>[] {
  if (!rows || rows.length < 2) return [];
  const rawHeaders = rows[0].map((h) => String(h || '').trim());
  const objects: Record<string, any>[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0 || !row.some((cell) => cell !== undefined && cell !== '')) {
      continue;
    }
    const obj: Record<string, any> = {};
    rawHeaders.forEach((header, idx) => {
      if (header) {
        const val = row[idx] !== undefined ? row[idx] : '';
        obj[header] = val;
        // Also map lowercase key for case-insensitive lookup
        obj[header.toLowerCase()] = val;
      }
    });
    objects.push(obj);
  }

  return objects;
}

/**
 * Helper to safely extract a field by trying multiple candidate header names
 */
function getCell(row: Record<string, any>, candidates: string[]): any {
  for (const cand of candidates) {
    if (cand in row && row[cand] !== undefined && row[cand] !== '') {
      return row[cand];
    }
    const lower = cand.toLowerCase();
    if (lower in row && row[lower] !== undefined && row[lower] !== '') {
      return row[lower];
    }
  }
  return '';
}

function normalizeRole(raw: any): Role {
  const str = String(raw || '').trim().toLowerCase();
  if (str.includes('admin')) return 'Admin';
  if (str.includes('director') || str.includes('lead')) return 'Director';
  if (str.includes('manager')) return 'Site Manager';
  if (str.includes('creative') || str.includes('designer')) return 'Creative Designer';
  return 'Officer';
}

function normalizeActive(raw: any): boolean {
  if (raw === undefined || raw === null || raw === '') return true;
  if (typeof raw === 'boolean') return raw;
  const s = String(raw).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1' || s === 'active';
}

/**
 * Detect what kind of data is stored in a tab based on title or header row
 */
type TabCategory = 'people' | 'uploads' | 'feedback' | 'reports' | 'sites' | 'topics' | 'syncledger' | 'synclog' | 'unknown';

function detectTabCategory(title: string, headers: string[]): TabCategory {
  const t = title.toLowerCase().trim();
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

  // 1. People / Roster
  if (
    t.includes('people') ||
    t.includes('roster') ||
    t.includes('member') ||
    t.includes('user') ||
    t.includes('team') ||
    t.includes('staff') ||
    t.includes('employee') ||
    t.includes('directory') ||
    (lowerHeaders.includes('email') && (lowerHeaders.includes('name') || lowerHeaders.includes('role')))
  ) {
    return 'people';
  }

  // 2. Uploads / Media
  if (
    t.includes('upload') ||
    t.includes('media') ||
    t.includes('photo') ||
    t.includes('capture') ||
    lowerHeaders.includes('upload id') ||
    lowerHeaders.includes('file name') ||
    lowerHeaders.includes('media type')
  ) {
    return 'uploads';
  }

  // 3. Feedback / Directions
  if (
    t.includes('feedback') ||
    t.includes('direction') ||
    t.includes('message') ||
    t.includes('task') ||
    lowerHeaders.includes('feedback id') ||
    lowerHeaders.includes('direction')
  ) {
    return 'feedback';
  }

  // 4. Shift Reports
  if (
    t.includes('report') ||
    t.includes('shift') ||
    lowerHeaders.includes('report id') ||
    lowerHeaders.includes('engagement done') ||
    lowerHeaders.includes('hours worked')
  ) {
    return 'reports';
  }

  // 5. Sites
  if (
    t.includes('site') ||
    t.includes('location') ||
    lowerHeaders.includes('site name') ||
    (lowerHeaders.includes('code') && lowerHeaders.includes('timezone'))
  ) {
    return 'sites';
  }

  // 6. Topics
  if (
    t.includes('topic') ||
    t.includes('theme') ||
    (lowerHeaders.includes('topic') && lowerHeaders.includes('code'))
  ) {
    return 'topics';
  }

  // 7. Sync Ledger
  if (t.includes('ledger') || (lowerHeaders.includes('state') && lowerHeaders.includes('key'))) {
    return 'syncledger';
  }

  // 8. Sync Log
  if (t.includes('log') || (lowerHeaders.includes('stage') && lowerHeaders.includes('detail'))) {
    return 'synclog';
  }

  return 'unknown';
}

/**
 * Fetch and parse all tabs from the real Google Sheet in parallel.
 * Guaranteed READ-ONLY.
 */
export async function fetchAllLiveSheetData(
  accessToken: string,
  spreadsheetId: string = TARGET_SPREADSHEET_ID
): Promise<LiveSheetDataResult> {
  const meta = await fetchSpreadsheetMetadata(accessToken, spreadsheetId);
  const tabTitles = meta.tabs.map((t) => t.title);

  // Fetch all discovered tabs up to 12
  const tabsToFetch = tabTitles.slice(0, 12);
  const fetchedTabs: Record<string, any[][]> = {};

  await Promise.all(
    tabsToFetch.map(async (title) => {
      try {
        const rows = await fetchTabValues(accessToken, title, 'A1:Z500', spreadsheetId);
        fetchedTabs[title] = rows;
      } catch (err) {
        console.error(`Failed to fetch tab ${title}:`, err);
        fetchedTabs[title] = [];
      }
    })
  );

  const rawRowsCount: Record<string, number> = {};
  const categorizedRows: Record<TabCategory, any[][]> = {
    people: [],
    uploads: [],
    feedback: [],
    reports: [],
    sites: [],
    topics: [],
    syncledger: [],
    synclog: [],
    unknown: []
  };

  for (const title of tabsToFetch) {
    const rows = fetchedTabs[title] || [];
    rawRowsCount[title] = rows.length;
    if (rows.length === 0) continue;

    const headers = (rows[0] || []).map((h: any) => String(h || ''));
    const category = detectTabCategory(title, headers);

    if (category !== 'unknown') {
      if (categorizedRows[category].length === 0) {
        categorizedRows[category] = rows;
      } else {
        // If already populated, prefer the one with more rows
        if (rows.length > categorizedRows[category].length) {
          categorizedRows[category] = rows;
        }
      }
    }
  }

  // 1. Parse Uploads
  const rawUploads = rowsToObjects(categorizedRows['uploads']);
  const parsedUploads: UploadItem[] = rawUploads.map((row, idx) => {
    const id = String(getCell(row, ['Upload ID', 'ID', 'id']) || `UP-${idx}`);
    const rawType = String(getCell(row, ['Media Type', 'Type']) || 'Photo');
    const mediaType = rawType.toLowerCase() === 'video' ? 'Video' : 'Photo';
    const topPickVal = getCell(row, ['Top Pick', 'TopPick']);
    const isTopPick = topPickVal === true || String(topPickVal).toLowerCase() === 'true' || String(topPickVal).toLowerCase() === 'yes';
    const consentVal = getCell(row, ['Consent Signed', 'Consent']);
    const consentSigned = consentVal === true || String(consentVal).toLowerCase() === 'true' || String(consentVal).toLowerCase() === 'yes';
    const confVal = getCell(row, ['Nothing Confidential', 'Confidential OK']);
    const nothingConfidential = confVal === true || String(confVal).toLowerCase() === 'true' || String(confVal).toLowerCase() === 'yes';

    let reviewStatus: ReviewStatus = 'Pending';
    const rawStatus = String(getCell(row, ['Review Status', 'Status'])).toLowerCase();
    if (rawStatus.includes('accept') || rawStatus.includes('approv')) reviewStatus = 'Accepted';
    else if (rawStatus.includes('top')) reviewStatus = 'Top pick';
    else if (rawStatus.includes('reshoot')) reviewStatus = 'Reshoot';

    return {
      id,
      fileName: String(getCell(row, ['File Name', 'FileName']) || `${id}.${mediaType}.jpg`),
      officer: String(getCell(row, ['Officer', 'Email', 'Uploaded By']) || 'officer@empireonecx.com'),
      officerName: String(getCell(row, ['Officer Name', 'Name', 'Officer']) || 'Officer'),
      site: String(getCell(row, ['Site', 'Site Name']) || 'Cebu City'),
      shift: String(getCell(row, ['Shift']) || 'Peak'),
      mode: (String(getCell(row, ['Mode']) || 'Daily') === 'Event' ? 'Event' : 'Daily') as 'Daily' | 'Event',
      eventName: String(getCell(row, ['Event Name', 'Event']) || ''),
      shiftDate: String(getCell(row, ['Shift Date', 'Date']) || new Date().toISOString().slice(0, 10)),
      topic: String(getCell(row, ['Topic']) || 'Site Activity'),
      spot: String(getCell(row, ['Spot']) || 'Main Lobby'),
      mediaType,
      mediaUrl: String(getCell(row, ['Drive File ID', 'Thumbnail Link', 'URL']) || `https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=600&auto=format&fit=crop&q=80`),
      fileSizeBytes: Number(getCell(row, ['File Size (Bytes)', 'Size']) || 2500000),
      capturedAt: String(getCell(row, ['Captured At', 'CapturedAt']) || new Date().toISOString()),
      uploadedAt: String(getCell(row, ['Uploaded At', 'UploadedAt']) || new Date().toISOString()),
      location: String(getCell(row, ['Location', 'GPS']) || ''),
      place: String(getCell(row, ['Place', 'Reverse Geocoded Place']) || ''),
      mapLink: String(getCell(row, ['Map Link', 'Google Maps Link']) || ''),
      note: String(getCell(row, ['Note', 'Caption']) || ''),
      peopleInShot: String(getCell(row, ['People In Shot']) || ''),
      consentSigned,
      nothingConfidential,
      topPick: isTopPick,
      reviewStatus,
      reviewNote: getCell(row, ['Review Note']) ? String(getCell(row, ['Review Note'])) : undefined,
      reviewedBy: getCell(row, ['Reviewed By']) ? String(getCell(row, ['Reviewed By'])) : undefined,
      reviewedAt: getCell(row, ['Reviewed At']) ? String(getCell(row, ['Reviewed At'])) : undefined,
      usedInFinal: String(getCell(row, ['Used In Final'])).toLowerCase() === 'true',
      clickUpTask: getCell(row, ['ClickUp Task ID', 'ClickUp Task']) ? String(getCell(row, ['ClickUp Task ID', 'ClickUp Task'])) : undefined,
      folderPath: String(getCell(row, ['Folder Path']) || '')
    };
  });

  // 2. Parse Feedback / Directions
  const rawFeedback = rowsToObjects(categorizedRows['feedback']);
  const parsedDirections: DirectionMessage[] = rawFeedback.map((row, idx) => {
    const feedbackId = String(getCell(row, ['Feedback ID', 'ID']) || `FB-${idx}`);
    const ackVal = getCell(row, ['Acknowledged', 'Ack']);
    const isAck = ackVal === true || String(ackVal).toLowerCase() === 'true' || String(ackVal).toLowerCase() === 'yes';
    const note = String(getCell(row, ['Note', 'Message', 'Direction']) || 'Operational direction');
    const title = String(getCell(row, ['Title', 'Topic']) || 'Site Direction');

    return {
      feedbackId,
      title,
      message: note,
      type: (String(getCell(row, ['Type'])).includes('Theme') ? 'Theme to communicate' : "Today's tasks") as any,
      source: String(getCell(row, ['Source']) || `ClickUp:${getCell(row, ['Task ID', 'Task']) || 'task'}`),
      fromPerson: String(getCell(row, ['Author', 'Sent By']) || 'Admin'),
      sentAt: String(getCell(row, ['Sent At', 'Created At']) || new Date().toISOString()),
      toAll: String(getCell(row, ['To All'])).toLowerCase() !== 'false',
      toSite: getCell(row, ['Site']) ? String(getCell(row, ['Site'])) : undefined,
      toPerson: getCell(row, ['To Person']) ? String(getCell(row, ['To Person'])) : undefined,
      status: (String(getCell(row, ['Status']) || 'Published') === 'Draft' ? 'Draft' : 'Published') as 'Draft' | 'Published',
      acknowledged: isAck,
      acknowledgedBy: getCell(row, ['Acknowledged By']) ? String(getCell(row, ['Acknowledged By'])).split(',').map((s) => s.trim()) : [],
      acknowledgedAt: getCell(row, ['Acknowledged At']) ? String(getCell(row, ['Acknowledged At'])) : undefined,
      reply: getCell(row, ['Reply']) ? String(getCell(row, ['Reply'])) : undefined
    };
  });

  // 3. Parse Shift Reports
  const rawReports = rowsToObjects(categorizedRows['reports']);
  const parsedReports: ShiftReport[] = rawReports.map((row, idx) => {
    const reportId = String(getCell(row, ['Report ID', 'ID']) || `REP-${idx}`);
    const officer = String(getCell(row, ['Officer']) || 'officer@empireonecx.com');
    const officerName = String(getCell(row, ['Officer Name', 'Name']) || officer.split('@')[0]);
    const site = String(getCell(row, ['Site']) || 'Cebu City');
    const shift = String(getCell(row, ['Shift']) || 'Peak');
    const shiftDate = String(getCell(row, ['Shift Date', 'Date']) || new Date().toISOString().slice(0, 10));

    return {
      reportId,
      officer,
      officerName,
      site,
      shift,
      shiftDate,
      engagementDone: String(getCell(row, ['Engagement Done', 'Notes', 'Summary']) || 'Standard shift duties completed'),
      photosCount: Number(getCell(row, ['Photos Count', 'Uploads Count', 'Uploads']) || 0),
      videosCount: Number(getCell(row, ['Videos Count']) || 0),
      hoursWorked: Number(getCell(row, ['Hours Worked', 'Shift Hours', 'Hours']) || 8),
      spotChecks: getCell(row, ['Spot Checks']) ? String(getCell(row, ['Spot Checks'])).split(',').map((s) => s.trim()) : ['Lobby', 'Breakroom', 'Production Floor'],
      notes: getCell(row, ['Notes']) ? String(getCell(row, ['Notes'])) : undefined,
      verified: String(getCell(row, ['Verified'])).toLowerCase() === 'true',
      signedOff: String(getCell(row, ['Signed Off'])).toLowerCase() === 'true',
      isLate: String(getCell(row, ['Late'])).toLowerCase() === 'true'
    };
  });

  // 4. Parse People / Roster (Matches Email, Name, Role, Site, Shift, Active)
  const rawPeople = rowsToObjects(categorizedRows['people']);
  const parsedPeople: Person[] = [];
  for (const row of rawPeople) {
    const email = String(getCell(row, ['Email', 'User Email', 'E-mail'])).trim();
    if (!email || !email.includes('@')) continue;

    const name = String(getCell(row, ['Name', 'Full Name', 'Officer Name']) || email.split('@')[0]).trim();
    const rawRole = getCell(row, ['Role', 'User Role', 'Position']);
    const isRootAdmin = email.toLowerCase() === 'tanveer@empireonecx.com';
    const role = isRootAdmin ? 'Admin' : normalizeRole(rawRole);
    const site = String(getCell(row, ['Site', 'Site Name', 'Location']) || 'Cebu City').trim();
    const shift = String(getCell(row, ['Shift', 'Schedule']) || 'Peak').trim();
    const active = isRootAdmin ? true : normalizeActive(getCell(row, ['Active', 'Is Active', 'Status']));
    const avatar = getCell(row, ['Avatar', 'Photo']) ? String(getCell(row, ['Avatar', 'Photo'])).trim() : undefined;

    parsedPeople.push({
      Email: email,
      Name: name,
      Role: role,
      Site: site,
      Shift: shift,
      Active: active,
      Avatar: avatar
    });
  }

  // 5. Parse Sites
  const rawSites = rowsToObjects(categorizedRows['sites']);
  const parsedSites: Site[] = rawSites
    .map((row) => ({
      Code: String(getCell(row, ['Code', 'Site Code']) || 'SITE'),
      SiteName: String(getCell(row, ['Site Name', 'Site', 'Name']) || ''),
      FolderName: String(getCell(row, ['Folder Name', 'Folder', 'Site Name']) || ''),
      Timezone: String(getCell(row, ['Timezone']) || 'Asia/Manila'),
      Coordinates: {
        lat: Number(getCell(row, ['Lat', 'Latitude']) || 10.3157),
        lng: Number(getCell(row, ['Lng', 'Longitude']) || 123.8854)
      },
      BulkFolder: getCell(row, ['BulkFolder', 'Bulk Folder']) ? String(getCell(row, ['BulkFolder', 'Bulk Folder'])) : undefined
    }))
    .filter((s) => s.SiteName);

  // 6. Parse Topics
  const rawTopics = rowsToObjects(categorizedRows['topics']);
  const parsedTopics: Topic[] = rawTopics
    .map((row) => ({
      Topic: String(getCell(row, ['Topic', 'Name', 'Topic Name']) || ''),
      Code: String(getCell(row, ['Code', 'Topic Code']) || 'TOPIC'),
      Description: getCell(row, ['Description', 'Desc']) ? String(getCell(row, ['Description', 'Desc'])) : undefined
    }))
    .filter((t) => t.Topic);

  // 7. Parse SyncLedger & SyncLog
  const rawLedger = rowsToObjects(categorizedRows['syncledger']);
  const validStates: SyncLedgerEntry['state'][] = ['Pending', 'Posting', 'Created', 'Commented', 'Adopted', 'Uncertain'];
  const parsedLedger: SyncLedgerEntry[] = rawLedger
    .map((row) => {
      let state: SyncLedgerEntry['state'] = 'Created';
      const rowState = String(getCell(row, ['State', 'Status']) || '');
      const found = validStates.find((s) => s.toLowerCase() === rowState.toLowerCase());
      if (found) state = found;

      return {
        key: String(getCell(row, ['Key', 'key']) || ''),
        listId: String(getCell(row, ['List ID', 'listId']) || ''),
        taskId: String(getCell(row, ['Task ID', 'taskId']) || ''),
        state,
        updatedAt: String(getCell(row, ['Updated At', 'updatedAt']) || new Date().toISOString())
      };
    })
    .filter((l) => l.key);

  const rawLogs = rowsToObjects(categorizedRows['synclog']);
  const parsedLogs: SyncLogEntry[] = rawLogs.map((row, idx) => {
    let state: SyncLogEntry['state'] = 'OK';
    const s = String(getCell(row, ['State', 'Status']) || '').toLowerCase();
    if (s.includes('err')) state = 'Error';
    else if (s.includes('info')) state = 'Info';

    return {
      id: String(getCell(row, ['ID', 'id']) || `LOG-${idx}`),
      time: String(getCell(row, ['Time', 'Timestamp']) || new Date().toISOString()),
      stage: String(getCell(row, ['Stage']) || 'system'),
      state,
      detail: String(getCell(row, ['Detail', 'Message']) || '')
    };
  });

  return {
    spreadsheetTitle: meta.title,
    availableTabs: tabTitles,
    uploads: parsedUploads,
    directions: parsedDirections,
    shiftReports: parsedReports,
    people: parsedPeople,
    sites: parsedSites,
    topics: parsedTopics,
    syncLedger: parsedLedger,
    syncLogs: parsedLogs,
    rawRowsCount,
    fetchedAt: new Date().toISOString()
  };
}

/**
 * Discover the tab name for people / roster in the Google Sheet
 */
export async function findRosterTab(
  accessToken: string,
  spreadsheetId: string = TARGET_SPREADSHEET_ID
): Promise<string> {
  try {
    const meta = await fetchSpreadsheetMetadata(accessToken, spreadsheetId);
    for (const tab of meta.tabs) {
      const titleLower = tab.title.toLowerCase();
      if (
        titleLower.includes('roster') ||
        titleLower.includes('people') ||
        titleLower.includes('user') ||
        titleLower.includes('team') ||
        titleLower.includes('staff') ||
        titleLower.includes('member') ||
        titleLower.includes('directory')
      ) {
        return tab.title;
      }
    }
    if (meta.tabs.length > 0) return meta.tabs[0].title;
  } catch (err) {
    console.warn('Could not discover tabs dynamically for roster, defaulting to Roster:', err);
  }
  return 'Roster';
}

/**
 * Append a newly created user row directly to Google Sheets (Columns A-F: Email, Name, Role, Site, Shift, Active)
 */
export async function appendUserToSheet(
  accessToken: string,
  user: {
    Email: string;
    Name: string;
    Role: string;
    Site: string;
    Shift?: string;
    Active?: boolean;
  },
  spreadsheetId: string = TARGET_SPREADSHEET_ID,
  targetTab?: string
): Promise<{ success: boolean; message: string; tab?: string }> {
  if (!accessToken) {
    return { success: false, message: 'Google access token is missing' };
  }
  if (!user.Email || !user.Email.includes('@')) {
    return { success: false, message: 'Valid email required' };
  }

  const tab = targetTab || (await findRosterTab(accessToken, spreadsheetId));
  const range = `${tab}!A:F`;
  const rowValues = [
    user.Email.trim(),
    (user.Name && user.Name.trim()) || user.Email.split('@')[0],
    user.Role || 'Officer',
    user.Site || 'Cebu City',
    user.Shift || 'Peak',
    user.Active !== false ? 'TRUE' : 'FALSE'
  ];

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
    range
  )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  let res: Response | null = null;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        range,
        majorDimension: 'ROWS',
        values: [rowValues]
      })
    });
  } catch (directErr) {
    console.warn('Direct append to Google Sheets failed, trying server proxy...', directErr);
  }

  // Fallback to server proxy
  if (!res || !res.ok) {
    try {
      const proxyRes = await fetch('/api/sheets/append', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: accessToken,
          spreadsheetId,
          range,
          values: [rowValues]
        })
      });
      if (proxyRes.ok) {
        res = proxyRes;
      }
    } catch (proxyErr) {
      console.warn('Server proxy append failed:', proxyErr);
    }
  }

  if (!res || !res.ok) {
    const errorText = res ? await res.text() : 'Network error or blocked request';
    let detail = errorText;
    try {
      const parsed = JSON.parse(errorText);
      detail = parsed.error?.message || errorText;
    } catch {}
    return {
      success: false,
      message: `Google Sheets write error (${res?.status ?? 'Network'}): ${detail}`,
      tab
    };
  }

  return {
    success: true,
    message: `Added ${user.Email} to Google Sheet tab “${tab}”`,
    tab
  };
}

/**
 * Update an existing user in Google Sheets by matching Email in column A
 */
export async function updateUserInSheet(
  accessToken: string,
  user: {
    Email: string;
    Name?: string;
    Role?: string;
    Site?: string;
    Shift?: string;
    Active?: boolean;
  },
  spreadsheetId: string = TARGET_SPREADSHEET_ID,
  targetTab?: string
): Promise<{ success: boolean; message: string; rowNumber?: number }> {
  if (!accessToken) {
    return { success: false, message: 'Google access token is missing' };
  }
  const emailKey = user.Email.trim().toLowerCase();
  const tab = targetTab || (await findRosterTab(accessToken, spreadsheetId));

  // 1. Fetch column A to find row index
  const emails = await fetchTabValues(accessToken, tab, 'A1:A500', spreadsheetId);
  let targetRowIndex = -1;
  for (let i = 0; i < emails.length; i++) {
    const rowEmail = String(emails[i]?.[0] || '').trim().toLowerCase();
    if (rowEmail === emailKey) {
      targetRowIndex = i + 1; // 1-based row index in Sheets
      break;
    }
  }

  // If user row is not found in the sheet, append them instead!
  if (targetRowIndex === -1) {
    const appendRes = await appendUserToSheet(
      accessToken,
      {
        Email: user.Email,
        Name: user.Name || user.Email.split('@')[0],
        Role: user.Role || 'Officer',
        Site: user.Site || 'Cebu City',
        Shift: user.Shift || 'Peak',
        Active: user.Active
      },
      spreadsheetId,
      tab
    );
    return {
      success: appendRes.success,
      message: appendRes.message
    };
  }

  // 2. Fetch existing row values to merge
  const existingRowValues = await fetchTabValues(
    accessToken,
    tab,
    `A${targetRowIndex}:F${targetRowIndex}`,
    spreadsheetId
  );
  const cur = existingRowValues[0] || [];
  const updatedRow = [
    user.Email,
    user.Name !== undefined ? user.Name : cur[1] || '',
    user.Role !== undefined ? user.Role : cur[2] || 'Officer',
    user.Site !== undefined ? user.Site : cur[3] || 'Cebu City',
    user.Shift !== undefined ? user.Shift : cur[4] || 'Peak',
    user.Active !== undefined ? (user.Active ? 'TRUE' : 'FALSE') : cur[5] || 'TRUE'
  ];

  const updateRange = `${tab}!A${targetRowIndex}:F${targetRowIndex}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
    updateRange
  )}?valueInputOption=USER_ENTERED`;

  let res: Response | null = null;
  try {
    res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        range: updateRange,
        majorDimension: 'ROWS',
        values: [updatedRow]
      })
    });
  } catch (directErr) {
    console.warn('Direct update to Google Sheets failed, trying proxy...', directErr);
  }

  if (!res || !res.ok) {
    try {
      const proxyRes = await fetch('/api/sheets/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: accessToken,
          spreadsheetId,
          range: updateRange,
          values: [updatedRow]
        })
      });
      if (proxyRes.ok) {
        res = proxyRes;
      }
    } catch (proxyErr) {
      console.warn('Server proxy update failed:', proxyErr);
    }
  }

  if (!res || !res.ok) {
    const errorText = res ? await res.text() : 'Network error or blocked request';
    return {
      success: false,
      message: `Google Sheets update error (${res?.status ?? 'Network'}): ${errorText}`
    };
  }

  return {
    success: true,
    message: `Updated ${user.Email} in Google Sheet tab “${tab}” (Row ${targetRowIndex})`,
    rowNumber: targetRowIndex
  };
}
