import { TUNINGS, tuningStrings, tuningName } from './tunings.js';
import {
  STANDARD_TUNING,
  PITCH_NAMES_SHARP,
  PITCH_NAMES_FLAT,
  analyzeSelection,
  scaleNotes,
  stringStateToMidi,
  midiToNote,
  midiToFrequency,
  normalizePitchClass,
  pitchName,
} from './theory.js';
import { categories, guitarLibrary } from './library.js';
import {
  LEGACY_STORAGE_KEY,
  PREVIOUS_STORAGE_KEY,
  V3_STORAGE_KEY,
  V4_STORAGE_KEY,
  STORAGE_KEY,
  MAX_SAVED,
  MAX_TAB,
  MAX_BACKUP_BYTES,
  emptyShape,
  defaultState,
  validateState,
  parseBackup,
  serializeBackup,
  mergeBackup,
} from './storage.js';
import { attachRevision } from './revision.js';
import { expandArrangement } from './arrangement.js';
import { gripPath, scalePath, directPath } from './fret-path.js';
let revision,
  lightFrame = null,
  noteLights = [],
  paused = false;
import { degreeLabel, keyFamily, triadVoicings, nearestVoicings, familyVoicing } from './learning.js';
import { createTransport } from './transport.js';
import { prepareSamples } from './samples.js';
import { scheduleGuitar, audioOutput, pitches } from './audio-engine.js';
import { CHORD_TYPES, findVoicings } from './voicings.js';
import { attachStudio } from './studio.js';
import { eventName } from './songs.js';
const $ = (id) => document.getElementById(id);
let recoveryRaw = null;
let storageBlocked = false;
let state = loadState();
const history = [];
const future = [];
const BACKUP_DATE_KEY = 'guitar-lesson-studio-confirmed-backup';
let backupRequestedAt = null;
let activeTool = 'library',
  page = 0,
  pageSize = 4,
  librarySignature = '',
  savedSignature = '',
  sequenceSignature = '';
let studio,
  audioBus,
  playbackPreview = false;
let audioContext,
  playbackToken = 0,
  transport,
  editingId = null,
  recallQueue = [],
  recallRevealed = false,
  nearestReference = null;
const voices = new Set(),
  timers = new Set();
const code = (shape) => shape.join(' ');
const status = (message) => {
  $('status').textContent = message;
};
function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function button(text, handler, label = text) {
  const el = node('button', text);
  el.type = 'button';
  el.setAttribute('aria-label', label);
  el.addEventListener('click', handler);
  return el;
}
function on(id, event, handler) {
  $(id).addEventListener(event, handler);
}
function later(handler, ms) {
  const id = setTimeout(() => {
    timers.delete(id);
    handler();
  }, ms);
  timers.add(id);
}
TUNINGS.forEach((t) => $('tuning-select').append(new Option(t.title, t.id)));
on('tuning-select', 'change', (e) =>
  update(
    { tuning: e.target.value },
    'Virtual guitar retuned. Saved grips and sequence steps keep their own tuning.',
  ),
);
for (let n = 1; n <= 12; n++) $('capo-select').append(new Option(`Fret ${n}`, n));
PITCH_NAMES_SHARP.forEach((n) => $('key-root').append(new Option(n, n)));
[...new Set([...PITCH_NAMES_SHARP, ...PITCH_NAMES_FLAT])].forEach((n) =>
  $('learning-root').append(new Option(n, n)),
);
categories.forEach((c) => $('library-category').append(new Option(c, c)));
on('labels-mode', 'change', (e) => update({ labelsMode: e.target.value }));
on('sound', 'change', (e) => update({ sound: e.target.value }));
for (const [id, key] of [
  ['repeat', 'repeat'],
  ['count-in', 'countIn'],
  ['metronome', 'metronome'],
])
  on(id, 'change', (e) => update({ [key]: e.target.checked }));
for (const id of [
  'library-view',
  'learning-root',
  'family-mode',
  'triad-quality',
  'triad-strings',
  'triad-inversion',
  'finder-quality',
  'finder-open',
])
  on(id, 'change', () => {
    page = 0;
    nearestReference = null;
    renderLibrary();
  });
