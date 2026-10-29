import test from 'node:test';
import assert from 'node:assert/strict';
import { stripSecrets } from './server/secrets';

test('public responses drop token fields and pk_ values', () => {
  const cleaned = stripSecrets({
    people: [{ Email: 'a@empireonecx.com' }],
    clickUpToken: 'pk_test_123',
    note: 'pk_in_a_note'
  });
  assert.equal('clickUpToken' in cleaned, false);
  assert.equal(JSON.stringify(cleaned).includes('pk_'), false);
});
