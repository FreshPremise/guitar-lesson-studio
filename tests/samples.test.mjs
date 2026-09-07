import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { sampleMapping, SAMPLE_NOTES, prepareSamples, sampledVoice } from '../src/samples.js';
test('nearest acoustic samples cover D2 through E6 with correct playback ratios and no synthetic fallback', () => {
  for (let midi = 38; midi <= 88; midi++) {
    const m = sampleMapping(midi);
    assert.ok(m);
    assert.ok(Math.abs(midi - m.root) <= 14);
    assert.ok(Math.abs(m.rate * 440 * 2 ** ((m.root - 69) / 12) - 440 * 2 ** ((midi - 69) / 12)) < 1e-9);
  }
  assert.equal(sampleMapping(89), null);
  assert.equal(sampleMapping(37), null);
  assert.equal(sampleMapping(40.5), null);
});
test('bundled sounds, font and licenses match the portable source hashes', async () => {
  const { files } = JSON.parse(
    await readFile(new URL('../assets/v6-manifest.json', import.meta.url), 'utf8'),
  );
  assert.equal(files.filter((f) => f.path.endsWith('.mp3')).length, 25);
  for (const entry of files) {
    assert.match(entry.path, /^assets\/(guitar|electric|fonts)\/[\w.-]+$/);
    const bytes = await readFile(new URL(`../${entry.path}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    assert.equal(bytes.length, entry.bytes);
  }
});
test('concurrent sample preparations reuse local fetches and recover after a failed decode', async (t) => {
  let calls = 0,
    fail = true;
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.match(url, /^assets\/guitar\/[A-E][2-5]\.mp3$/);
    calls++;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
  });
  const context = {
    decodeAudioData: async () => {
      if (fail) throw new Error('decode failed');
      return {
        numberOfChannels: 1,
        length: 3,
        sampleRate: 44100,
        getChannelData: () => new Float32Array([0, 0.5, 0]),
      };
    },
  };
  await assert.rejects(prepareSamples(context));
  fail = false;
  const [a, b] = await Promise.all([prepareSamples(context), prepareSamples(context)]);
  assert.equal(a, b);
  assert.equal(calls, 20);
  assert.equal(sampledVoice(context, 40).gain, 1.6);
  assert.ok(sampledVoice(context, 88));
});
