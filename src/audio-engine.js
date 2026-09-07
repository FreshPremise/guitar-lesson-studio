import { sampledVoice, prepareSamples } from './samples.js';
import { sequenceTimeline } from './rhythm.js';
import { analyzeSelection } from './theory.js';
export const pitches = (shape, capo, tuning) =>
  analyzeSelection(shape, { capo, tuning })
    .notes.filter((n) => n.midi !== null)
    .map((n) => n.midi);
export function audioOutput(context, { volume = 75, tone = 'balanced' } = {}) {
  const filter = context.createBiquadFilter(),
    gain = context.createGain();
  filter.type = 'lowpass';
  filter.frequency.value = { warm: 2600, balanced: 6500, bright: 14000 }[tone] ?? 6500;
  filter.Q.value = 0.55;
  gain.gain.value = volume / 100;
  filter.connect(gain).connect(context.destination);
  return {
    input: filter,
    dispose() {
      filter.disconnect();
      gain.disconnect();
    },
  };
}
export function scheduleGuitar(
  context,
  midi,
  start,
  {
    mode = 'chord',
    duration = 5,
    strum = 'down',
    sound = 'acoustic',
    output = context.destination,
    voices = new Set(),
    pick = null,
    accent = 1,
    onNote = () => {},
  } = {},
) {
  let end = start;
  if (!midi.length) return end;
  const ordered =
    pick !== null
      ? [{ note: midi[pick % midi.length], index: pick % midi.length }]
      : midi.map((note, index) => ({ note, index }));
  if (pick === null && strum === 'up') ordered.reverse();
  ordered.forEach(({ note, index }, i) => {
    const when = start + i * (mode === 'sequence' ? 0.32 : 0.026),
      source = context.createBufferSource(),
      gain = context.createGain();
    const sample = sampledVoice(context, note, sound);
    if (!sample) throw new Error('Guitar sound is not ready. Reload and try playback again.');
    source.buffer = sample.buffer;
    if (sample) source.playbackRate.value = sample.rate;
    const available = (source.buffer.duration - (sample?.offset ?? 0)) / (sample?.rate ?? 1),
      finish = Math.min(when + available, mode === 'sequence' ? when + duration : start + duration);
    // Very short gates must never schedule an envelope backwards.
    if (finish <= when + 0.006) return;
    const level = (0.24 * accent * (sample?.gain ?? 1)) / Math.sqrt(ordered.length),
      attack = Math.min(0.004, (finish - when) / 3);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(level, when + attack);
    gain.gain.setValueAtTime(level, Math.max(when + attack, finish - 0.025));
    gain.gain.linearRampToValueAtTime(0, finish);
    source.connect(gain).connect(output);
    voices.add(source);
    source.onended = () => {
      voices.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    onNote(note, index, when, finish);
    source.start(when, sample?.offset ?? 0);
    source.stop(finish);
    end = Math.max(end, finish);
  });
  return end;
}
export async function renderSequenceAudio(events, options = {}, Context = globalThis.OfflineAudioContext) {
  const timeline = sequenceTimeline(events, options);
  if (!events.length) throw new Error('The sequence is empty.');
  if (timeline.duration > 180)
    throw new Error('WAV export is limited to three minutes. Export a shorter sequence, or use MIDI or tab.');
  const context = new Context(1, Math.ceil((timeline.duration + 0.1) * 44100), 44100),
    output = audioOutput(context, options);
  await prepareSamples(context, options.sound ?? 'acoustic');
  for (const hit of timeline.hits)
    scheduleGuitar(context, pitches(hit.event.shape, hit.event.capo, hit.event.tuning), hit.start, {
      duration: hit.duration,
      strum: hit.strum,
      pick: hit.pick,
      accent: hit.accent,
      sound: options.sound,
      output: output.input,
    });
  const buffer = await context.startRendering();
  output.dispose();
  return buffer;
}
