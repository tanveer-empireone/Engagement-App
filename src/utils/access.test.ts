import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectionMessage, Person } from '../types';
import {
  ADMIN_EMAIL,
  canApproveFinalCreative,
  canGrantAdminRole,
  canOpenAdminPanel,
  canSeeIntegrations,
  canUseCapture,
  clampRole,
  resolveSessionPerson,
  sanitizeDirectory,
  selectAppShell,
  canPersonSeeTask,
  isSiteMatch,
  isUniversalTask
} from './access';

const tanveer: Person = {
  Email: ADMIN_EMAIL,
  Name: 'Tanveer',
  Role: 'Admin',
  Site: 'Cebu City',
  Shift: 'Peak',
  Active: true
};

test('signed-out visitors stay on the sign-in gate', () => {
  assert.equal(selectAppShell({ authReady: false, hasGoogleUser: false, person: null }), 'loading');
  assert.equal(selectAppShell({ authReady: true, hasGoogleUser: false, person: null }), 'signin');
  assert.equal(selectAppShell({ authReady: true, hasGoogleUser: false, person: tanveer }), 'signin');
});

test('a Google account that is not the admin is an Officer and cannot open the admin panel', () => {
  const person = resolveSessionPerson(
    { email: 'officer@empireonecx.com', displayName: 'Pat Officer' },
    [tanveer]
  );
  assert.ok(person);
  assert.equal(person.Email, 'officer@empireonecx.com');
  assert.equal(person.Role, 'Officer');
  assert.equal(selectAppShell({ authReady: true, hasGoogleUser: true, person }), 'app');
  assert.equal(canOpenAdminPanel(person), false);
});

test('the admin email stays Admin even if a saved role says otherwise', () => {
  const person = resolveSessionPerson(
    { email: 'Tanveer@EmpireOneCX.com', displayName: 'Tanveer Singh' },
    [{ ...tanveer, Role: 'Officer' }]
  );
  assert.ok(person);
  assert.equal(person.Role, 'Admin');
  assert.equal(canOpenAdminPanel(person), true);
  assert.equal(selectAppShell({ authReady: true, hasGoogleUser: true, person }), 'app');
});

test('an admin can upgrade another Google account to Admin, and that role survives reload', () => {
  const saved: Person[] = sanitizeDirectory([
    tanveer,
    {
      Email: 'lead@empireonecx.com',
      Name: 'Lead',
      Role: 'Admin',
      Site: 'Toronto',
      Active: true
    }
  ]);
  const person = resolveSessionPerson({ email: 'lead@empireonecx.com', displayName: 'Lead' }, saved);
  assert.ok(person);
  assert.equal(person.Role, 'Admin');
  assert.equal(person.Site, 'Toronto');
  assert.equal(clampRole('lead@empireonecx.com', 'Admin'), 'Admin');
  assert.equal(canOpenAdminPanel(person), true);
  assert.equal(canSeeIntegrations(person), true);
  assert.notEqual(person.Email, ADMIN_EMAIL);
});

test('admins hide Capture until it is shown, and other roles never see Integrations or the admin panel', () => {
  const officer = resolveSessionPerson({ email: 'officer@empireonecx.com', displayName: 'Pat' }, []);
  assert.ok(officer);
  assert.equal(canUseCapture(officer, false), true);
  assert.equal(canSeeIntegrations(officer), false);
  assert.equal(canOpenAdminPanel(officer), false);
  assert.equal(canUseCapture(tanveer, false), false);
  assert.equal(canUseCapture(tanveer, true), true);
  assert.equal(canSeeIntegrations(tanveer), true);
});

test('an assigned non-admin role survives reload for that Google account', () => {
  const saved: Person[] = [
    {
      Email: 'sam@empireonecx.com',
      Name: 'Sam',
      Role: 'Site Manager',
      Site: 'Carcar',
      Shift: 'Day',
      Active: true
    }
  ];
  const person = resolveSessionPerson({ email: 'sam@empireonecx.com' }, saved);
  assert.ok(person);
  assert.equal(person.Role, 'Site Manager');
  assert.equal(person.Site, 'Carcar');
  assert.equal(canOpenAdminPanel(person), false);
});

test('a removed user stays out of the product until access is restored', () => {
  const person = resolveSessionPerson(
    { email: 'former@empireonecx.com', displayName: 'Former' },
    [
      {
        Email: 'former@empireonecx.com',
        Name: 'Former',
        Role: 'Officer',
        Site: 'Cebu City',
        Active: false
      }
    ]
  );
  assert.ok(person);
  assert.equal(selectAppShell({ authReady: true, hasGoogleUser: true, person }), 'blocked');
  assert.equal(canOpenAdminPanel(person), false);
});

test('director has scoped management access but cannot see integrations or grant admin role', () => {
  const director: Person = {
    Email: 'director@empireonecx.com',
    Name: 'Sarah Director',
    Role: 'Director',
    Site: 'Toronto',
    Shift: 'Day',
    Active: true
  };
  assert.equal(canOpenAdminPanel(director), true);
  assert.equal(canSeeIntegrations(director), false);
  assert.equal(canGrantAdminRole(director), false);
  assert.equal(canGrantAdminRole(tanveer), true);
  assert.equal(canApproveFinalCreative(director), true);
  assert.equal(canApproveFinalCreative(tanveer), true);
});

test('legacy Engagement Lead role is migrated to Director', () => {
  assert.equal(clampRole('sarah@empireonecx.com', 'Engagement Lead'), 'Director');
});

