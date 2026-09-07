import { tuningPreset } from './tunings.js';
import { PITCH_NAMES_SHARP } from './theory.js';
import { DEFAULT_PATTERN, expandArrangement } from './arrangement.js';
import { RHYTHMS } from './rhythm.js';
export const LEGACY_STORAGE_KEY = 'guitar-learning-studio-v1';
export const PREVIOUS_STORAGE_KEY = 'guitar-learning-studio-v2';
export const V3_STORAGE_KEY = 'guitar-learning-studio-v3';
export const V4_STORAGE_KEY = 'guitar-learning-studio-v4';
export const STORAGE_KEY = 'guitar-learning-studio-v5';
export const MAX_SAVED = 250;
export const MAX_TAB = 128;
export const MAX_SONGS = 40;
export const MAX_BACKUP_BYTES = 8_000_000;
export const emptyShape = () => ['x', 'x', 'x', 'x', 'x', 'x'];
export const defaultState = () => ({
  dataVersion: 5,
  tuning: 'standard',
  shape: emptyShape(),
  capo: 0,
  preferFlats: false,
  keyRoot: 'C',
  scaleType: 'major',
  saved: [],
  tab: [],
  mapVisible: false,
  flipped: true,
  orientationVersion: 1,
  fretRange: 'all',
  practiceRamp: { enabled: false, increment: 5, every: 4, target: 120 },
  tempo: 90,
  labelsMode: 'notes',
  repeat: false,
  countIn: false,
  metronome: false,
  sound: 'acoustic',
  songs: [],
  songTitle: '',
  songNote: '',
  songKey: null,
  songMode: 'major',
  activeSongId: null,
  rhythm: 'hold',
  pattern: [...DEFAULT_PATTERN],
  volume: 75,
  tone: 'balanced',
});
const validShape = (s) =>
  Array.isArray(s) &&
  s.length === 6 &&
  s.every((f) => f === 'x' || (Number.isInteger(f) && f >= 0 && f <= 12));
