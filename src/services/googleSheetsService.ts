/**
 * Google Sheets Live Read Service
 * STRICTLY READ-ONLY: All API requests use HTTP GET. No write, update, append, or delete operations.
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
  ReviewStatus
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
 */
export async function fetchSpreadsheetMetadata(
  accessToken: string,
  spreadsheetId: string = TARGET_SPREADSHEET_ID
): Promise<{ title: string; tabs: SheetTabInfo[] }> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Google Sheets API error (${res.status}): ${errorText}`);
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

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  });

  if (!res.ok) {
    console.warn(`Tab ${tabName} could not be fetched (${res.status})`);
    return [];
  }

  const json = await res.json();
  return json.values || [];
}

/**
 * Parse rows into objects mapping headers to row values
 */
function rowsToObjects(rows: any[][]): Record<string, any>[] {
  if (!rows || rows.length < 2) return [];
  const headers = rows[0].map((h) => String(h || '').trim());
  const objects: Record<string, any>[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0 || !row.some((cell) => cell !== undefined && cell !== '')) {
      continue;
    }
    const obj: Record<string, any> = {};
    headers.forEach((header, idx) => {
      if (header) {
        obj[header] = row[idx] !== undefined ? row[idx] : '';
      }
    });
    objects.push(obj);
  }

  return objects;
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

  const tabNamesToFetch = [
    'Uploads',
    'Feedback',
    'Reports',
    'People',
    'Sites',
    'Topics',
    'SyncLedger',
    'SyncLog'
  ].filter((name) => tabTitles.some((t) => t.toLowerCase() === name.toLowerCase()));

  const fetchedData: Record<string, any[][]> = {};
  await Promise.all(
    tabNamesToFetch.map(async (name) => {
      const actualName = tabTitles.find((t) => t.toLowerCase() === name.toLowerCase()) || name;
      try {
        const rows = await fetchTabValues(accessToken, actualName, 'A1:Z500', spreadsheetId);
        fetchedData[name.toLowerCase()] = rows;
      } catch (err) {
        console.error(`Failed to fetch tab ${name}:`, err);
        fetchedData[name.toLowerCase()] = [];
      }
    })
  );

  const rawRowsCount: Record<string, number> = {};
  Object.keys(fetchedData).forEach((k) => {
    rawRowsCount[k] = fetchedData[k].length;
  });

  // 1. Parse Uploads
  const rawUploads = rowsToObjects(fetchedData['uploads'] || []);
  const parsedUploads: UploadItem[] = rawUploads.map((row, idx) => {
    const id = String(row['Upload ID'] || row['ID'] || row['id'] || `UP-${idx}`);
    const mediaType = String(row['Media Type'] || row['Type'] || 'Photo') === 'Video' ? 'Video' : 'Photo';
    const topPickVal = row['Top Pick'] || row['TopPick'];
    const isTopPick = topPickVal === true || String(topPickVal).toLowerCase() === 'true' || String(topPickVal).toLowerCase() === 'yes';
    const consentVal = row['Consent Signed'] || row['Consent'];
    const consentSigned = consentVal === true || String(consentVal).toLowerCase() === 'true' || String(consentVal).toLowerCase() === 'yes';
    const confVal = row['Nothing Confidential'] || row['Confidential OK'];
    const nothingConfidential = confVal === true || String(confVal).toLowerCase() === 'true' || String(confVal).toLowerCase() === 'yes';

    let reviewStatus: ReviewStatus = 'Pending';
    const rawStatus = String(row['Review Status'] || row['Status'] || '').toLowerCase();
    if (rawStatus.includes('accept') || rawStatus.includes('approv')) reviewStatus = 'Accepted';
    else if (rawStatus.includes('top')) reviewStatus = 'Top pick';
    else if (rawStatus.includes('reshoot')) reviewStatus = 'Reshoot';

    return {
      id,
      fileName: String(row['File Name'] || row['FileName'] || `${id}.${mediaType}.jpg`),
      officer: String(row['Officer'] || row['Email'] || row['Uploaded By'] || 'officer@empireonecx.com'),
      officerName: String(row['Officer Name'] || row['Name'] || row['Officer'] || 'Officer'),
      site: String(row['Site'] || row['Site Name'] || 'Bacolod HQ'),
      shift: String(row['Shift'] || 'Day Shift'),
      mode: (String(row['Mode'] || 'Daily') === 'Event' ? 'Event' : 'Daily') as 'Daily' | 'Event',
      eventName: String(row['Event Name'] || row['Event'] || ''),
      shiftDate: String(row['Shift Date'] || row['Date'] || new Date().toISOString().slice(0, 10)),
      topic: String(row['Topic'] || 'Site Activity'),
      spot: String(row['Spot'] || 'Main Lobby'),
      mediaType,
      mediaUrl: String(row['Drive File ID'] || row['Thumbnail Link'] || row['URL'] || `https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=600&auto=format&fit=crop&q=80`),
      fileSizeBytes: Number(row['File Size (Bytes)'] || row['Size'] || 2500000),
      capturedAt: String(row['Captured At'] || row['CapturedAt'] || new Date().toISOString()),
      uploadedAt: String(row['Uploaded At'] || row['UploadedAt'] || new Date().toISOString()),
      location: String(row['Location'] || row['GPS'] || ''),
      place: String(row['Place'] || row['Reverse Geocoded Place'] || ''),
      mapLink: String(row['Map Link'] || row['Google Maps Link'] || ''),
      note: String(row['Note'] || row['Caption'] || ''),
      peopleInShot: String(row['People In Shot'] || ''),
      consentSigned,
      nothingConfidential,
      topPick: isTopPick,
      reviewStatus,
      reviewNote: row['Review Note'] ? String(row['Review Note']) : undefined,
      reviewedBy: row['Reviewed By'] ? String(row['Reviewed By']) : undefined,
      reviewedAt: row['Reviewed At'] ? String(row['Reviewed At']) : undefined,
      usedInFinal: row['Used In Final'] === true || String(row['Used In Final']).toLowerCase() === 'true',
      clickUpTask: row['ClickUp Task ID'] || row['ClickUp Task'] ? String(row['ClickUp Task ID'] || row['ClickUp Task']) : undefined,
      folderPath: String(row['Folder Path'] || '')
    };
  });

  // 2. Parse Feedback / Directions
  const rawFeedback = rowsToObjects(fetchedData['feedback'] || []);
  const parsedDirections: DirectionMessage[] = rawFeedback.map((row, idx) => {
    const feedbackId = String(row['Feedback ID'] || row['ID'] || `FB-${idx}`);
    const ackVal = row['Acknowledged'] || row['Ack'];
    const isAck = ackVal === true || String(ackVal).toLowerCase() === 'true' || String(ackVal).toLowerCase() === 'yes';
    const note = String(row['Note'] || row['Message'] || row['Direction'] || 'Operational direction');
    const title = String(row['Title'] || row['Topic'] || 'Site Direction');

    return {
      feedbackId,
      title,
      message: note,
      type: (String(row['Type'] || '').includes('Theme') ? 'Theme to communicate' : "Today's tasks") as any,
      source: String(row['Source'] || `ClickUp:${row['Task ID'] || row['Task'] || 'task'}`),
      fromPerson: String(row['Author'] || row['Sent By'] || 'Admin'),
      sentAt: String(row['Sent At'] || row['Created At'] || new Date().toISOString()),
      toAll: row['To All'] !== false && String(row['To All']).toLowerCase() !== 'false',
      toSite: row['Site'] ? String(row['Site']) : undefined,
      toPerson: row['To Person'] ? String(row['To Person']) : undefined,
      status: (String(row['Status'] || 'Published') === 'Draft' ? 'Draft' : 'Published') as 'Draft' | 'Published',
      acknowledged: isAck,
      acknowledgedBy: row['Acknowledged By'] ? String(row['Acknowledged By']).split(',').map((s) => s.trim()) : [],
      acknowledgedAt: row['Acknowledged At'] ? String(row['Acknowledged At']) : undefined,
      reply: row['Reply'] ? String(row['Reply']) : undefined
    };
  });

  // 3. Parse Shift Reports
  const rawReports = rowsToObjects(fetchedData['reports'] || []);
  const parsedReports: ShiftReport[] = rawReports.map((row, idx) => {
    const reportId = String(row['Report ID'] || row['ID'] || `REP-${idx}`);
    const officer = String(row['Officer'] || 'officer@empireonecx.com');
    const officerName = String(row['Officer Name'] || row['Name'] || officer.split('@')[0]);
    const site = String(row['Site'] || 'Bacolod HQ');
    const shift = String(row['Shift'] || 'Day Shift');
    const shiftDate = String(row['Shift Date'] || row['Date'] || new Date().toISOString().slice(0, 10));

    return {
      reportId,
      officer,
      officerName,
      site,
      shift,
      shiftDate,
      engagementDone: String(row['Engagement Done'] || row['Notes'] || row['Summary'] || 'Standard shift duties completed'),
      photosCount: Number(row['Photos Count'] || row['Uploads Count'] || row['Uploads'] || 0),
      videosCount: Number(row['Videos Count'] || 0),
      hoursWorked: Number(row['Hours Worked'] || row['Shift Hours'] || row['Hours'] || 8),
      spotChecks: row['Spot Checks'] ? String(row['Spot Checks']).split(',').map((s) => s.trim()) : ['Lobby', 'Breakroom', 'Production Floor'],
      notes: row['Notes'] ? String(row['Notes']) : undefined,
      verified: row['Verified'] === true || String(row['Verified']).toLowerCase() === 'true',
      signedOff: row['Signed Off'] === true || String(row['Signed Off']).toLowerCase() === 'true',
      isLate: row['Late'] === true || String(row['Late']).toLowerCase() === 'true'
    };
  });

  // 4. Parse People
  const rawPeople = rowsToObjects(fetchedData['people'] || []);
  const parsedPeople: Person[] = rawPeople.map((row) => ({
    Email: String(row['Email'] || row['email'] || ''),
    Name: String(row['Name'] || row['name'] || row['Email'] || ''),
    Role: (row['Role'] || row['role'] || 'Officer') as any,
    Site: String(row['Site'] || row['Sites'] || 'Bacolod HQ'),
    Shift: row['Shift'] ? String(row['Shift']) : 'Day Shift',
    Active: row['Active'] !== false && String(row['Active']).toLowerCase() !== 'false',
    Avatar: row['Avatar'] ? String(row['Avatar']) : undefined
  })).filter((p) => p.Email);

  // 5. Parse Sites
  const rawSites = rowsToObjects(fetchedData['sites'] || []);
  const parsedSites: Site[] = rawSites.map((row) => ({
    Code: String(row['Code'] || 'SITE'),
    SiteName: String(row['Site Name'] || row['Site'] || row['Name'] || ''),
    FolderName: String(row['Folder Name'] || row['Folder'] || row['Site Name'] || ''),
    Timezone: String(row['Timezone'] || 'Asia/Manila'),
    Coordinates: {
      lat: Number(row['Lat'] || row['Latitude'] || 10.6765),
      lng: Number(row['Lng'] || row['Longitude'] || 122.9509)
    },
    BulkFolder: row['BulkFolder'] ? String(row['BulkFolder']) : undefined
  })).filter((s) => s.SiteName);

  // 6. Parse Topics
  const rawTopics = rowsToObjects(fetchedData['topics'] || []);
  const parsedTopics: Topic[] = rawTopics.map((row) => ({
    Topic: String(row['Topic'] || row['Name'] || ''),
    Code: String(row['Code'] || 'TOPIC'),
    Description: row['Description'] ? String(row['Description']) : undefined
  })).filter((t) => t.Topic);

  // 7. Parse SyncLedger & SyncLog
  const rawLedger = rowsToObjects(fetchedData['syncledger'] || []);
  const validStates: SyncLedgerEntry['state'][] = ['Pending', 'Posting', 'Created', 'Commented', 'Adopted', 'Uncertain'];
  const parsedLedger: SyncLedgerEntry[] = rawLedger.map((row) => {
    let state: SyncLedgerEntry['state'] = 'Created';
    const rowState = String(row['State'] || row['state'] || '');
    const found = validStates.find((s) => s.toLowerCase() === rowState.toLowerCase());
    if (found) state = found;

    return {
      key: String(row['Key'] || row['key'] || ''),
      listId: String(row['List ID'] || row['listId'] || ''),
      taskId: String(row['Task ID'] || row['taskId'] || ''),
      state,
      updatedAt: String(row['Updated At'] || row['updatedAt'] || new Date().toISOString())
    };
  }).filter((l) => l.key);

  const rawLogs = rowsToObjects(fetchedData['synclog'] || []);
  const parsedLogs: SyncLogEntry[] = rawLogs.map((row, idx) => {
    let state: SyncLogEntry['state'] = 'OK';
    const s = String(row['State'] || '').toLowerCase();
    if (s.includes('err')) state = 'Error';
    else if (s.includes('info')) state = 'Info';

    return {
      id: String(row['ID'] || `LOG-${idx}`),
      time: String(row['Time'] || row['Timestamp'] || new Date().toISOString()),
      stage: String(row['Stage'] || 'system'),
      state,
      detail: String(row['Detail'] || row['Message'] || '')
    };
  });

  return {
    spreadsheetTitle: meta.title,
    availableTabs: tabTitles,
    uploads: parsedUploads,
    directions: parsedDirections,
    shiftReports: parsedReports,
    people: parsedPeople.length > 0 ? parsedPeople : [],
    sites: parsedSites.length > 0 ? parsedSites : [],
    topics: parsedTopics.length > 0 ? parsedTopics : [],
    syncLedger: parsedLedger,
    syncLogs: parsedLogs,
    rawRowsCount,
    fetchedAt: new Date().toISOString()
  };
}

