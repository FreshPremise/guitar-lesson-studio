import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guitarWave } from '../src/synth.js';
import { midiToFrequency } from '../src/theory.js';
const energy = (wave, start, end) => {
  let sum = 0;
  for (let i = start; i < end; i++) sum += wave[i] * wave[i];
  return Math.sqrt(sum / (end - start));
};
function power(wave, frequency, rate, start = 1000, length = 22050) {
  let re = 0,
    im = 0;
  for (let n = 0; n < length; n++) {
    const a = (2 * Math.PI * frequency * n) / rate;
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (length - 1));
    re += wave[start + n] * Math.cos(a) * window;
    im += wave[start + n] * Math.sin(a) * window;
  }
  return re * re + im * im;
}
test('plucked samples are deterministic, finite, bounded and fade to silence', () => {
  for (const rate of [44100, 48000])
    for (const midi of [40, 52, 64, 76, 88]) {
      const wave = guitarWave(midi, rate);
      let peak = 0;
      for (const v of wave) {
        assert.ok(Number.isFinite(v));
        peak = Math.max(peak, Math.abs(v));
      }
      assert.ok(peak <= 0.800001);
      assert.equal(wave[0], 0);
      assert.equal(wave.at(-1), 0);
      assert.ok(
        energy(wave, rate * 2, Math.floor(rate * 2.5)) < energy(wave, 100, Math.floor(rate * 0.3)) * 0.15,
      );
    }
  assert.deepEqual(guitarWave(60), guitarWave(60));
});
test('fundamental pitch is correct and the pluck includes decaying upper harmonics', () => {
  for (const midi of [40, 57, 69, 88]) {
    const wave = guitarWave(midi),
      f = midiToFrequency(midi),
      fundamental = power(wave, f, 44100);
    assert.ok(fundamental > power(wave, f * 1.04, 44100) * 3, `sharp neighbor ${midi}`);
    assert.ok(fundamental > power(wave, f * 0.96, 44100) * 3, `flat neighbor ${midi}`);
    assert.ok(power(wave, f * 2, 44100) > fundamental * 0.005, `upper partial ${midi}`);
    const earlyRatio = power(wave, f * 3, 44100) / fundamental;
    const lateRatio = power(wave, f * 3, 44100, 44100) / power(wave, f, 44100, 44100);
    assert.ok(lateRatio < earlyRatio, `brightness decays ${midi}`);
  }
});
test('dense six-string repetitions at maximum tempo stay below digital clipping', () => {
  const rate = 44100,
    beat = rate / 3,
    notes = [40, 47, 52, 55, 59, 64],
    out = new Float32Array(rate * 7);
  notes.forEach((midi, i) => {
    const wave = guitarWave(midi, rate);
    for (let step = 0; step < 12; step++) {
      const start = Math.round(step * beat + i * 0.026 * rate);
      for (let n = 0; n < wave.length; n++) out[start + n] += (wave[n] * 0.24) / Math.sqrt(6);
    }
  });
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  assert.ok(peak < 0.95, `peak ${peak}`);
});
test('synth rejects invalid inputs', () => {
  assert.throws(() => guitarWave(NaN));
  assert.throws(() => guitarWave(60, 0));
});
