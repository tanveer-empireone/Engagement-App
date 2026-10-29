import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Firebase Auth uses local persistence by default, so a reload restores the same
// Google user. Do not call setPersistence here: a pending persistence change
// holds back the first auth callback and leaves the gate on a spinner.

export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.readonly'
];

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}
provider.setCustomParameters({
  prompt: 'select_account'
});

const TOKEN_STORAGE_KEY = 'e1_google_access_token_v1';
const TOKEN_TTL_MS = 55 * 60 * 1000;

let cachedAccessToken: string | null = null;

interface StoredToken {
  token: string;
  expiresAt: number;
  email: string;
}

function readStoredToken(email: string | null | undefined): string | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredToken>;
    const expected = (email || '').trim().toLowerCase();
    if (
      !parsed.token ||
      !parsed.expiresAt ||
      !parsed.email ||
      Date.now() >= parsed.expiresAt ||
      !expected ||
      parsed.email !== expected
    ) {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      return null;
    }
    return parsed.token;
  } catch {
    return null;
  }
}

function writeStoredToken(token: string | null, email?: string | null) {
  try {
    if (!token || !email) {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      return;
    }
    const payload: StoredToken = {
      token,
      email: email.trim().toLowerCase(),
      expiresAt: Date.now() + TOKEN_TTL_MS
    };
    sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // sessionStorage can throw; the in-memory token still covers this page view.
  }
}

/**
 * Subscribe to the Firebase session. The Google user survives reload.
 * The Sheets/Drive access token is restored only when it still belongs to that user.
 */
export const initAuth = (onChange: (user: User | null, token: string | null) => void) => {
  return onAuthStateChanged(
    auth,
    (user) => {
      if (user) {
        cachedAccessToken = readStoredToken(user.email);
        onChange(user, cachedAccessToken);
        return;
      }
      cachedAccessToken = null;
      writeStoredToken(null);
      onChange(null, null);
    },
    () => {
      cachedAccessToken = null;
      writeStoredToken(null);
      onChange(null, null);
    }
  );
};

/**
 * Must be called from a button click.
 * Returns the Firebase user and a Google access token for read-only Sheets and Drive.
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string }> => {
  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error('Failed to get access token from Google sign in');
  }

  cachedAccessToken = credential.accessToken;
  writeStoredToken(cachedAccessToken, result.user.email);
  return { user: result.user, accessToken: cachedAccessToken };
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

/** Firebase ID token for the API. This is not the Sheets/Drive access token. */
export const getFirebaseIdToken = async (): Promise<string | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
};

export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  writeStoredToken(null);
};
