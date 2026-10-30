import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { subscribeServerState, saveServerSettings } from './serverSync';
import { resolveSessionPerson, canOpenAdminPanel, selectAppShell } from './access';
import type { Person } from '../types';

test('open sessions pick up role changes and revocation on the next poll', async (t) => {
  let roster: Person[] = [{ Email: 'user@example.com', Name: 'User', Role: 'Director', Site: 'Cebu City', Active: true }];
  let nextPoll: (() => void) | undefined;
  t.mock.method(globalThis, 'setTimeout', (fn: () => void, delay: number) => {
    assert.equal(delay, 5000);
    nextPoll = fn;
    return 1;
  });
  t.mock.method(globalThis, 'clearTimeout', () => {});
  t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    assert.equal(options.cache, 'no-store');
    return Response.json({ people: roster });
  });
  let person: Person | null = null;
  const stop = subscribeServerState<{people: Person[]}>(data => {
    person = resolveSessionPerson({ email: 'user@example.com' }, data.people);
  }, error => assert.fail(String(error)), new EventTarget(), new EventTarget());
  t.after(stop);
  await setImmediate();
  assert.equal(canOpenAdminPanel(person), true);
  roster = [{ ...roster[0], Role: 'Officer' }];
  nextPoll!();
  await setImmediate();
  assert.equal(canOpenAdminPanel(person), false);
  roster = [{ ...roster[0], Active: false }];
  nextPoll!();
  await setImmediate();
  assert.equal(selectAppShell({ authReady: true, hasGoogleUser: true, person }), 'blocked');
});

test('focus and visibility changes refresh settings; cleanup stops requests', async (t) => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return Response.json({}); });
  const events = new EventTarget();
  const visibility = new EventTarget();
  const stop = subscribeServerState(() => {}, error => assert.fail(String(error)), events, visibility);
  t.after(stop);
  await setImmediate();
  events.dispatchEvent(new Event('focus'));
  await setImmediate();
  visibility.dispatchEvent(new Event('visibilitychange'));
  await setImmediate();
  assert.equal(requests, 3);
  stop();
  events.dispatchEvent(new Event('focus'));
  assert.equal(requests, 3);
});

test('a superseded refresh cannot restore stale permissions', async (t) => {
  const pending: ((response: Response) => void)[] = [];
  t.mock.method(globalThis, 'fetch', () => new Promise<Response>(resolve => pending.push(resolve)));
  const events = new EventTarget();
  const states: unknown[] = [];
  const stop = subscribeServerState(data => states.push(data), error => assert.fail(String(error)), events, new EventTarget());
  t.after(stop);
  events.dispatchEvent(new Event('app-settings-saved'));
  pending[1](Response.json({ role: 'Officer' }));
  await setImmediate();
  pending[0](Response.json({ role: 'Director' }));
  await setImmediate();
  assert.deepEqual(states, [{ role: 'Officer' }]);
});

test('failed saves reject instead of reporting success', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: false, message: 'User not found' }, { status: 404 }));
  await assert.rejects(saveServerSettings('/api/admin/users/missing', 'PUT', { Role: 'Officer' }), /User not found/);
});

test('a failed refresh retries and recovers', async (t) => {
  let nextPoll: (() => void) | undefined;
  let attempts = 0;
  const errors: unknown[] = [];
  const states: unknown[] = [];
  t.mock.method(globalThis, 'setTimeout', (fn: () => void) => { nextPoll = fn; return 1; });
  t.mock.method(globalThis, 'clearTimeout', () => {});
  t.mock.method(globalThis, 'fetch', async () => ++attempts === 1 ? new Response('', { status: 503 }) : Response.json({ recovered: true }));
  const stop = subscribeServerState(data => states.push(data), error => errors.push(error), new EventTarget(), new EventTarget());
  t.after(stop);
  await setImmediate();
  assert.equal(errors.length, 1);
  nextPoll!();
  await setImmediate();
  assert.deepEqual(states, [{ recovered: true }]);
});
