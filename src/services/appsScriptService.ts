/**
 * Service to connect the React web app to a deployed Google Apps Script Web App endpoint.
 *
 * How it works:
 * 1. When Apps Script is deployed (Deploy > New Deployment > Web app > Execute as: Me, Who has access: Anyone),
 *    Google provides an endpoint URL: https://script.google.com/macros/s/[DEPLOYMENT_ID]/exec
 * 2. This service calls that URL to fetch live sheet data (appData), post reviews (appReview),
 *    acknowledge directions (appAcknowledge), and upload files (guUpload).
 * 3. If no URL is set or network fails, it seamlessly runs with local state & seed data.
 */

export interface AppsScriptConfig {
  webAppUrl: string;
  sheetId: string;
  driveRootId: string;
  clickUpTeamId: string;
  clickUpSpaceId: string;
  isConnected: boolean;
  lastChecked?: string;
}

const STORAGE_KEY_CONFIG = 'e1_apps_script_config_v2';

export const DEFAULT_APPS_SCRIPT_CONFIG: AppsScriptConfig = {
  webAppUrl: '',
  sheetId: '1Ts2VFZawgF2SmU4VSQf0ld6p7cEHkmE2GLzc-dKfk5E',
  driveRootId: '1U-cZodmbBU6R7cFwp0p4Ily2_KPhPiSN',
  clickUpTeamId: '90161592694',
  clickUpSpaceId: '1300380000003391',
  isConnected: false
};

export function getAppsScriptConfig(): AppsScriptConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (saved) return JSON.parse(saved);
  } catch {}
  return DEFAULT_APPS_SCRIPT_CONFIG;
}

export function saveAppsScriptConfig(config: AppsScriptConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
  } catch {}
}

/**
 * Tests connection to a deployed Apps Script Web App
 */
export async function testAppsScriptConnection(url: string): Promise<{ success: boolean; message: string; data?: unknown }> {
  if (!url || !url.startsWith('https://script.google.com/macros/s/')) {
    return {
      success: false,
      message: 'Enter a valid Google Apps Script Web App URL (starts with https://script.google.com/macros/s/...)'
    };
  }

  try {
    const targetUrl = `${url}?action=ping`;
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      mode: 'cors'
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        message: 'Successfully connected to deployed Google Apps Script Web App!',
        data
      };
    } else {
      return {
        success: false,
        message: `Apps Script returned HTTP status ${response.status}. Make sure the deployment is set to "Anyone" access.`
      };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Note: Due to Google redirect 302 / CORS, standard Apps Script requires doGet returning ContentService
    return {
      success: false,
      message: `Could not reach Apps Script endpoint directly: ${msg}. Make sure your doGet handles action=ping or use JSONP/CORS wrapper.`
    };
  }
}