test('isSiteMatch correctly compares site names, codes, and aliases', () => {
  assert.equal(isSiteMatch('Cebu City', 'Cebu City'), true);
  assert.equal(isSiteMatch('CEB', 'Cebu City'), true);
  assert.equal(isSiteMatch('Cebu', 'Cebu City'), true);
  assert.equal(isSiteMatch('CAR', 'Carcar'), true);
  assert.equal(isSiteMatch('SNC', 'San Carlos'), true);
  assert.equal(isSiteMatch('TOR', 'Toronto'), true);

  // Mismatches
  assert.equal(isSiteMatch('Carcar', 'Cebu City'), false);
  assert.equal(isSiteMatch('CAR', 'CEB'), false);
  assert.equal(isSiteMatch('San Carlos', 'Cebu City'), false);
  assert.equal(isSiteMatch('Toronto', 'Carcar'), false);
  assert.equal(isSiteMatch('', 'Cebu City'), false);
});

test('isUniversalTask recognizes global tasks and rejects specific site tasks', () => {
  const universalTask: DirectionMessage = {
    feedbackId: 'T1',
    title: 'Company Notice',
    message: 'Welcome everyone',
    type: "Today's tasks",
    source: 'test',
    fromPerson: 'admin',
    sentAt: '2026-10-31',
    toAll: true,
    toSite: 'All Sites',
    status: 'Published',
    acknowledged: false
  };
  assert.equal(isUniversalTask(universalTask), true);

  const siteSpecificTask: DirectionMessage = {
    feedbackId: 'T2',
    title: 'Carcar Floor Check',
    message: 'Verify line 2',
    type: "Today's tasks",
    source: 'test',
    fromPerson: 'admin',
    sentAt: '2026-10-31',
    toAll: true, // Notice even if toAll is accidentally set, toSite: 'Carcar' makes it non-universal
    toSite: 'Carcar',
    status: 'Published',
    acknowledged: false
  };
  assert.equal(isUniversalTask(siteSpecificTask), false);
});

test('engagement officers only see tasks relevant to their specific site', () => {
  const cebuOfficer: Person = {
    Email: 'cebu.officer@empireonecx.com',
    Name: 'Cebu Officer',
    Role: 'Officer',
    Site: 'Cebu City',
    Active: true
  };

  const carcarOfficer: Person = {
    Email: 'carcar.officer@empireonecx.com',
    Name: 'Carcar Officer',
    Role: 'Officer',
    Site: 'Carcar',
    Active: true
  };

  const cebuTask: DirectionMessage = {
    feedbackId: 'T-CEB',
    title: 'Cebu Daily Huddle',
    message: 'Huddle at 9am',
    type: "Today's tasks",
    source: 'test',
    fromPerson: 'admin',
    sentAt: '2026-10-31',
    toAll: false,
    toSite: 'Cebu City',
    status: 'Published',
    acknowledged: false
  };

  const carcarTask: DirectionMessage = {
    feedbackId: 'T-CAR',
    title: 'Carcar Event Coverage',
    message: 'Capture town hall',
    type: "Today's tasks",
    source: 'test',
    fromPerson: 'admin',
    sentAt: '2026-10-31',
    toAll: false,
    toSite: 'Carcar',
    status: 'Published',
    acknowledged: false
  };

  const allSitesTask: DirectionMessage = {
    feedbackId: 'T-ALL',
    title: 'All-Hands Engagement Week',
    message: 'Post weekly theme pictures',
    type: 'Theme to communicate',
    source: 'test',
    fromPerson: 'admin',
    sentAt: '2026-10-31',
    toAll: true,
    toSite: 'All Sites',
    status: 'Published',
    acknowledged: false
  };

  const directTaskForCebuOfficer: DirectionMessage = {
    feedbackId: 'T-DIRECT',
    title: 'Special Spot Check',
    message: 'Check lobby',
    type: "Today's tasks",
    source: 'test',
    fromPerson: 'admin',
    sentAt: '2026-10-31',
    toAll: false,
    toPerson: 'cebu.officer@empireonecx.com',
    status: 'Published',
    acknowledged: false
  };

  const draftTask: DirectionMessage = {
    ...cebuTask,
    feedbackId: 'T-DRAFT',
    status: 'Draft'
  };

  // Cebu Officer checks
  assert.equal(canPersonSeeTask(cebuOfficer, cebuTask), true, 'Cebu officer sees Cebu task');
  assert.equal(canPersonSeeTask(cebuOfficer, carcarTask), false, 'Cebu officer CANNOT see Carcar task');
  assert.equal(canPersonSeeTask(cebuOfficer, allSitesTask), true, 'Cebu officer sees all-sites task');
  assert.equal(canPersonSeeTask(cebuOfficer, directTaskForCebuOfficer), true, 'Cebu officer sees direct personal task');
  assert.equal(canPersonSeeTask(cebuOfficer, draftTask), false, 'Officer cannot see draft task');

  // Carcar Officer checks
  assert.equal(canPersonSeeTask(carcarOfficer, carcarTask), true, 'Carcar officer sees Carcar task');
  assert.equal(canPersonSeeTask(carcarOfficer, cebuTask), false, 'Carcar officer CANNOT see Cebu task');
  assert.equal(canPersonSeeTask(carcarOfficer, directTaskForCebuOfficer), false, 'Carcar officer cannot see task addressed to someone else');

  // Admin checks: Admin can see all tasks regardless of site, including drafts
  assert.equal(canPersonSeeTask(tanveer, cebuTask), true);
  assert.equal(canPersonSeeTask(tanveer, carcarTask), true);
  assert.equal(canPersonSeeTask(tanveer, draftTask), true);
});