const validCapo = (c) => Number.isInteger(c) && c >= 0 && c <= 12;
function requireValue(ok, message) {
  if (!ok) throw new Error(message);
}
function grip(value) {
  requireValue(value && validShape(value.shape) && validCapo(value.capo), 'invalid fingering or capo');
  const tuning = tuningPreset(value.tuning).id;
  return { shape: [...value.shape], capo: value.capo, tuning };
}
function text(value, max, label) {
  requireValue(typeof value === 'string' && value.length <= max, `invalid ${label}`);
  return value;
}
function steps(value) {
  requireValue(Array.isArray(value) && value.length <= MAX_TAB, `expected at most ${MAX_TAB} sequence steps`);
  return value.map((item) => {
    requireValue(item.beats === undefined || [1, 2, 4].includes(item.beats), 'invalid step duration');
    requireValue(item.strum === undefined || ['down', 'up'].includes(item.strum), 'invalid strum direction');
    const extras = {};
    if (item.sectionStart !== undefined) {
      requireValue(typeof item.sectionStart === 'boolean', 'invalid section boundary');
      extras.sectionStart = item.sectionStart;
    }
    if (item.section !== undefined) extras.section = text(item.section, 40, 'section name');
    if (item.sectionRepeats !== undefined) {
      requireValue(
        Number.isInteger(item.sectionRepeats) && item.sectionRepeats >= 1 && item.sectionRepeats <= 8,
        'invalid section repeats',
      );
      extras.sectionRepeats = item.sectionRepeats;
    }
    if (item.rhythm !== undefined) {
      requireValue(item.rhythm === null || validRhythm(item.rhythm), 'invalid step rhythm');
      extras.rhythm = item.rhythm;
    }
    return { ...grip(item), beats: item.beats ?? 1, strum: item.strum ?? 'down', ...extras };
  });
}
function patternValue(value = DEFAULT_PATTERN) {
  requireValue(
    Array.isArray(value) && value.length === 8 && value.every((x) => ['-', 'd', 'u', 'D', 'U'].includes(x)),
    'invalid strum pattern',
  );
  return [...value];
}
const validKey = (key) => key === null || [...PITCH_NAMES_SHARP, 'Db', 'Eb', 'Gb', 'Ab', 'Bb'].includes(key);
const validTempo = (n) => Number.isInteger(n) && n >= 40 && n <= 180;
const validRhythm = (value) => RHYTHMS.some((r) => r.id === value);
// Reject an invalid payload whole; never discard or shorten individual records.
export function validateState(value) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), 'missing app data');
  const fretRange = value.fretRange ?? 'all';
  requireValue(['all', '0-4', '4-8', '8-12'].includes(fretRange), 'invalid fretboard range');
  const ramp = value.practiceRamp ?? defaultState().practiceRamp;
  requireValue(
    ramp &&
      typeof ramp.enabled === 'boolean' &&
      [1, 2, 5, 10].includes(ramp.increment) &&
      [1, 2, 4, 8].includes(ramp.every) &&
      validTempo(ramp.target),
    'invalid practice speed settings',
  );
  requireValue(
    value.orientationVersion === undefined || value.orientationVersion === 1,
    'invalid orientation preference',
  );
  requireValue(
    value.dataVersion === undefined || [2, 3, 4, 5].includes(value.dataVersion),
    'unsupported app data version',
  );
  const current = grip(value);
  requireValue(typeof value.preferFlats === 'boolean', 'invalid spelling preference');
  requireValue(PITCH_NAMES_SHARP.includes(value.keyRoot), 'invalid key');
  requireValue(
    ['major', 'naturalMinor', 'majorPentatonic', 'minorPentatonic', 'blues'].includes(value.scaleType),
    'invalid scale',
  );
  requireValue(
    Array.isArray(value.saved) && value.saved.length <= MAX_SAVED,
    `expected at most ${MAX_SAVED} saved shapes`,
  );
  requireValue(
    Array.isArray(value.tab) && value.tab.length <= MAX_TAB,
    `expected at most ${MAX_TAB} sequence steps`,
  );
  const ids = new Set();
  const saved = value.saved.map((item) => {
    const position = grip(item);
    const id = text(item.id, 100, 'record ID');
    requireValue(id.length > 0 && !ids.has(id), 'duplicate or empty record ID');
    ids.add(id);
    requireValue(typeof item.preferFlats === 'boolean', 'invalid saved spelling');
    return {
      id,
      title: text(item.title, 80, 'title'),
      note: text(item.note, 500, 'note'),
      ...position,
      preferFlats: item.preferFlats,
      createdAt: text(item.createdAt, 100, 'date'),
    };
  });
  for (const key of ['mapVisible', 'flipped', 'repeat', 'countIn', 'metronome'])
    requireValue(value[key] === undefined || typeof value[key] === 'boolean', `invalid ${key}`);
  requireValue(
    value.tempo === undefined || (Number.isInteger(value.tempo) && value.tempo >= 40 && value.tempo <= 180),
    'invalid tempo',
  );
  requireValue(
    value.labelsMode === undefined || ['notes', 'degrees'].includes(value.labelsMode),
    'invalid note display',
  );
  requireValue(
    value.sound === undefined || ['acoustic', 'electric', 'synth'].includes(value.sound),
    'invalid sound',
  );
  const tab = steps(value.tab),
    songIds = new Set();
  requireValue(
    value.songs === undefined || (Array.isArray(value.songs) && value.songs.length <= MAX_SONGS),
    `expected at most ${MAX_SONGS} songs`,
  );
  const songs = (value.songs ?? []).map((item) => {
    requireValue(item && typeof item === 'object', 'invalid song');
    const id = text(item.id, 100, 'song ID');
    requireValue(id && !songIds.has(id), 'duplicate or empty song ID');
    songIds.add(id);
    requireValue(
      validTempo(item.tempo) &&
        validRhythm(item.rhythm) &&
        validKey(item.key) &&
        ['major', 'naturalMinor'].includes(item.mode),
      'invalid song settings',
    );
    return {
      id,
      title: text(item.title, 80, 'song title'),
      note: text(item.note, 500, 'song note'),
      key: item.key,
      mode: item.mode,
      steps: steps(item.steps),
      tempo: item.tempo,
      rhythm: item.rhythm,
      pattern: patternValue(item.pattern),
      createdAt: text(item.createdAt, 100, 'song date'),
      updatedAt: text(item.updatedAt, 100, 'song update date'),
    };
  });
  const rhythm = value.rhythm ?? 'hold',
    volume = value.volume ?? 75,
    tone = value.tone ?? 'balanced',
    activeSongId = value.activeSongId ?? null,
    songKey = value.songKey ?? null,
    songMode = value.songMode ?? 'major';
  requireValue(
    validRhythm(rhythm) &&
      Number.isInteger(volume) &&
      volume >= 0 &&
      volume <= 100 &&
      ['warm', 'balanced', 'bright'].includes(tone),
    'invalid audio settings',
  );
  requireValue(activeSongId === null || songIds.has(activeSongId), 'active song is missing');
  requireValue(validKey(songKey) && ['major', 'naturalMinor'].includes(songMode), 'invalid song key');
  expandArrangement(tab);
  songs.forEach((song) => expandArrangement(song.steps));
  return {
    ...defaultState(),
    ...current,
    preferFlats: value.preferFlats,
    keyRoot: value.keyRoot,
    scaleType: value.scaleType,
    saved,
    tab,
    mapVisible: value.mapVisible ?? false,
    // Apply the requested bass-at-top default once; later Flip choices persist.
    flipped: value.orientationVersion === 1 ? (value.flipped ?? true) : true,
    fretRange,
    practiceRamp: {
      enabled: ramp.enabled,
      increment: ramp.increment,
      every: ramp.every,
      target: ramp.target,
    },
    tempo: value.tempo ?? 90,
    labelsMode: value.labelsMode ?? 'notes',
    repeat: value.repeat ?? false,
    countIn: value.countIn ?? false,
    metronome: value.metronome ?? false,
    sound: value.sound === 'electric' ? 'electric' : 'acoustic',
    songs,
    songTitle: text(value.songTitle ?? '', 80, 'song title'),
    songNote: text(value.songNote ?? '', 500, 'song note'),
    songKey,
    songMode,
    activeSongId,
    rhythm,
    pattern: patternValue(value.pattern),
    volume,
    tone,
  };
}
export function parseBackup(raw) {
  requireValue(new TextEncoder().encode(raw).length <= MAX_BACKUP_BYTES, 'file exceeds 8 MB');
  const envelope = JSON.parse(raw);
  requireValue([1, 2, 3, 4, 5].includes(envelope?.schemaVersion), 'unsupported backup version');
  return validateState(envelope.data);
}
export function serializeBackup(state) {
  return JSON.stringify(
    { schemaVersion: 5, exportedAt: new Date().toISOString(), data: validateState(state) },
    null,
    2,
  );
}
export function mergeBackup(current, incoming) {
  current = validateState(current);
  incoming = validateState(incoming);
  const saved = [...current.saved];
  for (const item of incoming.saved) {
    const existing = saved.find((s) => s.id === item.id);
    if (existing && JSON.stringify(existing) === JSON.stringify(item)) continue;
    saved.push(existing ? { ...item, id: crypto.randomUUID() } : item);
  }
  const tab =
    JSON.stringify(current.tab) === JSON.stringify(incoming.tab)
      ? current.tab
      : [...current.tab, ...incoming.tab];
  const songs = [...current.songs];
  for (const item of incoming.songs) {
    const existing = songs.find((s) => s.id === item.id);
    if (existing && JSON.stringify(existing) === JSON.stringify(item)) continue;
    songs.push(existing ? { ...item, id: crypto.randomUUID() } : item);
  }
  return validateState({ ...current, saved, tab, songs });
}
