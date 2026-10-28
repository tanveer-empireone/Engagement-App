/**
 * E1 Engagement Capture - Business Logic & ID Generation
 * Matches the Google Apps Script logic for EmpireOne CX.
 */

export const SITES_METADATA = [
  { Code: 'CEB', SiteName: 'Cebu City', FolderName: 'E1CX Experience Cebu', Timezone: 'Asia/Manila', Coordinates: { lat: 10.3157, lng: 123.8854 } },
  { Code: 'CAR', SiteName: 'Carcar', FolderName: 'E1CX Experience Carcar', Timezone: 'Asia/Manila', Coordinates: { lat: 10.1067, lng: 123.6425 } },
  { Code: 'SNC', SiteName: 'San Carlos', FolderName: 'E1CX Experience San Carlos', Timezone: 'Asia/Manila', Coordinates: { lat: 10.4856, lng: 123.4167 } },
  { Code: 'URD', SiteName: 'Urdaneta', FolderName: 'E1CX Experience Urdaneta', Timezone: 'Asia/Manila', Coordinates: { lat: 15.9758, lng: 120.5711 } },
  { Code: 'TOR', SiteName: 'Toronto', FolderName: 'E1CX Experience Toronto', Timezone: 'America/Toronto', Coordinates: { lat: 43.6532, lng: -79.3832 } },
  { Code: 'SMR', SiteName: 'Santa Marta', FolderName: 'E1CX Experience Santa Marta', Timezone: 'America/Bogota', Coordinates: { lat: 11.2408, lng: -74.1990 } }
];

export const TOPICS_LIST = [
  { Topic: 'Employee Recognition', Code: 'REC', Description: 'Awards, shoutouts, anniversaries, star performer spotlight' },
  { Topic: 'Floor Engagement & Games', Code: 'ENG', Description: 'Huddle games, quick contests, floor activities, quizzes' },
  { Topic: 'Team Huddle & Brief', Code: 'HUD', Description: 'Daily huddles, shift start alignment, team announcements' },
  { Topic: 'Wellness & Morale', Code: 'WEL', Description: 'Mental health, stretch breaks, snacks, morale boosters' },
  { Topic: 'Town Hall & Culture', Code: 'TWN', Description: 'Executive updates, all-hands gatherings, culture pillars' },
  { Topic: 'Contests & Raffles', Code: 'CON', Description: 'Site-wide competitions, themed raffles, milestone drawings' },
  { Topic: 'Holiday & Celebration', Code: 'CEL', Description: 'Birthdays, festive themes, holidays, cultural celebrations' },
  { Topic: 'General / Other', Code: 'GEN', Description: 'Day-to-day team moments, training sessions, camaraderie' }
];

export const SPOTS_LIST = [
  'Production floor',
  'Break room',
  'Training room',
  'Lobby',
  'Outdoors',
  'Other'
];

export const SHIFTS_LIST = ['Peak', 'Day', 'Night', 'Grave'];

