import { tuningName } from './tunings.js';
import {
  STANDARD_TUNING,
  PITCH_NAMES_SHARP,
  PITCH_NAMES_FLAT,
  analyzeSelection,
  pitchName,
  normalizePitchClass,
} from './theory.js';
import { CHORD_TYPES, capoSuggestions, revoiceEvent } from './voicings.js';
import { PROGRESSIONS, buildProgression, eventName } from './songs.js';
import { expandArrangement, sections } from './arrangement.js';
import { RHYTHMS } from './rhythm.js';
import { MAX_SONGS, MAX_TAB, emptyShape } from './storage.js';
import { encodeMidi, encodeWav, sequenceText } from './exports.js';
import { renderSequenceAudio } from './audio-engine.js';
import { practiceDeck, checkPractice, INTERVALS } from './practice.js';
export function attachStudio({
  getState,
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
  isPlaying,
}) {
  const $ = (id) => document.getElementById(id),
    on = (id, event, fn) => $(id).addEventListener(event, fn);
  const name = (event) =>
    eventName(event, {
      key: getState().songKey,
      mode: getState().songMode,
      preferFlats: getState().preferFlats,
    });
  let editingStep = 0,
    stageIndex = 0,
    stageStart = 0,
    stageNextIndex = undefined,
    exporting = false,
    exerciseMode = 'find',
    deck = [],
    questionIndex = 0,
    firstAttempt = true,
    answered = false,
    score = 0,
    missed = [];
  const keys = [...new Set([...PITCH_NAMES_SHARP, ...PITCH_NAMES_FLAT])];
  keys.forEach((n) => $('progression-key').append(new Option(n, n)));
  for (let n = 0; n <= 12; n++) $('progression-capo').append(new Option(n ? `Fret ${n}` : 'None', n));
  CHORD_TYPES.forEach((c) => $('finder-quality').append(new Option(c.title, c.id)));
  RHYTHMS.forEach((r) => $('rhythm').append(new Option(r.title, r.id)));
  for (const [id, dialog] of [
    ['settings', 'settings'],
    ['songbook', 'songbook'],
    ['progressions', 'progressions'],
    ['sequence-tools', 'sequence-tools'],
    ['capo-lab', 'capo-lab'],
    ['step', 'step'],
  ])
    on(`${id}-close`, 'click', () => $(`${dialog}-dialog`).close());
  on('studio-settings', 'click', () => {
    $('settings-dialog').showModal();
  });
  on('volume', 'input', (e) => {
    $('volume-value').textContent = e.target.value + '%';
  });
  on('volume', 'change', (e) => update({ volume: Number(e.target.value) }));
  on('tone', 'change', (e) => update({ tone: e.target.value }));
  on('fullscreen', 'click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      status('Full screen is unavailable here. Widen the browser pane for more space.');
    }
  });
  on('rhythm', 'change', (e) =>
    update({ rhythm: e.target.value }, RHYTHMS.find((r) => r.id === e.target.value).description),
  );
  on('song-title', 'change', (e) => update({ songTitle: e.target.value.trim() }));
  on('song-note', 'change', (e) => update({ songNote: e.target.value.trim() }));
  on('save-song', 'click', () => saveSong());
  on('song-save-copy', 'click', () => saveSong(true));
  on('songbook-open', 'click', () => {
    renderSongs();
    $('songbook-dialog').showModal();
  });
  on('song-search', 'input', renderSongs);
  on('progressions-open', 'click', () => {
    $('progression-key').value = getState().songKey ?? getState().keyRoot;
    $('progression-capo').value = getState().capo;
    renderProgressions();
    $('progressions-dialog').showModal();
  });
  on('progression-key', 'change', renderProgressions);
  on('progression-capo', 'change', renderProgressions);
  on('sequence-tools', 'click', () => {
    render();
    $('sequence-tools-dialog').showModal();
  });
  on('add-rest', 'click', () => {
    const s = getState();
    if (s.tab.length >= MAX_TAB) return status(`Sequence limit: ${MAX_TAB} steps.`);
    update(
      { tab: [...s.tab, { shape: emptyShape(), capo: s.capo, tuning: s.tuning, beats: 1, strum: 'down' }] },
      'Rest added.',
    );
  });
  for (const [id, delta] of [
    ['transpose-down', -1],
    ['transpose-up', 1],
  ])
    on(id, 'click', () => {
      const s = getState();
      if (!s.tab.length) return status('Add a chord first.');
      try {
        const tab = s.tab.map((e) => revoiceEvent(e, e.capo, delta)),
          songKey = s.songKey
            ? pitchName(normalizePitchClass(s.songKey) + delta, { preferFlats: s.preferFlats })
            : null;
        update(
          { tab, songKey },
          `Transposed ${delta > 0 ? 'up' : 'down'} one semitone. Voicings may change; Undo restores them.`,
        );
      } catch (e) {
        status(e.message);
      }
    });
  on('capo-lab-open', 'click', () => {
    $('capo-lab-scope').value = getState().tab.length ? 'sequence' : 'grip';
    renderCapos();
    $('capo-lab-dialog').showModal();
  });
  on('capo-lab-scope', 'change', renderCapos);
  on('export-midi', 'click', () => exportSequence('midi'));
  on('export-wav', 'click', () => exportSequence('wav'));
  on('export-tab', 'click', () => exportSequence('tab'));
  on('copy-tab', 'click', async () => {
    try {
      await navigator.clipboard.writeText(
        sequenceText(expandArrangement(getState().tab), { ...getState(), title: getState().songTitle }),
      );
      $('export-status').textContent = 'Tab copied.';
    } catch {
      $('export-status').textContent = 'Clipboard unavailable. Use Export tab to save a text file.';
    }
  });
  on('stage-open', 'click', () => {
    if (!getState().tab.length) return status('Build a progression or add a chord first.');
    stopAudio();
    stageIndex = 0;
    stageStart = 0;
    renderStage();
    $('stage-dialog').showModal();
  });
  on('stage-close', 'click', () => $('stage-dialog').close());
  on('stage-dialog', 'close', () => stopAudio());
  on('stage-play', 'click', () => {
    stageStart = stageIndex;
    playSequence({ start: stageIndex });
  });
  on('stage-stop', 'click', () => stopAudio(true));
  for (const [id, delta] of [
    ['stage-prev', -1],
    ['stage-next', 1],
  ])
    on(id, 'click', () => {
      stopAudio();
      stageIndex = Math.max(0, Math.min(getState().tab.length - 1, stageIndex + delta));
      renderStage();
    });
  for (let i = 0; i < 4; i++) $('stage-beats').append(node('span', String(i + 1)));
  for (const mode of ['find', 'name', 'ear']) on(`practice-${mode}`, 'click', () => openExercise(mode));
  on('exercise-close', 'click', () => $('exercise-dialog').close());
  on('exercise-dialog', 'close', () => stopAudio());
  on('exercise-start', 'click', () => {
    stopAudio();
    deck = practiceDeck(exerciseMode, {
      naturals: $('exercise-naturals').checked,
      maxFret: Number($('exercise-range').value),
    });
    questionIndex = 0;
    score = 0;
    missed = [];
    $('exercise-setup').hidden = true;
    renderQuestion();
  });
  on('exercise-listen', 'click', () => {
    const q = deck[questionIndex];
    if (q?.mode === 'ear') playMidi(q.midi, 'sequence', 0.3);
  });
  on('exercise-reveal', 'click', () => {
    if (answered) return;
    firstAttempt = false;
    finishQuestion(false);
  });
  on('exercise-next', 'click', () => {
    stopAudio();
    questionIndex++;
    renderQuestion();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') stopAudio();
    if (
      e.code === 'Space' &&
      !e.repeat &&
      !e.target.closest('input,textarea,select,button,a,[contenteditable]') &&
      !document.querySelector('dialog[open]')
    ) {
      e.preventDefault();
      if (isPlaying()) stopAudio(true);
      else if (getState().tab.length) playSequence();
    }
  });
  function snapshot(s) {
    return {
      title: s.songTitle.trim() || 'Untitled sequence',
      note: s.songNote,
      key: s.songKey,
      mode: s.songMode,
      steps: structuredClone(s.tab),
      tempo: s.tempo,
      rhythm: s.rhythm,
      pattern: [...s.pattern],
    };
  }
  function saveSong(copy = false) {
    const s = getState();
    if (!s.tab.length) return status('Add a chord or build a progression first.');
    const current = copy ? null : s.songs.find((x) => x.id === s.activeSongId);
    if (!current && s.songs.length >= MAX_SONGS)
      return status(`Songbook limit: ${MAX_SONGS}. Export and remove a song first.`);
    const now = new Date().toISOString(),
      song = {
        ...snapshot(s),
        id: current?.id ?? crypto.randomUUID(),
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      };
    update(
      {
        songs: current ? s.songs.map((x) => (x.id === song.id ? song : x)) : [song, ...s.songs],
        activeSongId: song.id,
        songTitle: song.title,
      },
      `“${song.title}” saved in your songbook.`,
    );
  }
  function renderSongs() {
    const list = $('song-list'),
      s = getState(),
      q = $('song-search').value.trim().toLowerCase();
    list.replaceChildren();
    const entries = s.songs.filter((song) => `${song.title} ${song.note}`.toLowerCase().includes(q));
    if (!entries.length)
      list.append(
        node(
          'p',
          s.songs.length ? 'No matching songs.' : 'Save a named sequence to keep it here.',
          'empty-message',
        ),
      );
    for (const song of entries) {
      const card = node('article', undefined, 'song-card'),
        info = node('div'),
        actions = node('div', undefined, 'actions');
      info.append(
        node('h3', song.title),
        node(
          'p',
          `${song.steps.length} steps · ${song.tempo} BPM · ${RHYTHMS.find((r) => r.id === song.rhythm).title}`,
        ),
        node('p', song.note, 'hint'),
      );
      actions.append(
        button(
          'Load',
          () => {
            update(
              {
                tab: structuredClone(song.steps),
                tempo: song.tempo,
                rhythm: song.rhythm,
                pattern: [...song.pattern],
                songTitle: song.title,
                songNote: song.note,
                songKey: song.key,
                songMode: song.mode,
                activeSongId: song.id,
              },
              `Loaded “${song.title}”. Undo restores the previous draft.`,
            );
            $('songbook-dialog').close();
            showTool('sequence');
          },
          `Load song ${song.title}`,
        ),
        button(
          'Delete',
          () => {
            const state = getState();
            update(
              {
                songs: state.songs.filter((x) => x.id !== song.id),
                activeSongId: state.activeSongId === song.id ? null : state.activeSongId,
              },
              'Song removed. Your working sequence is kept; Undo restores the song.',
            );
          },
          `Delete song ${song.title}`,
        ),
      );
      card.append(info, actions);
      list.append(card);
    }
  }
  function renderProgressions() {
    const list = $('progression-list'),
      root = $('progression-key').value,
      capo = Number($('progression-capo').value);
    list.replaceChildren();
    for (const preset of PROGRESSIONS) {
      const built = buildProgression(preset.id, root, capo, getState().tuning),
        card = node('article', undefined, 'progression-card');
      card.append(
        node('h3', preset.title),
        node('p', preset.roman, 'progression-roman'),
        node(
          'p',
          `${built.steps
            .slice(0, 4)
            .map((e) => eventName(e, { key: built.key, mode: built.mode }))
            .join(' → ')}${built.steps.length > 4 ? ' …' : ''}`,
          'hint',
        ),
        button(
          'Use progression',
          () => {
            update(
              {
                tab: built.steps,
                songTitle: built.title,
                songNote: built.note,
                songKey: built.key,
                songMode: built.mode,
                tempo: built.tempo,
                rhythm: built.rhythm,
                activeSongId: null,
                shape: [...built.steps[0].shape],
                capo,
                keyRoot: PITCH_NAMES_SHARP[normalizePitchClass(built.key)],
                scaleType: built.mode,
              },
              'Progression ready. Play it, then save a song to keep a named copy.',
            );
            $('progressions-dialog').close();
            showTool('sequence');
          },
          `Use ${preset.title}`,
        ),
      );
      list.append(card);
    }
  }
  function renderCapos() {
    const s = getState(),
      isSequence = $('capo-lab-scope').value === 'sequence',
      events = isSequence
        ? s.tab
        : [{ shape: s.shape, capo: s.capo, tuning: s.tuning, beats: 4, strum: 'down' }],
      list = $('capo-results');
    list.replaceChildren();
    const choices = capoSuggestions(events);
    if (!choices.length)
      list.append(node('p', 'Choose a recognized chord or a sequence of chords first.', 'empty-message'));
    for (const suggestion of choices) {
      const row = node('article', undefined, 'capo-choice'),
        info = node('div');
      info.append(
        node('strong', suggestion.capo ? `Capo ${suggestion.capo}` : 'No capo'),
        node(
          'p',
          `${suggestion.openGrips} of ${suggestion.steps.length} grips use open strings · ${suggestion.steps
            .slice(0, 4)
            .map((e) => analyzeSelection(e.shape, { tuning: e.tuning }).summary)
            .join(' → ')}${suggestion.steps.length > 4 ? ' …' : ''}`,
          'hint',
        ),
      );
      row.append(
        info,
        button(
          'Use',
          () => {
            const first = suggestion.steps[0],
              changes = { shape: [...first.shape], capo: first.capo, tuning: first.tuning };
            if (isSequence) changes.tab = structuredClone(suggestion.steps);
            update(changes, 'Revoiced with the same sounding harmony. Undo restores the original grips.');
            $('capo-lab-dialog').close();
            $('sequence-tools-dialog').close();
          },
          `Use capo ${suggestion.capo}`,
        ),
      );
      list.append(row);
    }
  }
  function editStep(index) {
    editingStep = index;
    drawStep();
    $('step-dialog').showModal();
  }
  function drawStep() {
    const s = getState(),
      event = s.tab[editingStep],
      editor = $('step-editor');
    editor.replaceChildren();
    if (!event) {
      $('step-dialog').close();
      return;
    }
    $('step-heading').textContent = `Step ${editingStep + 1} · ${name(event)}`;
    const preview = node('div', undefined, 'step-preview');
    preview.append(
      diagram(event.shape, event.tuning),
      node('p', `${tuningName(event.tuning)} · capo ${event.capo} · ${event.shape.join(' ')}`),
    );
    editor.append(preview);
    const controls = node('div', undefined, 'actions');
    const change = (changes) => {
      const state = getState();
      update({ tab: state.tab.map((e, i) => (i === editingStep ? { ...e, ...changes } : e)) });
    };
    const beats = node('select');
    beats.setAttribute('aria-label', `Beats for step ${editingStep + 1}`);
    [1, 2, 4].forEach((n) => beats.append(new Option(`${n} beat${n === 1 ? '' : 's'}`, n)));
    beats.dataset.focus = 'edit-beats';
    beats.value = event.beats;
    beats.addEventListener('change', () => change({ beats: Number(beats.value) }));
    const strum = node('select');
    strum.setAttribute('aria-label', `Strum for step ${editingStep + 1}`);
    strum.append(new Option('↓ Down', 'down'), new Option('↑ Up', 'up'));
    strum.dataset.focus = 'edit-strum';
    strum.value = event.strum;
    strum.addEventListener('change', () => change({ strum: strum.value }));
    controls.append(beats, strum);
    for (const [delta, label] of [
      [-1, 'Earlier'],
      [1, 'Later'],
    ]) {
      const move = button(
        label,
        () => {
          const tab = structuredClone(getState().tab),
            next = editingStep + delta;
          [tab[editingStep], tab[next]] = [tab[next], tab[editingStep]];
          editingStep = next;
          update({ tab });
        },
        `Move step ${editingStep + 1} ${label.toLowerCase()}`,
      );
      move.disabled = editingStep + delta < 0 || editingStep + delta >= s.tab.length;
      controls.append(move);
    }
    controls.append(
      button('Duplicate', () => {
        const state = getState();
        if (state.tab.length >= MAX_TAB) return status(`Sequence limit: ${MAX_TAB}.`);
        const tab = structuredClone(state.tab);
        const duplicate = structuredClone(tab[editingStep]);
        if (duplicate.section) {
          duplicate.sectionStart = false;
          duplicate.sectionRepeats = 1;
        }
        tab.splice(editingStep + 1, 0, duplicate);
        editingStep++;
        update({ tab });
      }),
      button('Remove', () => {
        const current = getState().tab,
          group = sections(current).find((g) => editingStep >= g.start && editingStep <= g.end);
        const tab = current.filter((_, i) => i !== editingStep).map((e) => ({ ...e }));
        if (group && editingStep === group.start && group.end > group.start) {
          tab[editingStep].sectionStart = true;
          tab[editingStep].sectionRepeats = group.repeats;
        }
        editingStep = Math.max(0, Math.min(editingStep, tab.length - 1));
        update({ tab }, 'Step removed. Undo restores it.');
      }),
      button('Replace with neck', () => {
        const state = getState();
        change({ shape: [...state.shape], capo: state.capo, tuning: state.tuning });
        status('Step replaced with your current neck selection.');
      }),
    );
    editor.append(
      controls,
      node(
        'p',
        'Replace with neck uses your current selected grip and capo. Rhythm and duration are kept.',
        'hint',
      ),
    );
    document.dispatchEvent(new CustomEvent('step-editor-ready', { detail: { index: editingStep, change } }));
  }
  function download(data, type, extension, songTitle = getState().songTitle) {
    const title = (songTitle || 'guitar-study').replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'guitar-study',
      url = URL.createObjectURL(new Blob([data], { type })),
      link = node('a');
    link.href = url;
    link.download = `${title}.${extension}`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function exportSequence(format) {
    const s = structuredClone(getState());
    s.tab = expandArrangement(s.tab);
    if (!s.tab.length) {
      $('export-status').textContent = 'Add a chord first.';
      return;
    }
    if (exporting) return;
    try {
      if (format === 'midi') {
        download(encodeMidi(s.tab, { ...s, title: s.songTitle }), 'audio/midi', 'mid', s.songTitle);
        $('export-status').textContent =
          'MIDI download requested. MIDI keeps pitches and timing; tab keeps the fingering.';
      } else if (format === 'tab') {
        download(
          sequenceText(s.tab, { ...s, title: s.songTitle || 'Guitar study' }),
          'text/plain;charset=utf-8',
          'txt',
          s.songTitle,
        );
        $('export-status').textContent = 'Tab download requested.';
      } else {
        exporting = true;
        $('export-wav').disabled = true;
        $('export-status').textContent = 'Rendering local audio…';
        const buffer = await renderSequenceAudio(s.tab, s);
        download(encodeWav(buffer), 'audio/wav', 'wav', s.songTitle);
        $('export-status').textContent =
          'WAV download requested. One pass, with the selected sound and rhythm.';
      }
    } catch (e) {
      $('export-status').textContent = `Export could not finish: ${e.message}`;
    } finally {
      exporting = false;
      $('export-wav').disabled = false;
    }
  }
  function renderStage() {
    const s = getState(),
      event = s.tab[stageIndex];
    if (!event) return;
    $('stage-title').textContent = s.songTitle || 'Your sequence';
    $('stage-position').textContent = `Step ${stageIndex + 1} of ${s.tab.length}`;
    $('stage-chord').textContent = name(event);
    $('stage-chord').classList.toggle('long-name', name(event).length > 8);
    $('stage-detail').textContent =
      `${event.beats} beat${event.beats === 1 ? '' : 's'} · ${tuningName(event.tuning)} · capo ${event.capo} · ${event.shape.join(' ')}`;
    const next =
      stageNextIndex !== undefined
        ? s.tab[stageNextIndex]
        : (s.tab[stageIndex + 1] ?? (s.repeat ? s.tab[stageStart] : null));
    $('stage-next-chord').textContent = next ? name(next) : 'Finish';
    $('stage-next-detail').textContent = next ? `${next.beats} beats · capo ${next.capo}` : '';
    const board = makeBoard({ ...s, ...event, mapVisible: false });
    board.setAttribute('role', 'img');
    board.setAttribute('aria-label', `${name(event)}, capo ${event.capo}, grip ${event.shape.join(' ')}`);
    for (const b of board.querySelectorAll('button')) {
      b.tabIndex = -1;
      b.setAttribute('aria-hidden', 'true');
    }
    for (const row of board.querySelectorAll('.string-row')) {
      const fret = event.shape[6 - Number(row.dataset.string)],
        indicator = row.querySelector('.mute-string');
      indicator.textContent = fret === 'x' ? '×' : fret === 0 ? '○' : '';
      indicator.classList.add('string-indicator');
    }
    board.classList.add('readonly-neck');
    $('stage-neck').replaceChildren(board);
    $('stage-settings').textContent =
      `${s.tempo} BPM · ${RHYTHMS.find((r) => r.id === s.rhythm).title}${s.repeat ? ' · repeating' : ''}`;
    $('stage-prev').disabled = stageIndex === 0;
    $('stage-next').disabled = stageIndex === s.tab.length - 1;
  }
  function onPlaying(index, count = 0, start = 0, nextIndex = undefined) {
    stageNextIndex = nextIndex;
    stageStart = start;
    if (index >= 0) {
      stageIndex = index;
      if ($('stage-dialog').open) renderStage();
      $('sequence-position').textContent = `Step ${index + 1} / ${getState().tab.length}`;
    } else {
      if ($('stage-dialog').open) $('stage-position').textContent = `Count in · ${5 - count} of 4`;
      $('sequence-position').textContent = `Count in ${5 - count} / 4`;
    }
    $('stage-play').disabled = true;
    $('stage-stop').disabled = false;
  }
  function onStopped() {
    stageNextIndex = undefined;
    $('stage-play').disabled = false;
    $('stage-stop').disabled = true;
    $('sequence-position').textContent = '';
    [...$('stage-beats').children].forEach((el) => el.classList.remove('active'));
  }
  function onBeat(beat) {
    [...$('stage-beats').children].forEach((el, i) => el.classList.toggle('active', i === beat));
  }
  function openExercise(mode) {
    stopAudio();
    exerciseMode = mode;
    deck = [];
    $('exercise-heading').textContent = {
      find: 'Find the note',
      name: 'Name the note',
      ear: 'Train your ear',
    }[mode];
    $('exercise-setup').hidden = false;
    $('exercise-range').parentElement.hidden = mode === 'ear';
    $('exercise-naturals').parentElement.hidden = mode === 'ear';
    for (const id of ['exercise-reveal', 'exercise-next', 'exercise-listen']) $(id).hidden = true;
    for (const id of ['exercise-board', 'exercise-answers', 'exercise-progress', 'exercise-feedback'])
      $(id).replaceChildren();
    $('exercise-prompt').textContent =
      mode === 'ear'
        ? 'Listen to two ascending notes, then name the interval.'
        : 'Standard tuning, no capo. Choose a fret range to begin.';
    $('exercise-dialog').showModal();
  }
  function stringName(index) {
    return ['low E', 'A', 'D', 'G', 'B', 'high e'][index];
  }
  function renderQuestion() {
    firstAttempt = true;
    answered = false;
    for (const id of ['exercise-board', 'exercise-answers', 'exercise-feedback']) $(id).replaceChildren();
    $('exercise-next').hidden = true;
    if (questionIndex >= deck.length) {
      $('exercise-progress').textContent = 'Session complete';
      $('exercise-prompt').textContent = `${score} of ${deck.length} correct on the first try`;
      $('exercise-reveal').hidden = true;
      $('exercise-listen').hidden = true;
      $('exercise-setup').hidden = false;
      if (missed.length) {
        $('exercise-feedback').append(node('strong', 'Review these:'));
        for (const text of missed) $('exercise-feedback').append(node('p', text));
      } else $('exercise-feedback').textContent = 'Every answer correct. Try a wider range next time.';
      return;
    }
    const q = deck[questionIndex];
    $('exercise-progress').textContent =
      `Question ${questionIndex + 1} of ${deck.length}${q.mode === 'ear' ? '' : ' · no capo · frets 0–' + q.maxFret}`;
    $('exercise-reveal').hidden = false;
    $('exercise-listen').hidden = q.mode !== 'ear';
    if (q.mode === 'ear') {
      $('exercise-prompt').textContent = 'What interval do you hear?';
      for (const interval of INTERVALS)
        $('exercise-answers').append(button(interval.label, () => answerQuestion(interval.label)));
      return;
    }
    $('exercise-prompt').textContent =
      q.mode === 'find'
        ? `Find ${q.answer} on the ${stringName(q.string)} string`
        : `Name fret ${q.fret} on the ${stringName(q.string)} string`;
    const shape = emptyShape();
    if (q.mode === 'name') shape[q.string] = q.fret;
    const board = makeBoard({
      ...getState(),
      shape,
      capo: 0,
      tuning: 'standard',
      mapVisible: false,
      labelsMode: 'notes',
      flipped: false,
    });
    for (const el of board.querySelectorAll('[title]')) el.removeAttribute('title');
    for (const row of board.querySelectorAll('.string-row')) {
      const active = Number(row.dataset.string) === 6 - q.string;
      row.classList.toggle('question-string', active);
      for (const b of row.querySelectorAll('button')) {
        b.tabIndex = -1;
        b.setAttribute('aria-hidden', 'true');
        if (b.classList.contains('fret-position')) {
          const fret = Number(b.dataset.fret);
          b.setAttribute('aria-label', `Fret ${fret} on ${stringName(q.string)}`);
          if (q.mode === 'find' && active && fret <= q.maxFret) {
            b.removeAttribute('aria-hidden');
            b.tabIndex = fret === 0 ? 0 : -1;
            b.addEventListener('click', () => answerQuestion(fret));
            b.addEventListener('keydown', (e) => {
              if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                row
                  .querySelector(
                    `[data-fret="${Math.max(0, Math.min(q.maxFret, fret + (e.key === 'ArrowRight' ? 1 : -1)))}"]`,
                  )
                  ?.focus();
              }
            });
          } else b.disabled = true;
        }
      }
    }
    for (const dot of board.querySelectorAll('.note-dot')) dot.textContent = '?';
    board.dataset.range = q.maxFret;
    for (const mute of board.querySelectorAll('.mute-string')) mute.hidden = true;
    if (q.maxFret === 5) {
      for (const b of board.querySelectorAll('[data-fret]')) if (Number(b.dataset.fret) > 5) b.remove();
      [...board.querySelector('.fret-labels').children].slice(6).forEach((e) => e.remove());
      for (const grid of board.querySelectorAll('.fret-labels,.string-row,.inlay-layer'))
        grid.style.gridTemplateColumns = 'repeat(6,minmax(0,1fr))';
      for (const inlay of board.querySelectorAll('.inlay'))
        if (parseInt(inlay.style.gridColumn) > 6) inlay.remove();
    }
    board.classList.add('exercise-neck');
    $('exercise-board').append(board);
    if (q.mode === 'name') {
      board.setAttribute('role', 'img');
      board.setAttribute('aria-label', `Fret ${q.fret} on the ${stringName(q.string)} string`);
      for (const pc of $('exercise-naturals').checked
        ? [0, 2, 4, 5, 7, 9, 11]
        : Array.from({ length: 12 }, (_, i) => i))
        $('exercise-answers').append(button(pitchName(pc), () => answerQuestion(pitchName(pc))));
    }
  }
  function answerQuestion(value) {
    if (answered) return;
    const q = deck[questionIndex],
      correct = checkPractice(q, value);
    if (correct) {
      if (firstAttempt) score++;
      finishQuestion(firstAttempt);
    } else {
      firstAttempt = false;
      $('exercise-feedback').textContent =
        q.mode === 'find'
          ? `That position is ${pitchName(STANDARD_TUNING[q.string].midi + value)}. Try another fret.`
          : 'Not quite. Try again, or reveal the answer.';
      $('exercise-feedback').className = 'answer-retry';
    }
  }
  function finishQuestion(wasFirstCorrect) {
    answered = true;
    const q = deck[questionIndex],
      description =
        q.mode === 'ear'
          ? `${q.answer} · ${q.semitones} semitones`
          : `${q.answer} · ${stringName(q.string)} string, fret ${q.fret}`;
    if (!wasFirstCorrect) missed.push(description);
    $('exercise-feedback').textContent = `${wasFirstCorrect ? 'Correct. ' : ''}${description}`;
    $('exercise-feedback').className = 'answer-correct';
    $('exercise-next').hidden = false;
    $('exercise-next').textContent = questionIndex === deck.length - 1 ? 'See results' : 'Next question';
    $('exercise-reveal').hidden = true;
    for (const b of $('exercise-answers').querySelectorAll('button')) b.disabled = true;
    let marker = $('exercise-board').querySelector('.note-dot');
    if (q.mode === 'find') {
      const target = $('exercise-board').querySelector(`.question-string [data-fret="${q.fret}"]`);
      marker = node('span', q.answer, 'note-dot');
      target?.append(marker);
    }
    if (marker) marker.textContent = q.answer;
  }
  function render() {
    const s = getState();
    $('volume').value = s.volume;
    $('volume-value').textContent = s.volume + '%';
    $('tone').value = s.tone;
    $('rhythm').value = s.rhythm;
    $('song-title').value = s.songTitle;
    $('song-note').value = s.songNote;
    $('song-count').textContent = s.songs.length;
    const current = s.songs.find((x) => x.id === s.activeSongId);
    $('song-save-state').textContent = current
      ? JSON.stringify(snapshot(s)) ===
        JSON.stringify({
          title: current.title,
          note: current.note,
          key: current.key,
          mode: current.mode,
          steps: current.steps,
          tempo: current.tempo,
          rhythm: current.rhythm,
          pattern: current.pattern,
        })
        ? 'Saved song'
        : 'Song has edits'
      : 'Working draft';
    $('save-song').textContent = current ? 'Update song' : 'Save song';
    $('sequence-key-hint').textContent = s.songKey
      ? `Sounding key: ${s.songKey} ${s.songMode === 'major' ? 'major' : 'natural minor'}. Capo and transposition tools may change voicings or octaves.`
      : 'Capo and transposition tools preserve sounding harmony, with possible voicing and octave changes.';
    if ($('songbook-dialog').open) renderSongs();
    if ($('step-dialog').open) drawStep();
    if ($('stage-dialog').open) renderStage();
  }
  return { render, editStep, onPlaying, onStopped, onBeat };
}
