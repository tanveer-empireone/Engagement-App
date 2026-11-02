import { DirectionMessage, Person, Role } from '../types';

/** The original admin. This account stays Admin and cannot be demoted. */
export const ADMIN_EMAIL = 'tanveer@empireonecx.com';

export const ASSIGNABLE_ROLES: Role[] = [
  'Admin',
  'Director',
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
  // Legacy migration for Engagement Lead
  if (role === 'Engagement Lead') return 'Director';
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
 */
export function resolveSessionPerson(identity: GoogleIdentity, directory: Person[]): Person | null {
  const email = identity.email.trim();
  if (!email) return null;
  const existing = directory.find((p) => normalizeEmail(p.Email) === normalizeEmail(email));
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

export function isDirectorPerson(person: Person | null): boolean {
  return !!person && person.Active !== false && person.Role === 'Director';
}

/** Both Technical Admins and Directors can open management (with appropriately scoped capabilities) */
export function canOpenAdminPanel(person: Person | null): boolean {
  return isAdminPerson(person) || isDirectorPerson(person);
}

/** Integrations & server configuration is strictly a Technical Admin tool */
export function canSeeIntegrations(person: Person | null): boolean {
  return isAdminPerson(person);
}

/** Only Technical Admins can grant the Admin role. Directors cannot grant Admin access. */
export function canGrantAdminRole(person: Person | null): boolean {
  return isAdminPerson(person);
}

/** Directors and Technical Admins have final creative sign-off authority */
export function canApproveFinalCreative(person: Person | null): boolean {
  return isAdminPerson(person) || isDirectorPerson(person);
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

export function normalizeSite(site: string | undefined | null): string {
  if (!site) return '';
  return site.trim().toLowerCase().replace(/[\-_]/g, ' ').replace(/\s+/g, ' ');
}

/**
 * Checks whether two site names or codes refer to the same site.
 * Supports site codes (CEB, CAR, SNC, URD, TOR, SMR) and aliases.
 */
export function isSiteMatch(siteA: string | undefined | null, siteB: string | undefined | null): boolean {
  const a = normalizeSite(siteA);
  const b = normalizeSite(siteB);
  if (!a || !b) return false;
  if (a === b) return true;

  const siteAliasGroups: string[][] = [
    ['ceb', 'cebu', 'cebu city'],
    ['car', 'carcar', 'carcar city'],
    ['snc', 'san carlos', 'san carlos city'],
    ['urd', 'urdaneta', 'urdaneta city'],
    ['tor', 'toronto'],
    ['smr', 'santa marta', 'samar']
  ];

  for (const group of siteAliasGroups) {
    const aInGroup = group.some((alias) => a === alias || a.includes(alias) || alias.includes(a));
    const bInGroup = group.some((alias) => b === alias || b.includes(alias) || alias.includes(b));
    if (aInGroup && bInGroup) return true;
  }

  return false;
}

/**
 * Determines if a task is intended for all sites across the organization.
 * If toSite specifies a distinct site (like "Carcar"), it is never universal.
 */
export function isUniversalTask(task: DirectionMessage): boolean {
  const site = normalizeSite(task.toSite);
  const isAllSitesLabel = site === 'all' || site === 'all sites' || site === 'global' || site === 'all locations' || site === '*';

  // If toSite points to a specific site, it is not universal
  if (site && !isAllSitesLabel) {
    return false;
  }

  return Boolean(task.toAll || isAllSitesLabel);
}

/**
 * Configures task visibility:
 * Engagement Officers only see tasks relevant to their specific site (or direct personal assignments).
 */
export function canPersonSeeTask(person: Person | null, task: DirectionMessage): boolean {
  if (!person || person.Active === false) return false;

  // Technical Admins and Directors have wide organizational oversight
  if (isAdminPerson(person) || isDirectorPerson(person)) {
    return true;
  }

  // Draft directions are only visible to editors/admins
  if (task.status === 'Draft') {
    return false;
  }

  // Direct personal assignment: If the task is targeted to this person by email
  if (task.toPerson && normalizeEmail(task.toPerson) === normalizeEmail(person.Email)) {
    return true;
  }

  // Engagement Officers: visibility is strictly restricted to tasks relevant to their specific site
  if (person.Role === 'Officer') {
    // If the task targets a specific site, it must match the officer's site
    if (task.toSite && !isUniversalTask(task)) {
      return isSiteMatch(task.toSite, person.Site);
    }
    // If the task is universal (company-wide / all sites)
    if (isUniversalTask(task)) {
      return true;
    }
    // Fallback: match by site
    return isSiteMatch(task.toSite, person.Site);
  }

  // Site Managers: see tasks for their site or universal tasks
  if (person.Role === 'Site Manager') {
    if (task.toSite && !isUniversalTask(task)) {
      return isSiteMatch(task.toSite, person.Site);
    }
    return isUniversalTask(task);
  }

  // Other roles (e.g. Creative Designer): see universal tasks or tasks for their site
  if (isUniversalTask(task)) return true;
  return isSiteMatch(task.toSite, person.Site);
}
