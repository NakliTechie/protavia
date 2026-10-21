// The agent face.
//
// The point of the manifest is that the page's buttons and anything driving the page from outside
// run the same code. These tests cover the part that keeps that true: the binding refuses a
// mismatch between what is declared and what is implemented, and it refuses to stand in for the
// person on an act that is theirs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS, createRegistry } from '../app/commands.js';

/** A registry with every callable command answering with its own name. */
function registry(overrides = {}) {
  const implementations = {};
  for (const c of COMMANDS) if (!c.personOnly) implementations[c.id] = () => c.id;
  return createRegistry({ ...implementations, ...overrides });
}

test('every declared command has a summary and a parameter list', () => {
  assert.ok(COMMANDS.length > 0);
  for (const c of COMMANDS) {
    assert.ok(c.summary && c.summary.endsWith('.'), `${c.id} needs a summary sentence`);
    assert.ok(Array.isArray(c.params), `${c.id} needs a parameter list`);
    for (const p of c.params) {
      assert.ok(p.name && p.type, `${c.id}: every parameter needs a name and a type`);
    }
  }
});

test('no command is declared twice', () => {
  const ids = COMMANDS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('a command declared person-only says what makes it the person’s', () => {
  const personOnly = COMMANDS.filter((c) => c.personOnly);
  assert.ok(personOnly.length > 0, 'at least one act is the person’s');
  for (const c of personOnly) {
    assert.ok(c.why && c.why.length > 20, `${c.id} must say why`);
  }
});

test('a declared command with no implementation stops the binding', () => {
  const implementations = {};
  for (const c of COMMANDS) if (!c.personOnly && c.id !== 'redesign') implementations[c.id] = () => null;
  assert.throws(() => createRegistry(implementations), /"redesign" is declared but not implemented/);
});

test('an implementation with no declaration stops the binding', () => {
  const implementations = {};
  for (const c of COMMANDS) if (!c.personOnly) implementations[c.id] = () => null;
  implementations['secret-door'] = () => null;
  assert.throws(() => createRegistry(implementations), /"secret-door" is implemented but not declared/);
});

test('a person-only command must not be implemented', () => {
  const implementations = {};
  for (const c of COMMANDS) if (!c.personOnly) implementations[c.id] = () => null;
  implementations['open-file'] = () => null;
  assert.throws(() => createRegistry(implementations), /person-only and must not be implemented/);
});

test('calling a person-only command is refused, with the reason', async () => {
  await assert.rejects(() => registry().run('open-file'), /is the person’s to do/);
});

test('calling a command that does not exist points at the list', async () => {
  await assert.rejects(() => registry().run('delete-everything'), /protavia\.commands\(\)/);
});

test('a missing required argument is refused before anything runs', async () => {
  let ran = false;
  const r = registry({ 'open-target': () => { ran = true; } });
  await assert.rejects(() => r.run('open-target'), /needs id \(string\)/);
  assert.equal(ran, false, 'the implementation must not have been called');
});

test('an optional argument may be left out', async () => {
  const r = registry({ 'redesign': (args) => args });
  assert.deepEqual(await r.run('redesign'), {});
});

test('arguments reach the implementation unchanged', async () => {
  const r = registry({ 'rank': (args) => args });
  assert.deepEqual(await r.run('rank', { column: 'score', descending: true }),
    { column: 'score', descending: true });
});

test('the published list marks the person’s acts and gives their reason', () => {
  const described = registry().commands();
  assert.equal(described.length, COMMANDS.length);

  const file = described.find((c) => c.id === 'open-file');
  assert.equal(file.personOnly, true);
  assert.ok(file.why);

  const open = described.find((c) => c.id === 'open-target');
  assert.equal(open.personOnly, false);
  assert.equal(open.why, undefined, 'a callable command needs no excuse');
});

test('the list covers the page’s whole job: a target, a design, and an order', () => {
  const ids = COMMANDS.map((c) => c.id);
  for (const needed of ['open-target', 'search', 'set-chain', 'redesign', 'rank', 'designs']) {
    assert.ok(ids.includes(needed), `${needed} should be declared`);
  }
});
