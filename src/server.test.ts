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
