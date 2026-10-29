import { createHash } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { ADMIN_EMAIL, normalizeEmail } from '../utils/access';
import { ServiceUnavailableError } from './errors';
import type { AppStore, PersonRecord } from './store';
import { FOUNDING_ADMIN } from './store';

export interface VerifiedIdentity {
  uid: string;
  email: string;
  exp?: number;
}

export type TokenVerifier = (token: string) => Promise<VerifiedIdentity | null>;

export interface AuthedRequest extends Request {
  authEmail?: string;
  authUid?: string;
}

interface CacheEntry {
  uid: string;
  email: string;
  expMs: number;
}

const tokenCache = new Map<string, CacheEntry>();

export function createCachedVerifier(verify: TokenVerifier): TokenVerifier {
  return async (token: string) => {
    const key = createHash('sha256').update(token).digest('hex');
    const hit = tokenCache.get(key);
    if (hit && hit.expMs > Date.now()) {
      return { uid: hit.uid, email: hit.email, exp: Math.floor(hit.expMs / 1000) };
    }
    const verified = await verify(token);
    if (!verified?.email) return null;
    const expMs = verified.exp ? verified.exp * 1000 : Date.now() + 5 * 60 * 1000;
    tokenCache.set(key, { uid: verified.uid, email: normalizeEmail(verified.email), expMs });
    return { ...verified, email: normalizeEmail(verified.email) };
  };
}

export function firebaseAdminConfigured(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

export async function verifyWithFirebaseAdmin(token: string): Promise<VerifiedIdentity | null> {
  if (!firebaseAdminConfigured()) {
    throw new ServiceUnavailableError(
      'Firebase admin credentials are not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.'
    );
  }
  let admin: any;
  try {
    admin = await import('firebase-admin');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ServiceUnavailableError(`Firebase admin SDK failed to load: ${message}`);
  }
  const appModule = admin.default || admin;
  if (!appModule.apps?.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (raw) {
      const creds = JSON.parse(raw) as { project_id?: string; client_email: string; private_key: string };
      appModule.initializeApp({
        credential: appModule.credential.cert(creds),
        projectId: process.env.FIREBASE_PROJECT_ID || creds.project_id
      });
    } else {
      appModule.initializeApp({
        credential: appModule.credential.applicationDefault(),
        projectId: process.env.FIREBASE_PROJECT_ID
      });
    }
  }
  try {
    const decoded = await appModule.auth().verifyIdToken(token);
    if (!decoded.email || decoded.email_verified === false) return null;
    return { uid: decoded.uid, email: decoded.email, exp: decoded.exp };
  } catch {
    return null;
  }
}

const NOT_ALLOWED = 'This email is not on the roster. An admin has to add it before sign-in.';

export async function loadActor(store: AppStore, email: string): Promise<PersonRecord | null> {
  const key = normalizeEmail(email);
  let person = await store.findPerson(key);
  if (!person && key === ADMIN_EMAIL) {
    person = await store.insertPerson({ ...FOUNDING_ADMIN, Email: ADMIN_EMAIL });
  }
  if (!person || person.Active === false) return null;
  return person;
}

export function requireUser(store: AppStore, verify: TokenVerifier) {
  const cached = createCachedVerifier(verify);
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.path.startsWith('/api') || req.path === '/api/health') {
      next();
      return;
    }
    const header = req.headers.authorization || '';
    const match = header.match(/^Bearer\s+(\S+)$/i);
    if (!match) {
      res.status(401).json({ ok: false, message: 'Sign in is required.' });
      return;
    }
    try {
      const identity = await cached(match[1]);
      if (!identity?.email) {
        res.status(401).json({ ok: false, message: 'That sign-in token is missing or expired.' });
        return;
      }
      const actor = await loadActor(store, identity.email);
      if (!actor) {
        res.status(403).json({ ok: false, allowed: false, message: NOT_ALLOWED });
        return;
      }
      req.authEmail = normalizeEmail(identity.email);
      req.authUid = identity.uid;
      next();
    } catch (err) {
      if (err instanceof ServiceUnavailableError) {
        res.status(503).json({ ok: false, message: err.message });
        return;
      }
      const message = err instanceof Error ? err.message : 'Sign-in could not be verified.';
      res.status(401).json({ ok: false, message });
    }
  };
}
