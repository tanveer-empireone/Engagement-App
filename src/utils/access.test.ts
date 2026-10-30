import test from 'node:test';
import assert from 'node:assert/strict';
import { Person } from '../types';
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
  selectAppShell
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

