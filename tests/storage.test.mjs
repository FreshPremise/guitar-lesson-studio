import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultState,
  validateState,
  parseBackup,
  serializeBackup,
  mergeBackup,
  MAX_SAVED,
  MAX_TAB,
} from '../src/storage.js';
const card = (id = 'test') => ({
  id,
  title: 'C shape',
  note: 'Sounds D at capo 2',
  shape: ['x', 3, 2, 0, 1, 0],
  capo: 2,
  preferFlats: false,
  createdAt: '2026-09-06T00:00:00.000Z',
});
const populated = () => ({
  ...defaultState(),
  shape: ['x', 3, 2, 0, 1, 0],
  capo: 2,
  saved: [card()],
  tab: [{ shape: ['x', 3, 2, 0, 1, 0], capo: 2 }],
  mapVisible: true,
  flipped: true,
  tempo: 120,
});
test('backup round trip preserves every current, saved, and sequence field', () => {
  const state = validateState(populated());
  state.tab[0].beats = 4;
  state.tab[0].strum = 'up';
  state.repeat = true;
  assert.deepEqual(parseBackup(serializeBackup(state)), state);
});
test('legacy v1 backups gain optional preferences without changing their music or notes', () => {
  const old = populated();
  delete old.mapVisible;
  delete old.flipped;
  delete old.tempo;
  delete old.dataVersion;
  const restored = parseBackup(JSON.stringify({ schemaVersion: 1, data: old }));
  assert.deepEqual(
    restored.saved,
    old.saved.map((s) => ({ ...s, tuning: 'standard' })),
  );
  assert.deepEqual(restored.tab[0], { ...old.tab[0], tuning: 'standard', beats: 1, strum: 'down' });
  assert.equal(restored.tempo, 90);
  assert.equal(restored.flipped, true);
});
test('missing data, bad versions, malformed records and excessive data reject whole payloads', () => {
  for (const raw of [
    '{}',
    'null',
    '{"schemaVersion":2,"data":{}}',
    '{"schemaVersion":1,"data":null}',
    'not json',
  ])
    assert.throws(() => parseBackup(raw));
  for (const mutate of [
    (s) => (s.saved[0].shape[0] = 99),
    (s) => (s.saved[0].note = 'x'.repeat(501)),
    (s) => s.saved.push({ ...s.saved[0] }),
    (s) => (s.tab[0].capo = -1),
    (s) => (s.tab[0].beats = 3),
    (s) => (s.tab[0].strum = 'sideways'),
    (s) => (s.dataVersion = 6),
    (s) => (s.sound = 'remote'),
    (s) => (s.repeat = 'true'),
    (s) => (s.tempo = 0),
    (s) => (s.preferFlats = 'false'),
    (s) => (s.saved = null),
  ]) {
    const state = populated();
    mutate(state);
    assert.throws(() => validateState(state));
  }
  assert.throws(() => parseBackup(' '.repeat(1_000_001)));
});
test('merge preserves current selection and all existing entries and is idempotent for the same backup', () => {
  const current = populated();
  const identical = mergeBackup(current, parseBackup(serializeBackup(current)));
  assert.deepEqual(identical, validateState(current));
  const incoming = populated();
  incoming.saved[0].note = 'different note with same ID';
  incoming.tab = [{ shape: [0, 2, 2, 0, 0, 0], capo: 0 }];
  const merged = mergeBackup(current, incoming);
  assert.equal(merged.saved.length, 2);
  assert.notEqual(merged.saved[0].id, merged.saved[1].id);
  assert.equal(merged.saved[0].note, current.saved[0].note);
  assert.equal(merged.saved[1].note, incoming.saved[0].note);
  assert.equal(merged.tab.length, 2);
  assert.deepEqual(merged.shape, current.shape);
  assert.equal(current.saved.length, 1);
});
test('limits reject overflow without truncating notebook or sequence', () => {
  const state = populated();
  state.saved = Array.from({ length: MAX_SAVED }, (_, i) => card(String(i)));
  assert.equal(validateState(state).saved.length, MAX_SAVED);
  assert.throws(() => mergeBackup(state, { ...defaultState(), saved: [card('overflow')] }));
  assert.equal(state.saved.length, MAX_SAVED);
  state.tab = Array.from({ length: MAX_TAB }, () => ({ shape: [0, 2, 2, 0, 0, 0], capo: 0 }));
  assert.equal(validateState(state).tab.length, MAX_TAB);
  assert.throws(() => mergeBackup(state, populated()));
  assert.equal(state.tab.length, MAX_TAB);
});
test('fret range and practice speed migrate safely and round-trip without changing musical data', () => {
  const old = defaultState();
  delete old.fretRange;
  delete old.practiceRamp;
  const migrated = validateState(old);
  assert.equal(migrated.fretRange, 'all');
  assert.equal(migrated.practiceRamp.enabled, false);
  const next = {
    ...migrated,
    fretRange: '4-8',
    practiceRamp: { enabled: true, every: 2, increment: 10, target: 150 },
  };
  assert.deepEqual(parseBackup(serializeBackup(next)), next);
  for (const fretRange of ['-1-5', '0-100', {}]) assert.throws(() => validateState({ ...next, fretRange }));
  for (const patch of [{ every: 0 }, { increment: 100 }, { target: 180.5 }, { enabled: 1 }])
    assert.throws(() => validateState({ ...next, practiceRamp: { ...next.practiceRamp, ...patch } }));
  assert.deepEqual(next.shape, old.shape);
});
