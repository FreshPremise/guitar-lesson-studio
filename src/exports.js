import { tuningStrings, tuningName } from './tunings.js';
import { pitches } from './audio-engine.js';
import { sequenceTimeline } from './rhythm.js';
const utf8 = (text) => new TextEncoder().encode(text);
export function encodeWav(buffer) {
  const samples = buffer.getChannelData(0),
    bytes = new ArrayBuffer(44 + samples.length * 2),
    view = new DataView(bytes);
  const word = (offset, text) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  word(0, 'RIFF');
  view.setUint32(4, bytes.byteLength - 8, true);
  word(8, 'WAVE');
  word(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  word(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let peak = 0;
  for (const n of samples) peak = Math.max(peak, Math.abs(n));
  const scale = peak > 0.98 ? 0.98 / peak : 1;
  samples.forEach((sample, i) => {
    const n = Math.max(-1, Math.min(1, sample * scale));
    view.setInt16(44 + i * 2, Math.round(n * (n < 0 ? 32768 : 32767)), true);
  });
  return bytes;
}
function variableLength(n) {
  if (!Number.isSafeInteger(n) || n < 0 || n > 0x0fffffff) throw new RangeError('MIDI time is out of range');
  const bytes = [n & 127];
  while ((n >>= 7)) bytes.unshift((n & 127) | 128);
  return bytes;
}
function chunk(name, data) {
  return [
    ...utf8(name),
    (data.length >>> 24) & 255,
    (data.length >>> 16) & 255,
    (data.length >>> 8) & 255,
    data.length & 255,
    ...data,
  ];
}
export function encodeMidi(
  events,
  { tempo = 90, rhythm = 'hold', title = 'Guitar study', pattern, sound = 'acoustic' } = {},
) {
  const timeline = sequenceTimeline(events, { tempo, rhythm, pattern }),
    beatSeconds = 60 / tempo,
    ppq = 480,
    ticks = (seconds) => Math.round((seconds / beatSeconds) * ppq),
    notes = [];
  for (const hit of timeline.hits) {
    let midi = pitches(hit.event.shape, hit.event.capo, hit.event.tuning);
    if (hit.pick !== null) midi = midi.length ? [midi[hit.pick % midi.length]] : [];
    else if (hit.strum === 'up') midi.reverse();
    midi.forEach((pitch, i) => {
      const start = ticks(hit.start + i * 0.026),
        end = Math.max(start + 1, ticks(hit.start + hit.duration));
      notes.push(
        { tick: start, order: 1, data: [0x90, pitch, Math.round(80 * (hit.accent ?? 1))] },
        { tick: end, order: 0, data: [0x80, pitch, 0] },
      );
    });
  }
  const microseconds = Math.round(60_000_000 / tempo),
    name = [...utf8(title.slice(0, 80))];
  const track = [
    0,
    0xff,
    0x03,
    ...variableLength(name.length),
    ...name,
    0,
    0xff,
    0x51,
    3,
    (microseconds >>> 16) & 255,
    (microseconds >>> 8) & 255,
    microseconds & 255,
    0,
    0xc0,
    sound === 'electric' ? 27 : 25,
  ];
  let previous = 0;
  for (const event of notes.sort((a, b) => a.tick - b.tick || a.order - b.order)) {
    track.push(...variableLength(event.tick - previous), ...event.data);
    previous = event.tick;
  }
  track.push(...variableLength(Math.max(0, ticks(timeline.duration) - previous)), 0xff, 0x2f, 0);
  return new Uint8Array([
    ...chunk('MThd', [0, 0, 0, 1, (ppq >>> 8) & 255, ppq & 255]),
    ...chunk('MTrk', track),
  ]);
}
export function sequenceText(events, { title = 'Guitar study', tempo = 90, rhythm = 'hold' } = {}) {
  const lines = [title, `${tempo} BPM | ${rhythm} | frets relative to each capo`, ''];
  // Start a new block on each tuning change so string labels are never misleading.
  for (let start = 0; start < events.length; ) {
    const tuning = events[start].tuning ?? 'standard';
    let end = start + 1;
    while (end < events.length && end < start + 8 && (events[end].tuning ?? 'standard') === tuning) end++;
    const part = events.slice(start, end),
      cell = (text) => String(text).padStart(5, ' ');
    lines.push(
      `${tuningName(tuning)}: ${tuningStrings(tuning)
        .map((s) => s.name)
        .join(' ')}`,
    );
    lines.push(
      'Step ' + part.map((_, i) => cell(start + i + 1)).join(''),
      'Capo ' + part.map((e) => cell(e.capo)).join(''),
      'Beats' + part.map((e) => cell(e.beats)).join(''),
    );
    for (let i = 5; i >= 0; i--)
      lines.push(
        tuningStrings(tuning)[i].label.padEnd(2) +
          '|  ' +
          part.map((e) => String(e.shape[i]).padStart(4, '-') + '-').join('') +
          '|',
      );
    lines.push('');
    start = end;
  }
  return lines.join('\n');
}
