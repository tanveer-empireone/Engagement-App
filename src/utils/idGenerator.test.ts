import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatYmd,
  formatYmdClean,
  generateUploadId,
  buildE1FileName,
  buildFolderPath,
  calculateTopPickRoom,
  reverseGeocodeApprox
} from './idGenerator';

test('formatYmd and formatYmdClean format dates properly', () => {
  const d = new Date(2026, 9, 27); // Oct 27, 2026 (month is 0-indexed)
  assert.equal(formatYmd(d), '2026-10-27');
  assert.equal(formatYmdClean(d), '20261027');
});

test('generateUploadId increments sequential numbers correctly with zero-padding', () => {
  const prefix = 'CEB_20261027_REC_';
  const existing = ['CEB_20261027_REC_01', 'CEB_20261027_REC_02'];
  assert.equal(generateUploadId(prefix, existing), 'CEB_20261027_REC_03');

  // Should start at 01 if no prior IDs exist
  assert.equal(generateUploadId(prefix, []), 'CEB_20261027_REC_01');

  // Handles double digit correctly
  const listTen = Array.from({ length: 9 }, (_, i) => `CEB_20261027_REC_${String(i + 1).padStart(2, '0')}`);
  assert.equal(generateUploadId(prefix, listTen), 'CEB_20261027_REC_10');
});

test('buildE1FileName builds exact naming pattern', () => {
  const id = 'CAR_20261027_ENG_05';
  assert.equal(buildE1FileName(id, 'Photo', true, 'jpg'), 'CAR_20261027_ENG_05.Photo.group.jpg');
  assert.equal(buildE1FileName(id, 'Video', false, 'mp4'), 'CAR_20261027_ENG_05.Video.single.mp4');
});

test('buildFolderPath constructs correct folder hierarchy for Daily and Event modes', () => {
  const daily = buildFolderPath('E1CX Experience Cebu', '2026-10-27', 'Peak', 'Daily', '', 'CEB_01.jpg');
  assert.equal(daily, 'E1CX Experience Cebu/2026-10-27/Peak/CEB_01.jpg');

  const event = buildFolderPath('E1CX Experience Cebu', '2026-10-27', 'Peak', 'Event', 'Town Hall 2026', 'CEB_02.jpg');
  assert.equal(event, 'E1CX Experience Cebu/Events/2026-10-27 Town Hall 2026/CEB_02.jpg');
});

test('calculateTopPickRoom calculates correct remaining picks per limit', () => {
  const mockUploads = [
    {
      officer: 'maria@empireonecx.com',
      topPick: true,
      site: 'Cebu City',
      shiftDate: '2026-10-27',
      mode: 'Daily',
      shift: 'Peak'
    },
    {
      officer: 'maria@empireonecx.com',
      topPick: true,
      site: 'Cebu City',
      shiftDate: '2026-10-27',
      mode: 'Daily',
      shift: 'Peak'
    },
    {
      officer: 'maria@empireonecx.com',
      topPick: false, // non top pick should not count
      site: 'Cebu City',
      shiftDate: '2026-10-27',
      mode: 'Daily',
      shift: 'Peak'
    }
  ];

  const roomDaily = calculateTopPickRoom(
    mockUploads,
    'maria@empireonecx.com',
    'Cebu City',
    'Peak',
    'Daily',
    '',
    '2026-10-27'
  );

  assert.equal(roomDaily.limit, 5);
  assert.equal(roomDaily.used, 2);
  assert.equal(roomDaily.left, 3);

  // Event limit test (limit is 10)
  const roomEvent = calculateTopPickRoom(
    [],
    'maria@empireonecx.com',
    'Cebu City',
    'Peak',
    'Event',
    'Halloween Party',
    '2026-10-27'
  );
  assert.equal(roomEvent.limit, 10);
  assert.equal(roomEvent.left, 10);
});

test('reverseGeocodeApprox creates valid Google Maps link and identifies site proximity', () => {
  const cebuCoords = { lat: 10.3157, lng: 123.8854 };
  const geo = reverseGeocodeApprox(cebuCoords.lat, cebuCoords.lng);
  assert.ok(geo.mapLink.includes('https://www.google.com/maps?q=10.315700,123.885400'));
  assert.ok(geo.placeName.includes('Cebu City'));
});
