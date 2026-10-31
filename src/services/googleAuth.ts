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
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly'
];

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}
provider.setCustomParameters({
  prompt: 'select_account'
});

const ACCESS_TOKEN_KEY = 'e1_google_access_token';

let cachedAccessToken: string | null =
  typeof window !== 'undefined' ? sessionStorage.getItem(ACCESS_TOKEN_KEY) : null;
let isSigningIn = false;

/**
 * Subscribe to the Firebase session.
 */
export const initAuth = (onChange: (user: User | null, token: string | null) => void) => {
  return onAuthStateChanged(
    auth,
    (user) => {
      if (user) {
        if (!cachedAccessToken && typeof window !== 'undefined') {
          cachedAccessToken = sessionStorage.getItem(ACCESS_TOKEN_KEY);
        }
        onChange(user, cachedAccessToken);
        return;
      }
      cachedAccessToken = null;
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.removeItem(ACCESS_TOKEN_KEY);
        } catch {
          // ignore
        }
      }
      onChange(null, null);
    },
    () => {
      cachedAccessToken = null;
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.removeItem(ACCESS_TOKEN_KEY);
        } catch {
          // ignore
        }
      }
      onChange(null, null);
    }
  );
};

/**
 * Must be called from a button click or user interaction.
 * Returns the Firebase user and a Google access token with Google Sheets & Drive permissions.
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Google sign in');
    }

    cachedAccessToken = credential.accessToken;
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(ACCESS_TOKEN_KEY, credential.accessToken);
      } catch {
        // ignore
      }
    }
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  if (!cachedAccessToken && typeof window !== 'undefined') {
    cachedAccessToken = sessionStorage.getItem(ACCESS_TOKEN_KEY);
  }
  return cachedAccessToken;
};

export const setAccessToken = (token: string | null) => {
  cachedAccessToken = token;
  if (typeof window !== 'undefined') {
    try {
      if (token) sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
      else sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    } catch {
      // ignore
    }
  }
};

export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    } catch {
      // ignore
    }
  }
};
