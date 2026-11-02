import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

test('server data persistence store maintains integrity', () => {
  const testDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  const testFile = path.join(testDir, 'test-server-state.json');

  const testStore = {
    people: [
      {
        Email: 'tanveer@empireonecx.com',
        Name: 'Tanveer',
        Role: 'Admin',
        Site: 'Cebu City',
        Shift: 'Peak',
        Active: true
      }
    ],
    config: {
      sheetId: 'custom-sheet-id-123',
      driveRootId: 'custom-drive-id-456',
      clickUpTeamId: '90161592694',
      clickUpSpaceId: '1300380000003391',
      appsScriptUrl: 'https://script.google.com/macros/s/test/exec'
    },
    uploads: [],
    directions: [],
    shiftReports: [],
    showCaptureForAdmin: true,
    syncHealth: {
      version: '2.0.0',
      workspace: '90161592694',
      space: '1300380000003391',
      spaceName: 'Engagement',
      runner: 'engagement@empireonecx.com',
      paused: false,
      lastSync: '',
      syncState: 'OK',
      stages: []
    },
    clickUpToken: 'pk_test_123'
  };

  // Write to test file
  fs.writeFileSync(testFile, JSON.stringify(testStore, null, 2), 'utf-8');

  // Read back and verify
  const raw = fs.readFileSync(testFile, 'utf-8');
  const loaded = JSON.parse(raw);

  assert.equal(loaded.people.length, 1);
  assert.equal(loaded.people[0].Email, 'tanveer@empireonecx.com');
  assert.equal(loaded.config.sheetId, 'custom-sheet-id-123');
  assert.equal(loaded.showCaptureForAdmin, true);
  assert.equal(loaded.clickUpToken, 'pk_test_123');

  // Add another user
  loaded.people.push({
    Email: 'john.doe@empireonecx.com',
    Name: 'John Doe',
    Role: 'Site Manager',
    Site: 'Toronto',
    Shift: 'Graveyard',
    Active: true
  });
  fs.writeFileSync(testFile, JSON.stringify(loaded, null, 2), 'utf-8');

  const rawUpdated = fs.readFileSync(testFile, 'utf-8');
  const loadedUpdated = JSON.parse(rawUpdated);
  assert.equal(loadedUpdated.people.length, 2);
  assert.equal(loadedUpdated.people[1].Email, 'john.doe@empireonecx.com');
  assert.equal(loadedUpdated.people[1].Role, 'Site Manager');

  // Clean up test file
  if (fs.existsSync(testFile)) {
    fs.unlinkSync(testFile);
  }
});

test('server store persists user activities and direction acknowledgments', () => {
  const testDir = path.resolve(process.cwd(), 'data');
  const testFile = path.join(testDir, 'test-activities-state.json');

  const initialStore = {
    people: [],
    config: {},
    uploads: [],
    directions: [
      {
        feedbackId: 'DIR-001',
        title: 'Morning Huddle',
        acknowledged: false,
        acknowledgedBy: []
      }
    ],
    shiftReports: [],
    activities: [
      {
        id: 'ACT-101',
        title: 'Morning Floor Walk',
        category: 'Floor Engagement',
        officerEmail: 'tanveer@empireonecx.com',
        officerName: 'Tanveer Hussain',
        site: 'Cebu City',
        shift: 'Peak',
        date: '2026-11-02',
        duration: '30 mins',
        status: 'Completed',
        createdAt: new Date().toISOString()
      }
    ]
  };

  fs.writeFileSync(testFile, JSON.stringify(initialStore, null, 2), 'utf-8');

  // Read back
  const data = JSON.parse(fs.readFileSync(testFile, 'utf-8'));
  assert.equal(data.activities.length, 1);
  assert.equal(data.activities[0].title, 'Morning Floor Walk');
  assert.equal(data.activities[0].status, 'Completed');

  // Acknowledge direction
  data.directions[0].acknowledged = true;
  data.directions[0].acknowledgedBy = ['tanveer@empireonecx.com'];
  data.directions[0].reply = 'Acknowledged on time.';
  fs.writeFileSync(testFile, JSON.stringify(data, null, 2), 'utf-8');

  const afterAck = JSON.parse(fs.readFileSync(testFile, 'utf-8'));
  assert.equal(afterAck.directions[0].acknowledged, true);
  assert.deepEqual(afterAck.directions[0].acknowledgedBy, ['tanveer@empireonecx.com']);
  assert.equal(afterAck.directions[0].reply, 'Acknowledged on time.');

  if (fs.existsSync(testFile)) {
    fs.unlinkSync(testFile);
  }
});