on('nearest-triad', 'click', () => {
  page = 0;
  renderLibrary(true);
});
on('notebook-search', 'input', renderSaved);
on('cancel-edit', 'click', cancelEdit);
on('study-sheet', 'click', showStudySheet);
on('close-study', 'click', () => $('study-dialog').close());
on('print-sheet', 'click', () => window.print());
on('recall-start', 'click', () => {
  recallQueue = structuredClone(filteredSaved());
  if (!recallQueue.length) return status('Save a shape or clear your notebook search first.');
  stopAudio();
  renderRecall();
  $('recall-dialog').showModal();
});
on('recall-end', 'click', () => $('recall-dialog').close());
on('recall-reveal', 'click', () => {
  recallRevealed = true;
  renderRecall(true);
});
on('recall-again', 'click', () => {
  recallQueue.push(recallQueue.shift());
  renderRecall();
});
on('recall-known', 'click', () => {
  recallQueue.shift();
  renderRecall();
});
on('capo-select', 'change', (e) => update({ capo: Number(e.target.value) }));
on('spelling-select', 'change', (e) => update({ preferFlats: e.target.value === 'flat' }));
on('flip-neck', 'click', () => update({ flipped: !state.flipped }));
on('scale-menu', 'click', () => {
  const open = $('map-controls').classList.toggle('map-open');
  $('scale-menu').setAttribute('aria-expanded', String(open));
  if (open) $('key-root').focus();
});
on('map-controls', 'keydown', (e) => {
  if (e.key === 'Escape') {
    $('map-controls').classList.remove('map-open');
    $('scale-menu').setAttribute('aria-expanded', 'false');
    $('scale-menu').focus();
  }
});
on('clear-shape', 'click', () => update({ shape: emptyShape() }, 'Selection cleared. Undo restores it.'));
on('undo', 'click', undo);
on('redo', 'click', redo);
on('fret-range', 'change', (e) => update({ fretRange: e.target.value }));
for (const id of ['enabled', 'increment', 'every', 'target']) {
  on('ramp-' + id, 'change', () => {
    const next = {
      enabled: $('ramp-enabled').checked,
      increment: Number($('ramp-increment').value),
      every: Number($('ramp-every').value),
      target: Number($('ramp-target').value),
    };
    if (!Number.isInteger(next.target) || next.target < 40 || next.target > 180) {
      $('ramp-target').value = state.practiceRamp.target;
      return status('Practice target must be a whole number from 40 to 180 BPM.');
    }
    update({ practiceRamp: next }, 'Practice speed settings saved.');
  });
}
document.addEventListener('keydown', (e) => {
  if (
    (!e.ctrlKey && !e.metaKey) ||
    e.altKey ||
    e.repeat ||
    e.target.closest('input, textarea, select, [contenteditable]')
  )
    return;
  const key = e.key.toLowerCase();
  if (key !== 'z' && key !== 'y') return;
  e.preventDefault();
  if (key === 'y' || e.shiftKey) redo();
  else undo();
});
on('studio-settings', 'click', renderBackupDate);
on('settings-backup', 'click', () => {
  $('settings-dialog').close();
  $('export-data').click();
});
on('confirm-backup', 'click', () => {
  if (!backupRequestedAt) return;
  try {
    localStorage.setItem(BACKUP_DATE_KEY, backupRequestedAt);
    $('backup-status').textContent = 'Backup confirmed saved. Keep the file somewhere you can find it.';
    $('confirm-backup').disabled = true;
    renderBackupDate();
  } catch {
    $('backup-status').textContent = 'The confirmation date could not be stored. Keep your backup file.';
  }
});
function renderBackupDate() {
  let date;
  try {
    date = new Date(localStorage.getItem(BACKUP_DATE_KEY) || '');
  } catch {}
  $('last-backup').textContent =
    date && Number.isFinite(date.getTime())
      ? 'Last confirmed backup: ' + date.toLocaleString()
      : 'No confirmed backup in this browser. Download a copy to protect your music if browser data is cleared.';
}
on('hear-notes', 'click', () => playCurrent('sequence'));
on('hear-chord', 'click', () => playCurrent('chord'));
on('stop-audio', 'click', () => stopAudio(true));
on('key-root', 'change', (e) => update({ keyRoot: e.target.value }));
on('scale-type', 'change', (e) => update({ scaleType: e.target.value }));
on('toggle-map', 'click', () => update({ mapVisible: !state.mapVisible }));
on('save-shape', 'click', () => {
  showTool('saved');
  $('shape-title').focus();
});
on('save-note', 'click', saveShape);
on('add-tab', 'click', () => {
  if (!state.shape.some((f) => f !== 'x')) return status('Choose a note or chord first.');
  if (state.tab.length >= MAX_TAB)
    return status(`Sequence limit: ${MAX_TAB} steps. Remove a step before adding more.`);
  update(
    {
      tab: [
        ...state.tab,
        { shape: [...state.shape], capo: state.capo, tuning: state.tuning, beats: 1, strum: 'down' },
      ],
    },
    'Added to sequence.',
  );
});
on('play-tab', 'click', playSequence);
on('clear-tab', 'click', () => update({ tab: [] }, 'Sequence cleared. Undo restores it.'));
on('tempo', 'change', (e) => {
  const tempo = Number(e.target.value);
  if (!Number.isInteger(tempo) || tempo < 40 || tempo > 180) {
    e.target.value = state.tempo;
    return status('Choose a tempo from 40 to 180 BPM.');
  }
  update({ tempo });
});
on('library-search', 'input', () => {
  page = 0;
  renderLibrary();
});
on('library-category', 'change', () => {
  page = 0;
  renderLibrary();
});
on('library-prev', 'click', () => {
  page--;
  renderLibrary();
});
on('library-next', 'click', () => {
  page++;
  renderLibrary();
});
on('export-data', 'click', () => {
  $('backup-json').value = recoveryRaw ?? serializeBackup(state);
  backupRequestedAt = null;
  $('confirm-backup').disabled = true;
  $('backup-status').textContent = recoveryRaw
    ? 'Recovery copy of original data. Keep this before making any repairs.'
    : 'To restore, paste a version 1–5 backup here and choose Merge this JSON. Existing discoveries are kept.';
  $('backup-dialog').showModal();
});
on('close-backup', 'click', () => $('backup-dialog').close());
on('download-backup', 'click', exportBackup);
on('copy-backup', 'click', async () => {
  try {
    await navigator.clipboard.writeText($('backup-json').value);
    backupRequestedAt = new Date().toISOString();
    $('confirm-backup').disabled = false;
    $('backup-status').textContent = 'Backup JSON copied. Paste into a text file and keep it somewhere safe.';
  } catch {
    $('backup-json').focus();
    $('backup-json').select();
    $('backup-status').textContent = 'Press Ctrl+C to copy the selected JSON.';
  }
});
on('merge-json', 'click', () => {
  if (storageBlocked) {
    $('backup-status').textContent = 'Import paused to protect existing data. Export and reload first.';
    return;
  }
  try {
    const merged = mergeBackup(state, parseBackup($('backup-json').value));
    const ok = update(merged, 'Backup merged. Undo reverses the import.');
    $('backup-status').textContent = ok
      ? 'Backup merged successfully. Existing discoveries kept.'
      : 'Merged in memory only. Export before closing.';
  } catch (e) {
    $('backup-status').textContent = `Rejected: ${e.message}. Existing data unchanged.`;
  }
});
on('import-data', 'change', importBackup);
const tools = ['library', 'saved', 'sequence', 'practice'];
tools.forEach((name, index) => {
  on(`tool-${name}`, 'click', () => showTool(name));
  on(`tool-${name}`, 'keydown', (e) => {
    const target =
      e.key === 'ArrowRight'
        ? (index + 1) % tools.length
        : e.key === 'ArrowLeft'
          ? (index + tools.length - 1) % tools.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? tools.length - 1
              : -1;
    if (target < 0) return;
    e.preventDefault();
    showTool(tools[target]);
    $(`tool-${tools[target]}`).focus();
  });
});
// A second tab must not silently overwrite edits made in this one.
window.addEventListener('storage', (e) => {
  if (
    e.key === STORAGE_KEY ||
    e.key === PREVIOUS_STORAGE_KEY ||
    e.key === V3_STORAGE_KEY ||
    e.key === V4_STORAGE_KEY ||
    e.key === LEGACY_STORAGE_KEY ||
    e.key === null
  ) {
    storageBlocked = true;
    status('Data changed in another tab. Export any work here, then reload before editing.');
  }
});
window.addEventListener('pagehide', () => stopAudio());
studio = attachStudio({
  getState: () => state,
  update,
  status,
  node,
  button,
  diagram,
  showTool,
  makeBoard,
  playSequence,
  playMidi,
  stopAudio,
  isPlaying: () => Boolean(transport?.running || voices.size),
});
revision = attachRevision({
  getState: () => state,
  update,
  status,
  node,
  button,
  diagram,
  playPath,
  pauseAudio,
  stopAudio,
});
renderAll();
if (storageBlocked)
  status(
    'Stored data could not be read. It is protected from overwrite. Export a recovery copy from Notebook.',
  );