/** Formats a date into YYYY-MM-DD */
export function formatYmd(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Formats a date into YYYYMMDD without dashes */
export function formatYmdClean(d: Date): string {
  return formatYmd(d).replace(/-/g, '');
}

/**
 * Calculates the shift date according to E1 Apps Script rules.
 * Toronto (TOR) and Santa Marta (SMR) use their local dates.
 * Philippine sites shift back 1 day if before shift start hour.
 */
export function calculateShiftDate(code: string, when: Date, startHour: number = 6): string {
  if (code === 'TOR' || code === 'SMR') {
    return formatYmd(when);
  }
  // For PH sites: if hour is before the shift start (e.g. 0-5am for night shift that started the previous evening)
  const hour = when.getHours();
  if (hour < startHour) {
    const prevDay = new Date(when.getTime() - 86400000);
    return formatYmd(prevDay);
  }
  return formatYmd(when);
}

/**
 * Generates the next sequential E1 ID given a prefix and list of existing IDs.
 * Format: [Prefix][01, 02, ...]
 * Example: 'CEB_20261027_REC_' -> 'CEB_20261027_REC_01'
 */
export function generateUploadId(prefix: string, existingIds: string[]): string {
  let max = 0;
  for (const id of existingIds) {
    if (id.startsWith(prefix)) {
      const rest = id.slice(prefix.length);
      const num = parseInt(rest, 10);
      if (!isNaN(num) && num > max) {
        max = num;
      }
    }
  }
  return prefix + String(max + 1).padStart(2, '0');
}

/**
 * Builds the standard E1 file name.
 * Format: [ID].[MediaType].[group|single].[ext]
 * Example: 'CEB_20261027_REC_01.Photo.group.jpg'
 */
export function buildE1FileName(id: string, mediaType: 'Photo' | 'Video', isGroup: boolean, ext: string = 'jpg'): string {
  const cleanExt = ext.replace(/^\./, '').toLowerCase();
  const variant = isGroup ? 'group' : 'single';
  return `${id}.${mediaType}.${variant}.${cleanExt}`;
}

/**
 * Builds the folder path in Google Drive according to E1 CX rules.
 * Daily: SITE_FOLDER / YYYY-MM-DD / Shift / filename
 * Event: SITE_FOLDER / Events / YYYY-MM-DD EventName / filename
 */
export function buildFolderPath(
  siteFolderName: string,
  ymd: string,
  shift: string,
  mode: 'Daily' | 'Event',
  eventName: string = '',
  fileName: string = ''
): string {
  if (mode === 'Event') {
    const cleanEvent = eventName.trim().replace(/[/\\?%*:|"<>]/g, '_');
    return `${siteFolderName}/Events/${ymd} ${cleanEvent}/${fileName}`.replace(/\/+$/, '');
  }
  return `${siteFolderName}/${ymd}/${shift}/${fileName}`.replace(/\/+$/, '');
}

export interface TopPickRoomResult {
  used: number;
  limit: number;
  left: number;
}

/**
 * Calculates remaining top pick limit for an officer.
 * Rule: Daily mode = 5 per shift; Event mode = 10 per event.
 */
export function calculateTopPickRoom(
  existingUploads: Array<{
    officer: string;
    topPick: boolean;
    site: string;
    shiftDate: string;
    mode: string;
    shift: string;
    eventName?: string;
  }>,
  officerEmail: string,
  site: string,
  shift: string,
  mode: string,
  eventName: string,
  shiftDateYmd: string
): TopPickRoomResult {
  const limit = mode === 'Event' ? 10 : 5;
  const officerLower = officerEmail.toLowerCase();

  const used = existingUploads.filter((u) => {
    if (u.officer.toLowerCase() !== officerLower || !u.topPick || u.site !== site) {
      return false;
    }
    const d = u.shiftDate.slice(0, 10);
    if (d !== shiftDateYmd) {
      return false;
    }
    if (mode === 'Event') {
      return u.mode === 'Event' && String(u.eventName).trim().toLowerCase() === String(eventName).trim().toLowerCase();
    } else {
      return u.mode !== 'Event' && u.shift === shift;
    }
  }).length;

  return {
    used,
    limit,
    left: Math.max(0, limit - used)
  };
}

/**
 * Maps GPS coordinate to approximate EmpireOne CX place name if coordinates are near sites.
 */
export function reverseGeocodeApprox(lat: number, lng: number): { placeName: string; mapLink: string } {
  const mapLink = `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
  
  // Find closest site
  let closest = SITES_METADATA[0];
  let minDiff = Infinity;
  for (const s of SITES_METADATA) {
    const diff = Math.hypot(s.Coordinates.lat - lat, s.Coordinates.lng - lng);
    if (diff < minDiff) {
      minDiff = diff;
      closest = s;
    }
  }

  // If reasonably close (< 0.5 degrees), label with that site city & country
  if (minDiff < 0.5) {
    const country = closest.Code === 'TOR' ? 'Canada' : closest.Code === 'SMR' ? 'Colombia' : 'Philippines';
    return {
      placeName: `${closest.SiteName}, ${country}`,
      mapLink
    };
  }

  return {
    placeName: `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`,
    mapLink
  };
}
