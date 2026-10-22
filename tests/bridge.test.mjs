// Finding the compute bridge, and deciding there isn't one.
//
// Most people will never have a bridge: the hosted site has none. So the interesting cases here
// are the negative ones, and the rule that the page stays useful when the answer is no.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.location = { hostname: '127.0.0.1' };
globalThis.fetch = async () => { throw new Error('no fetch set for this test'); };
const bridge = await import('../app/bridge.js');

beforeEach(() => bridge.forget());

const health = (over = {}) => ({
  bridge: 'protavia',
  version: '0.1.0',
  host: { name: 'test-machine', platform: 'macOS 25.5.0', machine: 'arm64', cpus: 14 },
  engines: [
    { id: 'freebindcraft', label: 'FreeBindCraft', installed: true, path: '/x', runsHere: true },
    { id: 'bindcraft2', label: 'BindCraft2', installed: false, runsHere: false, why: 'Will not run on macOS.' },
  ],
  ...over,
});

const answers = (body, status = 200) => {
  globalThis.fetch = async () => ({ ok: status === 200, status, json: async () => body });
};

test('a bridge on this origin is found, with its host and engines', async () => {
  globalThis.location = { hostname: '127.0.0.1' };
  answers(health());
  const found = await bridge.detect();
  assert.equal(found.present, true);
  assert.equal(found.host.name, 'test-machine');
  assert.equal(found.engines.length, 2);
});

test('the hosted site is not asked at all', async () => {
  globalThis.location = { hostname: 'protavia.naklitechie.com' };
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error('should not be called'); };

  const found = await bridge.detect();
  assert.equal(found.present, false);
  assert.equal(called, false, 'a page that cannot have a bridge should not ask for one');
  assert.match(found.why, /hosted site/);
});

test('localhost and the IPv6 loopback count as local too', async () => {
  for (const hostname of ['localhost', '[::1]', '::1']) {
    bridge.forget();
    globalThis.location = { hostname };
    answers(health());
    assert.equal((await bridge.detect()).present, true, `${hostname} should be local`);
  }
});

test('something else serving this page is not a bridge', async () => {
  globalThis.location = { hostname: '127.0.0.1' };
  answers({ some: 'other server' });
  const found = await bridge.detect();
  assert.equal(found.present, false);
  assert.match(found.why, /something else is serving/);
});

test('an error answer is a plain no, not a thrown error', async () => {
  globalThis.location = { hostname: '127.0.0.1' };
  answers({}, 500);
  const found = await bridge.detect();
  assert.equal(found.present, false);
  assert.match(found.why, /answered 500/);
});

test('a bridge that never answers is a plain no', async () => {
  globalThis.location = { hostname: '127.0.0.1' };
  globalThis.fetch = async (_url, { signal }) => new Promise((_res, rej) => {
    signal.addEventListener('abort', () => {
      const e = new Error('aborted'); e.name = 'AbortError'; rej(e);
    });
  });
  const found = await bridge.detect();
  assert.equal(found.present, false);
  assert.match(found.why, /did not answer in time/);
});

test('the answer is remembered, and forgetting asks again', async () => {
  globalThis.location = { hostname: '127.0.0.1' };
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: true, status: 200, json: async () => health() }; };

  await bridge.detect();
  await bridge.detect();
  assert.equal(calls, 1, 'the second call should use what the first found');
  assert.equal(bridge.current().present, true);

  bridge.forget();
  await bridge.detect();
  assert.equal(calls, 2);
});

test('the host line names the machine a run would happen on', async () => {
  globalThis.location = { hostname: '127.0.0.1' };
  answers(health());
  await bridge.detect();
  assert.equal(bridge.hostLine(), 'test-machine · macOS 25.5.0 arm64, 14 cores');
});

test('there is no host line when there is no bridge', async () => {
  globalThis.location = { hostname: 'protavia.naklitechie.com' };
  await bridge.detect();
  assert.equal(bridge.hostLine(), null);
});

test('an engine this machine cannot run is left out, installed ones come first', async () => {
  globalThis.location = { hostname: '127.0.0.1' };
  answers(health({
    engines: [
      { id: 'a', label: 'Absent', installed: false, runsHere: true },
      { id: 'b', label: 'Elsewhere', installed: false, runsHere: false },
      { id: 'c', label: 'Here', installed: true, runsHere: true },
    ],
  }));
  await bridge.detect();
  assert.deepEqual(bridge.usableEngines().map((e) => e.label), ['Here', 'Absent']);
});
