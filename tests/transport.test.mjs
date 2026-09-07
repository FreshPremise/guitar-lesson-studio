import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTransport } from '../src/transport.js';
function harness() {
  let time = 0,
    id = 0;
  const pending = new Map(),
    chords = [],
    clicks = [],
    steps = [],
    tempos = [];
  let ended = 0;
  const t = createTransport({
    clock: () => time,
    chord: (e, start, duration, hit) => chords.push({ e, start, duration, hit }),
    click: (t, a) => clicks.push([t, a]),
    onStep: (i, c) => steps.push([i, c]),
    onTempo: (tempo, pass) => tempos.push([tempo, pass, time]),
    onEnd: () => ended++,
    setTimer: (fn) => {
      const n = ++id;
      pending.set(n, fn);
      assert.equal(pending.size, 1);
      return n;
    },
    clearTimer: (n) => pending.delete(n),
  });
  return {
    t,
    chords,
    clicks,
    steps,
    tempos,
    get ended() {
      return ended;
    },
    pending,
    advance(seconds) {
      const end = time + seconds;
      while (time < end) {
        time += 0.025;
        const tasks = [...pending.values()];
        pending.clear();
        tasks.forEach((fn) => fn());
      }
    },
  };
}
test('count-in, durations and repeat use one timer with exact loop boundaries', () => {
  const h = harness();
  h.t.start([{ beats: 1 }, { beats: 2 }, { beats: 4 }], {
    tempo: 120,
    countIn: true,
    metronome: true,
    repeat: true,
  });
  h.advance(10);
  assert.equal(h.clicks[0][0], 0.08);
  assert.equal(h.chords[0].start, 2.08);
  assert.equal(h.chords[1].start, 2.58);
  assert.equal(h.chords[2].duration, 2);
  assert.equal(h.chords[3].start, 5.58);
  h.t.stop();
  assert.equal(h.pending.size, 0);
  const n = h.chords.length;
  h.advance(5);
  assert.equal(h.chords.length, n);
});

test('practice tempo changes only after complete passes, caps at target and resets on restart', () => {
  const h = harness();
  const options = {
    tempo: 60,
    repeat: true,
    countIn: true,
    ramp: { enabled: true, increment: 10, every: 2, target: 75 },
  };
  h.t.start([{ beats: 1 }, { beats: 2 }], options);
  assert.deepEqual(h.tempos, [], 'UI must wait for audible start');
  h.advance(23);
  assert.deepEqual(
    h.tempos.slice(0, 6).map((t) => t.slice(0, 2)),
    [
      [60, 1],
      [60, 2],
      [70, 3],
      [70, 4],
      [75, 5],
      [75, 6],
    ],
  );
  assert.equal(h.chords[0].start, 4.08, 'count in once');
  const beats = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2];
  const tempos = [60, 60, 60, 60, 70, 70, 70, 70, 75, 75];
  for (let i = 0; i < beats.length; i++) {
    assert.ok(Math.abs(h.chords[i + 1].start - h.chords[i].start - (beats[i] * 60) / tempos[i]) < 1e-9);
  }
  h.t.stop();
  h.tempos.length = 0;
  h.t.start([{ beats: 1 }], { ...options, countIn: false });
  h.advance(0.2);
  assert.deepEqual(h.tempos[0].slice(0, 2), [60, 1]);
  h.t.stop();
});

test('practice ramp never lowers tempo, ignores finite runs, and rejects malformed settings', () => {
  const h = harness(),
    ramp = { enabled: true, increment: 5, every: 1, target: 90 };
  h.t.start([{ beats: 1 }], { tempo: 120, repeat: true, ramp });
  h.advance(2);
  assert.ok(h.tempos.every((t) => t[0] === 120));
  h.t.start([{ beats: 1 }], { tempo: 60, repeat: false, ramp });
  h.advance(2);
  assert.equal(h.t.running, false);
  const count = h.chords.length;
  for (const change of [{ every: 0 }, { increment: -1 }, { target: 181 }, { enabled: 'yes' }])
    assert.throws(() => h.t.start([{ beats: 1 }], { ramp: { ...ramp, ...change } }), /practice speed/);
  assert.equal(h.chords.length, count);
  assert.equal(h.pending.size, 0);
});
test('finite sequence ends after its last beat and cancels its timer', () => {
  const h = harness();
  h.t.start([{ beats: 4 }], { tempo: 120 });
  h.advance(2);
  assert.equal(h.ended, 0);
  h.advance(0.2);
  assert.equal(h.ended, 1);
  assert.equal(h.pending.size, 0);
  assert.equal(h.t.running, false);
});
test('invalid tempo and duration reject before scheduling', () => {
  const h = harness();
  assert.throws(() => h.t.start([{ beats: 3 }]));
  assert.throws(() => h.t.start([{ beats: 1 }], { tempo: 0 }));
  assert.equal(h.chords.length, 0);
});

test('folk rhythm repeats on the beat, skips rests, and preserves upstrokes', () => {
  const h = harness();
  h.t.start(
    [
      { shape: [0, 2, 2, 1, 0, 0], beats: 4, strum: 'down' },
      { shape: ['x', 'x', 'x', 'x', 'x', 'x'], beats: 1 },
    ],
    { tempo: 120, rhythm: 'folk', repeat: true, countIn: true },
  );
  h.advance(7);
  assert.deepEqual(
    h.chords.slice(0, 6).map((c) => Number((c.start - 2.08).toFixed(3))),
    [0, 0.5, 0.75, 1.25, 1.5, 1.75],
  );
  assert.equal(h.chords[2].hit.strum, 'up');
  assert.equal(Number(h.chords[6].start.toFixed(2)), 4.58);
  h.t.stop();
  const count = h.chords.length;
  h.advance(5);
  assert.equal(h.chords.length, count);
  assert.equal(h.pending.size, 0);
});