const resize = new ResizeObserver(() => {
  if (activeTool !== 'library') return;
  const grid = $('library-cards');
  const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
  const minHeight = $('library-view').value === 'shapes' ? 120 : 152;
  const count =
    Math.max(1, columns) * Math.max(1, Math.min(3, Math.floor((grid.clientHeight + 9) / (minHeight + 9))));
  if (count !== pageSize) {
    pageSize = count;
    page = 0;
    renderLibrary();
  }
});
resize.observe($('library-cards'));
function showTool(name) {
  activeTool = name;
  tools.forEach((t) => {
    $(`panel-${t}`).hidden = t !== name;
    $(`tool-${t}`).setAttribute('aria-selected', String(t === name));
    $(`tool-${t}`).tabIndex = t === name ? 0 : -1;
  });
  if (name === 'library') renderLibrary();
}
function update(changes, message = '') {
  if (storageBlocked) {
    status('Editing paused to protect stored data. Export a recovery copy, then reload.');
    return false;
  }
  let next;
  try {
    next = validateState({ ...state, ...changes });
  } catch (error) {
    status('Change not applied: ' + error.message);
    return false;
  }
  stopAudio();
  history.push(structuredClone(state));
  future.length = 0;
  if (history.length > 40) history.shift();
  state = next;
  const persisted = persist();
  renderAll();
  if (persisted && message) status(message);
  return persisted;
}
function undo() {
  if (storageBlocked)
    return status('Undo paused because another tab changed stored data. Export and reload first.');
  if (!history.length) return;
  stopAudio();
  future.push(structuredClone(state));
  state = history.pop();
  const ok = persist();
  renderAll();
  if (ok) status('Last change undone.');
}
function redo() {
  if (storageBlocked) return status('Redo paused to protect stored data. Export and reload first.');
  if (!future.length) return;
  stopAudio();
  history.push(structuredClone(state));
  if (history.length > 40) history.shift();
  state = future.pop();
  const ok = persist();
  renderAll();
  if (ok) status('Change restored.');
}
function renderAll() {
  const focusKey = document.activeElement?.dataset.focus;
  $('capo-select').value = state.capo;
  $('tuning-select').value = state.tuning;
  $('spelling-select').value = state.preferFlats ? 'flat' : 'sharp';
  $('key-root').value = state.keyRoot;
  [...$('key-root').options].forEach((o, i) => {
    o.textContent = (state.preferFlats ? PITCH_NAMES_FLAT : PITCH_NAMES_SHARP)[i];
  });
  $('scale-type').value = state.scaleType;
  $('tempo').value = state.tempo;
  $('labels-mode').value = state.labelsMode;
  $('sound').value = state.sound;
  $('repeat').checked = state.repeat;
  $('count-in').checked = state.countIn;
  $('metronome').checked = state.metronome;
  $('undo').disabled = !history.length;
  $('redo').disabled = !future.length;
  $('fret-range').value = state.fretRange;
  $('ramp-enabled').checked = state.practiceRamp.enabled;
  for (const id of ['increment', 'every', 'target']) $('ramp-' + id).value = state.practiceRamp[id];
  $('saved-count').textContent = state.saved.length;
  $('tab-count').textContent = state.tab.length;
  renderBoard();
  renderAnalysis();
  renderLibrary();
  renderSaved();
  renderSequence();
  studio?.render();
  revision?.render();
  if (focusKey)
    [...document.querySelectorAll('[data-focus]')]
      .find((el) => el.dataset.focus === focusKey)
      ?.focus({ preventScroll: true });
}
function renderBoard(view = state, target = null) {
  const board = target ?? $('fretboard');
  const [minFret, maxFret] =
    !target && !playbackPreview && view.fretRange !== 'all' ? view.fretRange.split('-').map(Number) : [0, 12];
  board.replaceChildren();
  board.classList.toggle('has-capo', view.capo > 0 && minFret === 0);
  board.classList.toggle('focused-range', maxFret - minFret < 12);
  board.style.setProperty('--fret-count', maxFret - minFret + 1);
  const labels = node('div', undefined, 'fret-labels');
  for (let f = minFret; f <= maxFret; f++) {
    const label = node('span', String(f), [3, 5, 7, 9, 12].includes(f + view.capo) ? 'marker' : '');
    label.title = `Relative fret ${f}; physical fret ${f + view.capo}`;
    if (view.capo) label.append(node('small', `(${f + view.capo})`));
    labels.append(label);
  }
  board.append(labels);
  const neck = node('div', undefined, 'neck-grid');
  const inlays = node('div', undefined, 'inlay-layer');
  inlays.setAttribute('aria-hidden', 'true');
  for (let f = minFret; f <= maxFret; f++) {
    const physical = f + view.capo;
    if (![3, 5, 7, 9, 12, 15, 17, 19, 21, 24].includes(physical)) continue;
    const marker = node('span', undefined, `inlay${physical % 12 === 0 ? ' double-inlay' : ''}`);
    marker.style.gridColumn = String(f - minFret + 1);
    marker.dataset.physicalFret = physical;
    inlays.append(marker);
  }
  neck.append(inlays);
  if (view.capo && minFret === 0) {
    const capo = node('div', undefined, 'capo-hardware');
    capo.setAttribute('role', 'img');
    capo.setAttribute('aria-label', `Capo just behind physical fret ${view.capo}`);
    capo.title = `Capo ${view.capo}: behind the fret wire, on the nut side`;
    neck.append(capo);
  }
  const map = new Set(
    view.mapVisible ? scaleNotes(view.keyRoot, view.scaleType).map(normalizePitchClass) : [],
  );
  const chord = analyzeSelection(view.shape, { capo: view.capo, tuning: view.tuning }).chords[0];
  const order = view.flipped ? [0, 1, 2, 3, 4, 5] : [5, 4, 3, 2, 1, 0];
  order.forEach((index) => {
    const string = tuningStrings(view.tuning)[index];
    const row = node('div', undefined, 'string-row');
    row.dataset.string = string.string;
    row.style.setProperty('--string-width', `${3.5 - index * 0.5}px`);
    const side = node('div', undefined, 'string-side');
    const label = node('span', index === 5 ? string.label.toLowerCase() : string.label, 'string-name');
    label.title = `${string.name}, string ${string.string}`;
    const mute = button('×', () => selectFret(index, 'x'), `Mute string ${string.string}`);
    mute.className = 'mute-string';
    mute.dataset.focus = `mute-${index}`;
    mute.setAttribute('aria-pressed', String(view.shape[index] === 'x'));
    side.append(label, mute);
    row.append(side);
    for (let fret = minFret; fret <= maxFret; fret++) {
      const midi = stringStateToMidi(index, fret, view.capo, view.tuning),
        note = midiToNote(midi, { preferFlats: view.preferFlats });
      const selected = view.shape[index] === fret;
      const b = button(
        '',
        () => selectFret(index, selected ? 'x' : fret),
        `String ${string.string}, relative fret ${fret}, ${note}`,
      );
      b.className = 'fret-position pitch-' + (midi % 12);
      b.dataset.fret = fret;
      b.dataset.focus = `fret-${index}-${fret}`;
      b.setAttribute('aria-pressed', String(selected));
      b.title = `${note} · string ${string.string}, fret ${fret}${view.capo ? ` (physical ${view.capo + fret})` : ''}`;
      // One keyboard stop per string; arrows navigate the neck without changing notes.
      const focusFret = Math.max(
        minFret,
        Math.min(maxFret, typeof view.shape[index] === 'number' ? view.shape[index] : minFret),
      );
      b.tabIndex = fret === focusFret ? 0 : -1;
      b.addEventListener('keydown', (e) => {
        let targetIndex = index,
          targetFret = fret;
        if (e.key === 'ArrowLeft') targetFret = Math.max(minFret, fret - 1);
        else if (e.key === 'ArrowRight') targetFret = Math.min(maxFret, fret + 1);
        else if (e.key === 'Home') targetFret = minFret;
        else if (e.key === 'End') targetFret = maxFret;
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown')
          targetIndex =
            order[Math.max(0, Math.min(5, order.indexOf(index) + (e.key === 'ArrowUp' ? -1 : 1)))];
        else return;
        e.preventDefault();
        board.querySelector(`[data-focus="fret-${targetIndex}-${targetFret}"]`)?.focus();
      });
      if (selected || map.has(midi % 12)) {
        const interval = ((midi % 12) - normalizePitchClass(view.keyRoot) + 12) % 12;
        const degree = selected
          ? degreeLabel(chord, midi % 12)
          : ({ 0: '1', 3: '♭3', 4: '3', 6: '♭5', 7: '5' }[interval] ?? '');
        const dot = node(
          'span',
          (view.labelsMode === 'degrees' && selected ? degree : '') || note.replace(/-?\d+$/, ''),
          'note-dot pitch-' + (midi % 12) + (selected ? '' : ' map-note'),
        );
        if (degree) b.setAttribute('aria-label', b.getAttribute('aria-label') + ', chord degree ' + degree);
        b.append(dot);
      }
      row.append(b);
    }
    neck.append(row);
  });
  board.append(neck);
  if (target) return;
  $('orientation-label').textContent = view.flipped ? 'bass string on top' : 'treble string on top';
  $('flip-neck').setAttribute('aria-pressed', String(view.flipped));
  $('capo-readout').textContent = view.capo
    ? `${tuningName(view.tuning)} · capo ${view.capo} · (physical frets)`
    : `${tuningName(view.tuning)} · 0 = open · frets relative to capo`;
  const hiddenNotes = view.shape.filter((f) => typeof f === 'number' && (f < minFret || f > maxFret)).length;
  if (hiddenNotes) $('capo-readout').textContent += ` · ${hiddenNotes} selected outside view`;
  $('fret-range').value = playbackPreview ? 'all' : state.fretRange;
  $('toggle-map').textContent = view.mapVisible ? 'Hide map' : 'Show map';
  $('toggle-map').setAttribute('aria-pressed', String(view.mapVisible));
  const scale = scaleNotes(view.keyRoot, view.scaleType, { preferFlats: view.preferFlats }).join(' · ');
  $('key-notes').textContent = scale;
  $('toggle-map').title = `${scale}. Filled markers show your grip; the map shows scale notes.`;
}
function makeBoard(view) {
  const board = node('div', undefined, 'fretboard');
  renderBoard(view, board);
  return board.cloneNode(true);
}
function selectFret(index, value) {
  const shape = [...state.shape];
  shape[index] = value;
  update({ shape });
}
function renderAnalysis(view = state) {
  const result = analyzeSelection(view.shape, {
    capo: view.capo,
    tuning: view.tuning,
    preferFlats: view.preferFlats,
  });
  const shapeResult = view.capo
    ? analyzeSelection(view.shape, { tuning: view.tuning, preferFlats: view.preferFlats })
    : result;
  const notes = result.notes.filter((n) => n.midi !== null),
    match = result.chords[0],
    exact = match?.exact;
  const title = result.dyad
    ? result.dyad.name
    : notes.length < 2
      ? result.summary
      : exact
        ? match.symbol
        : `${notes.length} notes`;
  $('analysis-name').textContent = title;
  $('analysis-name').classList.toggle('long-name', title.length > 10);
  $('match-label').textContent = result.dyad
    ? `${result.dyad.semitones} SEMITONES`
    : notes.length <= 1
      ? 'YOUR SELECTION'
      : exact
        ? 'CHORD MATCH'
        : 'EXPLORING';
  $('shape-sound-label').textContent =
    result.dyad || notes.length < 2
      ? ''
      : exact
        ? view.capo && shapeResult.chords[0]?.exact
          ? `${shapeResult.chords[0].symbol} shape · sounds ${match.symbol}`
          : match.inversion
        : match
          ? `Possible ${match.symbol} · incomplete match`
          : 'No common chord match';
  $('shape-code').textContent = code(view.shape);
  $('note-list').textContent = notes.map((n) => n.note).join(' · ') || '—';
  $('interval-list').textContent = result.dyad
    ? `${result.dyad.semitones} semitones`
    : exact
      ? result.pitchClasses.map((n) => degreeLabel(match, normalizePitchClass(n))).join(' · ')
      : '—';
  let explanation =
    notes.length === 0
      ? 'Choose a shape below or click the neck. Arrow keys move between frets; Enter selects.'
      : notes.length === 1
        ? 'A single pitch. Add another to explore an interval.'
        : result.dyad
          ? `Two sounding notes form this interval.${match?.exact && match.suffix === '5' ? ` Also a ${match.root}5 power dyad.` : ''}`
          : exact
            ? `${match.root} ${match.quality}.`
            : match
              ? `Suggested only. Missing: ${match.missing.join(', ') || 'none'}. Extra: ${match.extra.join(', ') || 'none'}.`
              : 'These pitches do not match a supported chord. Their note names are shown above.';
  if (exact && !result.dyad) {
    const alternatives = result.chords.filter((c) => c.exact).slice(1, 3);
    if (alternatives.length) explanation += ` Also: ${alternatives.map((c) => c.symbol).join(', ')}.`;
  }
  $('analysis-explanation').textContent = explanation;
  $('analysis-name').title = explanation;
}
function diagram(shape, tuning = 'standard') {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 96 100');
  svg.setAttribute('aria-hidden', 'true');
  function draw(tag, attrs, text) {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    svg.append(e);
  }
  const fretted = shape.filter((f) => typeof f === 'number' && f > 0);
  const start = Math.max(...fretted, 0) <= 4 ? 1 : Math.min(...fretted);
  const rows = Math.max(4, Math.max(...fretted, start) - start + 1),
    step = 61 / rows;
  for (let i = 0; i <= rows; i++)
    draw('line', {
      x1: 16,
      x2: 86,
      y1: 23 + i * step,
      y2: 23 + i * step,
      stroke: '#b7bec8',
      'stroke-width': i === 0 && start === 1 ? 3 : 1,
    });
  for (let i = 0; i < 6; i++) {
    const x = 16 + i * 14,
      f = shape[i];
    draw('line', { x1: x, x2: x, y1: 23, y2: 84, stroke: '#9199a5', 'stroke-width': 1 });
    draw(
      'text',
      { x, y: 97, 'text-anchor': 'middle', 'font-size': 16, fill: '#000' },
      i === 5 ? tuningStrings(tuning)[i].label.toLowerCase() : tuningStrings(tuning)[i].label,
    );
    if (f === 'x' || f === 0)
      draw(
        'text',
        { x, y: 16, 'text-anchor': 'middle', 'font-size': 16, fill: '#000' },
        f === 'x' ? '×' : '○',
      );
    else draw('circle', { cx: x, cy: 23 + (f - start + 0.5) * step, r: 4, fill: '#2563eb' });
  }
  if (start > 1) draw('text', { x: 1, y: 23 + step * 0.7, 'font-size': 16, fill: '#000' }, start);
  return svg;
}
function renderLibrary(nearest = false) {
  if (nearest === true) nearestReference = [...state.shape];
  const view = $('library-view').value,
    exploring = view !== 'shapes',
    triads = view === 'triads',
    finder = view === 'finder';
  $('library-search').hidden = exploring;
  $('library-category').hidden = exploring;
  $('learning-controls').hidden = !exploring;
  $('family-mode').hidden = view !== 'family';
  $('finder-quality').hidden = !finder;
  $('finder-open-label').hidden = !finder;
  for (const id of ['triad-quality', 'triad-strings', 'triad-inversion', 'nearest-triad'])
    $(id).hidden = !triads;
  $('library-tip').textContent = exploring
    ? 'Choose a sounding key. Grips account for the current tuning and capo. Load a card or add it directly to your sequence.'
    : 'Familiar Shapes use Standard tuning. Loading one selects Standard. For other tunings, use Key family, Triads or Chord finder.';
  const query = $('library-search').value.trim().toLowerCase().replaceAll('♯', '#').replaceAll('♭', 'b'),
    category = $('library-category').value;
  let matches = guitarLibrary.filter(
    (item) =>
      (category === 'all' || item.category === category) &&
      `${item.title} ${item.root} ${item.category}`.toLowerCase().includes(query),
  );
  const root = $('learning-root').value;
  if (finder)
    matches = findVoicings(root, $('finder-quality').value, {
      capo: state.capo,
      tuning: state.tuning,
      openOnly: $('finder-open').checked,
    }).map((v) => ({
      shape: v.shape,
      title:
        root +
        $('finder-quality').value +
        (v.bassPc === v.rootPc ? '' : '/' + pitchName(v.bassPc, { preferFlats: state.preferFlats })),
      learningNote: `${v.source} · ${v.shape.includes(0) ? 'open strings' : 'fretted grip'}`,
    }));
  if (view === 'family')
    matches = keyFamily(root, $('family-mode').value).map((c) => ({
      title: `${c.roman} · ${c.symbol}`,
      shape: familyVoicing(c, state.capo, state.tuning),
      learningNote: c.notes.join(' · '),
    }));
  if (triads) {
    let voicings = triadVoicings(
      normalizePitchClass(root),
      $('triad-quality').value,
      Number($('triad-strings').value),
      state.capo,
      state.tuning,
    );
    if ($('triad-inversion').value !== 'all')
      voicings = voicings.filter((v) => v.inversion === Number($('triad-inversion').value));
    if (nearestReference) voicings = nearestVoicings(voicings, nearestReference);
    matches = voicings.map((v) => ({
      shape: v.shape,
      title: `${root}${$('triad-quality').value === 'minor' ? 'm' : ''} · ${['Root', '1st inv.', '2nd inv.'][v.inversion]}`,
      learningNote: `Position ${v.position} · ${v.midi.map((m) => midiToNote(m, { preferFlats: state.preferFlats })).join(' · ')}`,
    }));
  }
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  page = Math.max(0, Math.min(page, pages - 1));
  $('library-count').textContent = `${matches.length} shapes`;
  $('library-page').textContent = `${page + 1} / ${pages}`;
  $('library-prev').disabled = page === 0;
  $('library-next').disabled = page === pages - 1;
  const signature = JSON.stringify([
    view,
    query,
    category,
    page,
    pageSize,
    state.capo,
    state.tuning,
    matches,
  ]);
  if (signature !== librarySignature) {
    librarySignature = signature;
    $('library-cards').replaceChildren();
    for (const item of matches.slice(page * pageSize, (page + 1) * pageSize)) {
      const card = button(
        '',
        () => {
          const changes = { shape: [...item.shape], tuning: exploring ? state.tuning : 'standard' };
          if (item.category === 'Scales & keys')
            Object.assign(changes, {
              keyRoot: item.root,
              mapVisible: true,
              scaleType: item.id === 'key-g' ? 'major' : 'minorPentatonic',
            });
          update(changes, `${item.title} loaded${state.capo ? ` with capo ${state.capo}` : ''}.`);
        },
        `Load ${item.title}`,
      );
      card.className = 'shape-card';
      card.dataset.shape = code(item.shape);
      card.title = item.learningNote;
      const text = node('div');
      text.append(
        node('h3', item.title),
        node('p', item.learningNote),
        node('span', code(item.shape), 'shape-code'),
      );
      card.append(diagram(item.shape, item.tuning ?? (exploring ? state.tuning : 'standard')), text);
      if (exploring) {
        const wrap = node('article', undefined, 'learning-card');
        wrap.append(
          card,
          button('+ Sequence', () => appendStep(item.shape, state.capo), `Add ${item.title} to sequence`),
        );
        $('library-cards').append(wrap);
      } else $('library-cards').append(card);
    }
    if (!matches.length)
      $('library-cards').append(
        node(
          'p',
          triads
            ? 'No compact grip for this inversion in frets 0–12. Try another string set or inversion.'
            : 'No shapes found. Try a chord name or another category.',
          'saved-empty',
        ),
      );
  }
  for (const card of $('library-cards').querySelectorAll('.shape-card')) {
    const selected = card.dataset.shape === code(state.shape);
    card.classList.toggle('active', selected);
    card.setAttribute('aria-pressed', String(selected));
  }
}
function appendStep(shape, capo) {
  if (state.tab.length >= MAX_TAB) return status(`Sequence limit: ${MAX_TAB} steps.`);
  update(
    { tab: [...state.tab, { shape: [...shape], capo, tuning: state.tuning, beats: 1, strum: 'down' }] },
    'Added to sequence.',
  );
}
function cancelEdit() {
  editingId = null;
  $('shape-title').value = '';
  $('shape-note').value = '';
  $('save-note').textContent = 'Save current';
  $('cancel-edit').hidden = true;
}
function saveShape() {
  if (editingId) {
    if (!state.saved.some((s) => s.id === editingId)) {
      cancelEdit();
      return status('This entry was removed. Save a new shape instead.');
    }
    if (
      update(
        {
          saved: state.saved.map((s) =>
            s.id === editingId
              ? { ...s, title: $('shape-title').value.trim() || s.title, note: $('shape-note').value.trim() }
              : s,
          ),
        },
        'Notebook entry updated. Grip and capo kept.',
      )
    )
      cancelEdit();
    return;
  }
  if (!state.shape.some((f) => f !== 'x')) return status('Choose a note or chord before saving.');
  if (state.saved.length >= MAX_SAVED)
    return status(`Notebook limit: ${MAX_SAVED} shapes. Export and remove a shape first.`);
  const title =
    $('shape-title').value.trim() ||
    analyzeSelection(state.shape, { capo: state.capo, tuning: state.tuning, preferFlats: state.preferFlats })
      .summary;
  const item = {
    id: crypto.randomUUID(),
    title: title.slice(0, 80),
    note: $('shape-note').value.trim().slice(0, 500),
    shape: [...state.shape],
    capo: state.capo,
    tuning: state.tuning,
    preferFlats: state.preferFlats,
    createdAt: new Date().toISOString(),
  };
  if (update({ saved: [item, ...state.saved] }, `${item.title} saved locally.`)) {
    $('shape-title').value = '';
    $('shape-note').value = '';
  }
}
function filteredSaved() {
  const q = $('notebook-search').value.trim().toLowerCase();
  return state.saved.filter((s) => `${s.title} ${s.note} ${code(s.shape)}`.toLowerCase().includes(q));
}
function renderSaved() {
  const entries = filteredSaved();
  const signature = JSON.stringify(entries);
  if (signature === savedSignature) return;
  savedSignature = signature;
  const list = $('saved-cards');
  list.replaceChildren();
  if (!entries.length)
    list.append(
      node(
        'p',
        state.saved.length ? 'No matching discoveries.' : 'Keep a chord, a question, a small discovery.',
        'saved-empty',
      ),
    );
  for (const item of entries) {
    const row = node('article', undefined, 'saved-item'),
      text = node('div'),
      actions = node('div', undefined, 'actions');
    text.append(
      node('strong', item.title),
      node(
        'p',
        `${tuningName(item.tuning)} · ${code(item.shape)} · ${item.capo ? `capo ${item.capo}` : 'no capo'}${item.note ? ` · ${item.note}` : ''}`,
      ),
    );
    const load = button(
      'Load',
      () =>
        update(
          { shape: [...item.shape], capo: item.capo, tuning: item.tuning, preferFlats: item.preferFlats },
          `${item.title} restored.`,
        ),
      `Load saved ${item.title}`,
    );
    const del = button(
      'Delete',
      () =>
        update({ saved: state.saved.filter((s) => s.id !== item.id) }, 'Shape deleted. Undo restores it.'),
      `Delete saved ${item.title}`,
    );
    del.className = 'delete';
    const edit = button(
      'Edit',
      () => {
        editingId = item.id;
        $('shape-title').value = item.title;
        $('shape-note').value = item.note;
        $('save-note').textContent = 'Save edits';
        $('cancel-edit').hidden = false;
        $('shape-title').focus();
      },
      `Edit saved ${item.title}`,
    );
    const duplicate = button(
      'Duplicate',
      () => {
        if (state.saved.length >= MAX_SAVED) return status(`Notebook limit: ${MAX_SAVED} shapes.`);
        update(
          {
            saved: [
              {
                ...structuredClone(item),
                id: crypto.randomUUID(),
                title: (item.title + ' (copy)').slice(0, 80),
                createdAt: new Date().toISOString(),
              },
              ...state.saved,
            ],
          },
          'Entry duplicated.',
        );
      },
      `Duplicate saved ${item.title}`,
    );
    actions.append(load, edit, duplicate, del);
    row.append(text, actions);
    list.append(row);
  }
}
function showStudySheet() {
  const entries = filteredSaved();
  if (!entries.length) return status('Save a shape or clear your notebook search first.');
  const sheet = $('study-content');
  sheet.replaceChildren(
    node('h2', 'Guitar study sheet'),
    node('p', 'Diagrams read bass → treble · each grip keeps its own tuning and capo', 'hint'),
  );
  const grid = node('div', undefined, 'study-grid');
  for (const item of entries) {
    const card = node('article', undefined, 'study-card'),
      text = node('div');
    text.append(
      node('h3', item.title),
      node('p', `${tuningName(item.tuning)} · capo ${item.capo} · ${code(item.shape)}`),
      node(
        'p',
        analyzeSelection(item.shape, { capo: item.capo, tuning: item.tuning, preferFlats: item.preferFlats })
          .summary,
      ),
      node('p', item.note),
    );
    card.append(diagram(item.shape, item.tuning), text);
    grid.append(card);
  }
  sheet.append(grid);
  $('study-dialog').showModal();
}
function renderRecall(keepReveal = false) {
  if (!keepReveal) recallRevealed = false;
  const card = $('recall-card');
  card.replaceChildren();
  const item = recallQueue[0];
  $('recall-progress').textContent = item ? `${recallQueue.length} remaining` : 'Practice complete.';
  $('recall-reveal').hidden = !item || recallRevealed;
  $('recall-again').hidden = !item || !recallRevealed;
  $('recall-known').hidden = !item || !recallRevealed;
  if (!item) {
    card.append(node('p', 'All checked. Return whenever you want to practice again.'));
    return;
  }
  card.append(
    diagram(item.shape, item.tuning),
    node('p', `${tuningName(item.tuning)} · capo ${item.capo} · ${code(item.shape)}`),
  );
  if (recallRevealed) {
    card.append(
      node(
        'h3',
        analyzeSelection(item.shape, { capo: item.capo, tuning: item.tuning, preferFlats: item.preferFlats })
          .summary,
      ),
      node('p', item.title),
      node('p', item.note),
    );
  } else card.append(node('h3', 'What sounds here?'));
}
function renderSequence() {
  const signature = JSON.stringify([state.tab, state.preferFlats, state.songKey, state.songMode]);
  if (signature === sequenceSignature) return;
  sequenceSignature = signature;
  const container = $('sequence-steps');
  container.replaceChildren();
  if (!state.tab.length) {
    const empty = node('div', undefined, 'sequence-empty');
    empty.append(
      node('h3', 'Turn a few chords into something you can play.'),
      node('p', 'Build a progression above, or add your current grip with + Sequence.'),
    );
    container.append(empty);
  }
  state.tab.forEach((event, index) => {
    const rest = event.shape.every((f) => f === 'x'),
      name = eventName(event, { key: state.songKey, mode: state.songMode, preferFlats: state.preferFlats });
    const cell = node('article', undefined, 'sequence-step');
    cell.dataset.step = index;
    const load = button(
      '',
      () => update({ shape: [...event.shape], capo: event.capo, tuning: event.tuning }),
      `Load sequence step ${index + 1}: ${name}`,
    );
    load.className = 'step-load';
    load.append(node('span', String(index + 1), 'step-number'), node('strong', name));
    const details = node('div', undefined, 'step-meta');
    details.append(
      node(
        'span',
        `${event.beats} beat${event.beats === 1 ? '' : 's'} · capo ${event.capo}${rest ? ' · rest' : ''}`,
      ),
    );
    if (event.tuning !== 'standard') details.append(node('span', tuningName(event.tuning)));
    cell.title = `${tuningName(event.tuning)} tuning`;
    const edit = button('Edit', () => studio.editStep(index), `Edit sequence step ${index + 1}`);
    edit.className = 'step-edit';
    cell.append(load, details, edit);
    container.append(cell);
  });
}
function loadState() {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem(V4_STORAGE_KEY) ??
      localStorage.getItem(V3_STORAGE_KEY) ??
      localStorage.getItem(PREVIOUS_STORAGE_KEY) ??
      localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw === null) return defaultState();
    recoveryRaw = raw;
    const value = validateState(JSON.parse(raw));
    recoveryRaw = null;
    return value;
  } catch {
    storageBlocked = true;
    return defaultState();
  }
}
function persist() {
  if (storageBlocked) {
    status('Persistence paused to protect existing data. Export your work, then reload.');
    return false;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    status('Browser storage unavailable. This change is in memory; export to keep it.');
    return false;
  }
}
function exportBackup() {
  const raw = $('backup-json').value;
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const link = node('a');
  link.href = url;
  link.download = `guitar-${recoveryRaw ? 'recovery' : 'backup'}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  backupRequestedAt = new Date().toISOString();
  $('confirm-backup').disabled = false;
  $('backup-status').textContent = 'Download requested. Check the saved file, then confirm below.';
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status(recoveryRaw ? 'Original stored data exported for recovery.' : 'Backup download requested.');
}
async function importBackup(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (storageBlocked) return status('Import paused to protect existing data. Export and reload first.');
  if (file.size > MAX_BACKUP_BYTES) return status('Backup rejected: file exceeds 8 MB.');
  try {
    const incoming = parseBackup(await file.text()),
      merged = mergeBackup(state, incoming);
    update(merged, 'Backup merged. Existing shapes kept; Undo reverses the import.');
  } catch (error) {
    status(`Backup rejected: ${error.message}. Existing data unchanged.`);
  }
}
async function startAudio() {
  stopAudio();
  const token = playbackToken;
  audioContext ||= new AudioContext();
  await audioContext.resume();
  if (token !== playbackToken) return null;
  if (audioContext.state !== 'running')
    throw new Error('Audio could not start. Check browser audio permission.');
  $('stop-audio').disabled = false;
  await prepareSamples(audioContext, state.sound);
  if (token !== playbackToken) return null;
  audioBus = audioOutput(audioContext, state);
  $('stop-audio').disabled = false;
  return audioContext;
}
function stopAudio(announce = false) {
  playbackToken++;
  paused = false;
  if (lightFrame !== null) cancelAnimationFrame(lightFrame);
  lightFrame = null;
  noteLights = [];
  clearLights();
  revision?.stopped();
  transport?.stop();
  audioBus?.dispose();
  audioBus = null;
  studio?.onStopped();
  if (playbackPreview) {
    playbackPreview = false;
    setPreviewControls(false);
    $('fretboard').inert = false;
    renderBoard();
    renderAnalysis();
    $('capo-select').value = state.capo;
    $('tuning-select').value = state.tuning;
  }
  for (const id of timers) clearTimeout(id);
  timers.clear();
  for (const voice of voices) {
    try {
      voice.stop();
    } catch {}
  }
  voices.clear();
  document.querySelectorAll('.sequence-step.playing').forEach((el) => el.classList.remove('playing'));
  if ($('stop-audio')) $('stop-audio').disabled = true;
  if (announce) status('Playback stopped.');
}
function setPreviewControls(disabled) {
  for (const id of [
    'capo-select',
    'tuning-select',
    'fret-range',
    'hear-notes',
    'hear-chord',
    'save-shape',
    'save-note',
    'add-tab',
  ])
    $(id).disabled = disabled;
}
function schedule(midi, start, mode, duration = 5, strum = 'down', pick = null, locations = [], accent = 1) {
  return scheduleGuitar(audioContext, midi, start, {
    mode,
    duration,
    strum,
    pick,
    sound: state.sound,
    output: audioBus?.input ?? audioContext.destination,
    voices,
    accent,
    onNote: (note, index, when, finish) => {
      if (locations[index]) {
        noteLights.push({ ...locations[index], note, when, finish });
        startLights();
      }
    },
  });
}
async function playCurrent(mode) {
  const midi = pitches(state.shape, state.capo, state.tuning);
  if (!midi.length) return status('Choose a note or chord first.');
  return playMidi(midi, mode, 5, gripPath(state.shape, state.capo, state.tuning));
}
async function playMidi(midi, mode = 'chord', duration = 5, locations = []) {
  try {
    const ctx = await startAudio();
    if (!ctx) return;
    if (locations.length) {
      playbackPreview = true;
      setPreviewControls(true);
      renderBoard();
      $('fretboard').inert = true;
    }
    const end = schedule(midi, ctx.currentTime + 0.04, mode, duration, 'down', null, locations);
    status(mode === 'sequence' ? 'Playing notes in order.' : 'Playing chord.');
    later(
      () => {
        stopAudio();
        status('Playback finished.');
      },
      (end - ctx.currentTime) * 1000,
    );
  } catch (e) {
    stopAudio();
    status(`Audio unavailable: ${e.message}`);
  }
}
async function playSequence(options = {}) {
  try {
    const selectedRange = Number.isInteger(options.start)
      ? { from: options.start }
      : (revision?.range() ?? {});
    const events = expandArrangement(state.tab, selectedRange),
      repeat = Boolean(revision?.range() && !Number.isInteger(options.start)) || state.repeat;
    if (!events.length) return status('Add a shape to the sequence first.');
    const ctx = await startAudio();
    if (!ctx) return;
    let liveTempo = state.tempo,
      pass = 1;
    let active = 0;
    transport = createTransport({
      clock: () => ctx.currentTime,
      chord: (event, when, duration, hit) =>
        schedule(
          pitches(event.shape, event.capo, event.tuning),
          when,
          'chord',
          duration,
          hit.strum,
          hit.pick,
          gripPath(event.shape, event.capo, event.tuning),
          hit.accent,
        ),
      click: scheduleClick,
      onTempo: (tempo, number) => {
        liveTempo = tempo;
        pass = number;
      },
      onStep: (index, count) => {
        active = index;
        const original = index < 0 ? -1 : events[index].sourceIndex;
        document
          .querySelectorAll('.sequence-step')
          .forEach((el) => el.classList.toggle('playing', Number(el.dataset.step) === original));
        const next = index >= 0 ? (events[index + 1] ?? (repeat ? events[0] : null)) : null;
        studio?.onPlaying(original, count, events[0].sourceIndex, next?.sourceIndex ?? null);
        if (index >= 0) {
          const view = { ...state, ...events[index] };
          playbackPreview = true;
          setPreviewControls(true);
          renderBoard(view);
          renderAnalysis(view);
          $('fretboard').inert = true;
          $('capo-select').value = view.capo;
          $('tuning-select').value = view.tuning;
        }
        status(
          count
            ? `Count in: ${5 - count} / 4`
            : `Playing step ${original + 1} of ${state.tab.length}${events[index]?.section ? ' · ' + events[index].section + ' · pass ' + events[index].sectionPass : ''}.`,
        );
      },
      onBeat: (beat) => {
        studio?.onBeat(beat);
        const e = events[active];
        revision?.position(
          `${liveTempo} BPM · Pass ${pass} · Beat ${beat + 1} · Step ${(e?.sourceIndex ?? 0) + 1}`,
        );
      },
      onEnd: () => {
        stopAudio();
        status('Sequence finished.');
      },
    });
    transport.start(events, {
      tempo: state.tempo,
      repeat,
      countIn: state.countIn,
      metronome: state.metronome,
      rhythm: state.rhythm,
      pattern: state.pattern,
      ramp: state.practiceRamp,
    });
    revision?.playing();
  } catch (e) {
    stopAudio();
    status(`Audio unavailable: ${e.message}`);
  }
}
async function pauseAudio() {
  if (!transport?.running) return;
  const token = playbackToken;
  try {
    if (paused) await audioContext.resume();
    else await audioContext.suspend();
    if (token !== playbackToken) return;
    paused = audioContext.state === 'suspended';
    revision?.paused(paused);
    status(paused ? 'Paused. Resume continues at this position.' : 'Playback resumed.');
  } catch (e) {
    status('Pause unavailable: ' + e.message);
  }
}
function clearLights() {
  for (const el of document.querySelectorAll('.sounding-note')) {
    el.classList.remove('sounding-note');
    delete el.dataset.playNote;
  }
}
function startLights() {
  if (lightFrame !== null) return;
  const frame = () => {
    clearLights();
    const now = audioContext?.currentTime ?? 0;
    noteLights = noteLights.filter((n) => n.finish > now);
    for (const n of noteLights)
      if (n.when <= now)
        for (const el of document.querySelectorAll(
          `#fretboard [data-focus="fret-${n.index}-${n.fret}"],#stage-neck [data-focus="fret-${n.index}-${n.fret}"]`,
        )) {
          el.classList.add('sounding-note');
          el.dataset.playNote = pitchName(n.note % 12, { preferFlats: state.preferFlats });
        }
    lightFrame = noteLights.length ? requestAnimationFrame(frame) : null;
  };
  lightFrame = requestAnimationFrame(frame);
}
async function playPath({ kind, min, max, tempo, direction, repeat, coverage = 'six-strings' }) {
  try {
    const base =
        kind === 'scale'
          ? scalePath(state, min, max, coverage)
          : gripPath(state.shape, state.capo, state.tuning),
      path = directPath(base, direction, kind === 'scale' && coverage === 'six-strings');
    if (!path.length) throw new Error('Select a grip first.');
    const ctx = await startAudio();
    if (!ctx) return false;
    playbackPreview = true;
    setPreviewControls(true);
    renderBoard({ ...state, mapVisible: kind === 'scale' || state.mapVisible });
    $('fretboard').inert = true;
    const events = path.map((p) => ({
      shape: state.shape.map((_, i) => (i === p.index ? p.fret : 'x')),
      capo: state.capo,
      tuning: state.tuning,
      beats: 1,
      strum: 'down',
      location: p,
    }));
    let liveTempo = tempo,
      pass = 1;
    transport = createTransport({
      clock: () => ctx.currentTime,
      onTempo: (speed, number) => {
        liveTempo = speed;
        pass = number;
        revision?.position(`${speed} BPM · Pass ${number}`);
      },
      chord: (e, when, duration) =>
        schedule([e.location.midi], when, 'chord', duration * 0.9, 'down', null, [e.location]),
      click: scheduleClick,
      onStep: (i) => {
        if (i >= 0)
          status(
            `${kind === 'scale' ? 'Scale' : 'Arpeggio'} · ${midiToNote(path[i].midi)} · string ${6 - path[i].index}, fret ${path[i].fret} · ${liveTempo} BPM · pass ${pass}`,
          );
      },
      onEnd: () => {
        stopAudio();
        status('Fretboard playback finished.');
      },
    });
    transport.start(events, { tempo, repeat, rhythm: 'hold', ramp: state.practiceRamp });
    revision?.playing();
    return true;
  } catch (e) {
    stopAudio();
    status(e.message);
    return false;
  }
}
function scheduleClick(when, accent) {
  const source = audioContext.createBufferSource(),
    gain = audioContext.createGain();
  const length = Math.ceil(audioContext.sampleRate * 0.035),
    buffer = audioContext.createBuffer(1, length, audioContext.sampleRate),
    data = new Float32Array(length);
  for (let i = 0; i < length; i++)
    data[i] =
      Math.sin((2 * Math.PI * (accent ? 1400 : 1000) * i) / audioContext.sampleRate) *
      Math.exp(-i / (audioContext.sampleRate * 0.006)) *
      0.12;
  buffer.copyToChannel(data, 0);
  source.buffer = buffer;
  gain.gain.setValueAtTime(1, when);
  source.connect(gain).connect(audioBus?.input ?? audioContext.destination);
  voices.add(source);
  source.onended = () => {
    voices.delete(source);
    source.disconnect();
    gain.disconnect();
  };
  source.start(when);
  source.stop(when + 0.035);
}
