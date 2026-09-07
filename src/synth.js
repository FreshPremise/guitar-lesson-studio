import { midiToFrequency } from './theory.js';
/** Deterministic plucked-string approximation. No recordings or downloads.
 * Harmonics decay at different rates, so a bright pluck becomes a warm tail.
 * Damped-sine recurrence avoids trigonometry in the inner sample loop.
 */
export function guitarWave(midi, sampleRate = 44100) {
  if (!Number.isInteger(midi) || midi < 28 || midi > 100)
    throw new RangeError('MIDI note outside supported guitar range');
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000)
    throw new RangeError('Unsupported sample rate');
  const frequency = midiToFrequency(midi);
  const duration = 2.8;
  const samples = new Float32Array(Math.ceil(sampleRate * duration));
  for (let harmonic = 1; harmonic <= 18 && frequency * harmonic < sampleRate * 0.45; harmonic++) {
    const amplitude =
      harmonic === 1 ? 1 : (0.85 * Math.sin(Math.PI * harmonic * 0.19)) / Math.pow(harmonic, 1.15);
    const decay = (1.45 + 0.28 * Math.pow(harmonic, 1.3)) * Math.pow(frequency / 110, 0.15);
    const radius = Math.exp(-decay / sampleRate);
    const omega = (2 * Math.PI * frequency * harmonic) / sampleRate;
    const coefficient = 2 * radius * Math.cos(omega),
      squared = radius * radius;
    let previous = 0,
      current = amplitude * Math.sin(omega) * radius;
    for (let n = 1; n < samples.length; n++) {
      samples[n] += current;
      const next = coefficient * current - squared * previous;
      previous = current;
      current = next;
    }
  }
  // A very short, low-level pick transient; seeded so renders are repeatable.
  let seed = midi * 7919 + 17,
    peak = 0;
  for (let n = 0; n < samples.length; n++) {
    const time = n / sampleRate;
    if (time < 0.015) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      samples[n] += ((seed / 4294967296) * 2 - 1) * 0.018 * Math.exp(-time * 300);
    }
    samples[n] *= Math.min(1, time / 0.002) * Math.min(1, (samples.length - 1 - n) / (sampleRate * 0.06));
    peak = Math.max(peak, Math.abs(samples[n]));
  }
  const gain = 0.8 / Math.max(peak, 0.001);
  for (let n = 0; n < samples.length; n++) samples[n] *= gain;
  samples[0] = 0;
  samples[samples.length - 1] = 0;
  return samples;
}
// Bound cache growth and tie buffers to their context/sample rate.
const caches = new WeakMap();
export function guitarBuffer(context, midi) {
  let cache = caches.get(context);
  if (!cache) {
    cache = new Map();
    caches.set(context, cache);
  }
  if (cache.has(midi)) return cache.get(midi);
  const wave = guitarWave(midi, context.sampleRate);
  const buffer = context.createBuffer(1, wave.length, context.sampleRate);
  buffer.copyToChannel(wave, 0);
  if (cache.size >= 48) cache.delete(cache.keys().next().value);
  cache.set(midi, buffer);
  return buffer;
}
