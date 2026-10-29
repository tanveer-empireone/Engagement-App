import { Person, Role } from '../types';

/** The original admin. This account stays Admin and cannot be demoted. */
export const ADMIN_EMAIL = 'tanveer@empireonecx.com';

export const ASSIGNABLE_ROLES: Role[] = [
  'Admin',
  'Engagement Lead',
  'Site Manager',
  'Creative Designer',
  'Officer'
];

const KNOWN_ROLES = new Set<Role>(ASSIGNABLE_ROLES);

export type AppShell = 'loading' | 'signin' | 'blocked' | 'app';

export function normalizeEmail(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase();
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return normalizeEmail(email) === ADMIN_EMAIL;
}

/** Keep a real role. The original admin email is always Admin. Unknown values become Officer. */
export function clampRole(email: string, role: string | null | undefined): Role {
  if (isAdminEmail(email)) return 'Admin';
  const candidate = (role || 'Officer') as Role;
  if (!KNOWN_ROLES.has(candidate)) return 'Officer';
  return candidate;
}

export function sanitizePerson(person: Person): Person {
  const admin = isAdminEmail(person.Email);
  return {
    ...person,
    Email: person.Email.trim(),
    Role: clampRole(person.Email, person.Role),
    Active: admin ? true : person.Active !== false
  };
}

export function sanitizeDirectory(people: Person[]): Person[] {
  const seen = new Set<string>();
  const out: Person[] = [];
  for (const person of people) {
    if (!person?.Email?.trim()) continue;
    const clean = sanitizePerson(person);
    const key = normalizeEmail(clean.Email);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

export interface GoogleIdentity {
  email: string;
  displayName?: string | null;
  photoURL?: string | null;
}

/**
 * Map a Google account onto the directory.
 * The signed-in email is the identity. There is no fallback to another person.
 * An email an admin has not added stays inactive, so it cannot open the app.
 * The founding admin email can still enter.
 */
export function resolveSessionPerson(identity: GoogleIdentity, directory: Person[]): Person | null {
  const email = identity.email.trim();
  if (!email) return null;
  const existing = directory.find((p) => normalizeEmail(p.Email) === normalizeEmail(email));
  if (!existing && !isAdminEmail(email)) {
    return sanitizePerson({
      Email: email,
      Name: identity.displayName || email.split('@')[0],
      Role: 'Officer',
      Site: 'Cebu City',
      Shift: 'Peak',
      Active: false,
      Avatar: identity.photoURL || undefined
    });
  }
  return sanitizePerson({
    Email: existing?.Email || email,
    Name: existing?.Name || identity.displayName || email.split('@')[0],
    Role: existing?.Role || 'Officer',
    Site: existing?.Site || 'Cebu City',
    Shift: existing?.Shift || 'Peak',
    Active: existing ? existing.Active : true,
    Avatar: identity.photoURL || existing?.Avatar
  });
}

export function selectAppShell(input: {
  authReady: boolean;
  hasGoogleUser: boolean;
  person: Person | null;
}): AppShell {
  if (!input.authReady) return 'loading';
  if (!input.hasGoogleUser || !input.person) return 'signin';
  if (!isAdminEmail(input.person.Email) && input.person.Active === false) return 'blocked';
  return 'app';
}

export function isAdminPerson(person: Person | null): boolean {
  return !!person && person.Active !== false && person.Role === 'Admin';
}

export function canOpenAdminPanel(person: Person | null): boolean {
  return isAdminPerson(person);
}

/** Integrations is an admin tool. Other roles do not see it. */
export function canSeeIntegrations(person: Person | null): boolean {
  return isAdminPerson(person);
}

/** Capture is hidden for admins until an admin turns it back on. Everyone else still sees it. */
export function canUseCapture(person: Person | null, showCaptureForAdmin: boolean): boolean {
  if (!person || person.Active === false) return false;
  if (person.Role === 'Admin') return showCaptureForAdmin;
  return true;
}

export function samePersonRecord(a: Person, b: Person): boolean {
  return (
    a.Email === b.Email &&
    a.Name === b.Name &&
    a.Role === b.Role &&
    a.Site === b.Site &&
    a.Shift === b.Shift &&
    a.Active === b.Active &&
    a.Avatar === b.Avatar
  );
}
