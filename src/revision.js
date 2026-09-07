import { tuningName, tuningStrings } from './tunings.js';
import { RHYTHMS, sequenceTimeline } from './rhythm.js';
import { sections, expandArrangement } from './arrangement.js';
import { analyzeSelection, normalizePitchClass } from './theory.js';
import { findVoicings, CHORD_TYPES } from './voicings.js';
import { eventName } from './songs.js';
export function attachRevision({
  getState,
  update,
  status,
  node,
  button,
  diagram,
  playPath,
  pauseAudio,
  stopAudio,
}) {
  const $ = (id) => document.getElementById(id),
    on = (id, event, fn) => $(id).addEventListener(event, fn);
  const fragment = document.createElement('div');
  fragment.innerHTML = `
  <dialog id="guide-dialog" aria-labelledby="guide-title"><div class="section-heading"><h2 id="guide-title">Your guitar guide</h2><button id="guide-close">Close</button></div>
  <nav class="guide-nav" aria-label="Guide topics"><a href="#guide-start">Start</a><a href="#guide-neck">Fretboard</a><a href="#guide-compose">Compose</a><a href="#guide-practice">Practice</a><a href="#guide-save">Save</a><a href="#guide-controls">Controls</a></nav>
  <section id="guide-start"><h3>Make your first piece</h3><ol><li>Open Sequence → Progressions.</li><li>Choose a key and select Use progression.</li><li>Set a comfortable tempo, then choose Playing view and Play.</li><li>Give the sequence a title and choose Save song.</li></ol></section>
  <section id="guide-neck"><h3>Read, hear and explore the neck</h3><p>The thin high e string is at the bottom by default; the bass string is at the top. Flip reverses the view. Click a fret to select it; × mutes that string. Frets count from the capo: 0 means open. Numbers in parentheses are physical frets.</p><p><strong>Tuning:</strong> choose Standard, Drop D, DADGAD, Open G, Open D or Half-step down in the top bar. This retunes the virtual guitar; tune your real instrument separately. Chord recognition, scales, generated grips and audio follow this choice. Saved grips and sequence steps remember their tuning. A sequence with different tunings needs a real-instrument retuning between those steps.</p><p><strong>Colors:</strong> each of the twelve note names has its own color. C stays the same color on every string and in every octave; C♯ and D♭ share a color because they are the same pitch. Colors stay consistent between chords and scales, and note names remain visible. A red ring marks your selected notes; a blue outer halo follows playback.</p><p>The menu beneath the neck enlarges frets 0–4, 4–8 or 8–12. Selected notes outside the view are counted in the caption and remain in your grip. Playback temporarily shows the full neck, then restores your view.</p><p>Library offers familiar Standard-tuning Shapes, Key family chords, Triads and a Chord finder. Labels switches between note names and chord degrees. Scale → Show map shows the notes in the chosen scale.</p><p>Hear scale / arpeggio opens a choice of direction, position, tempo and repeat. Scale coverage defaults to All six strings: play every scale note in your chosen fret range, string by string from bass to treble. Reverse retraces that pattern. Wider ranges repeat pitches in different positions. One octave keeps the shorter root-to-root exercise. The scale map already covers all six strings. Play arpeggio plays the selected grip one note at a time. The bright ring follows the exact string and fret; it does not change your selection.</p></section>
  <section id="guide-compose"><h3>Build and shape a composition</h3><p>Choose + Sequence to add the current grip. Edit a step to change its duration, direction or rhythm, move/copy it, or compare smoother grips from the previous chord.</p><p>Arrange lets you name a range Verse, Chorus or Bridge and repeat, copy or move whole sections. The song rhythm is the default; a step can override it. My strum pattern has eight half-beat slots: down, up, rest and accented strokes.</p><p>Loop sets a start/end range for practice. Playing view shows the current and next chord. Pause holds the exact audio position; Resume continues. Stop sound ends the run. Song sheet previews a printable arrangement with diagrams and your notes.</p></section>
  <section id="guide-practice"><h3>Practice a little at a time</h3><p>Practice → Find notes or Name notes tests the neck without a capo. Hear intervals plays two ascending notes for you to identify. Show answer helps when you are stuck; the result counts correct first attempts.</p><p>Notebook → Recall practice lets you quiz yourself on your saved discoveries. Loop a short passage and use Count in or Metronome to practice changes with your guitar. Settings → Practice speed can add 1, 2, 5 or 10 BPM every chosen number of full passes, up to a target. Enable Repeat on a sequence or scale/arpeggio, or loop a passage. Pause keeps your place; a new run starts at the original tempo. Exports keep the song tempo.</p></section>
  <section id="guide-save"><h3>Keep your work</h3><p>The working draft saves in this browser. Save song keeps a named version; Update song replaces that saved version. Notebook saves individual grips with your notes.</p><p>Settings → Back up my music (also Notebook → Export) backs up everything as JSON. Check the downloaded file, then choose I saved this backup to record a confirmation date in this browser. Requesting a download alone does not confirm it was saved. Import merges a backup. Sequence → Tools & export saves MIDI, WAV or text tab. Section repeats are included; practice loops and metronome are not. WAV export is limited to three minutes.</p><p>Different browsers and addresses have separate storage. Nothing is uploaded. Keep JSON backups before switching browsers or clearing browsing data. Credits are linked below.</p></section>
  <section id="guide-controls"><h3>Controls and shortcuts</h3><p><strong>Stop sound:</strong> ends the current playback and silences notes, repeating sequences and metronome clicks. It never deletes or clears your work. It is disabled when there is no sound to stop. Use Pause when you want to resume from the same point. <strong>Escape:</strong> stops sound and closes the active dialog. <strong>Space:</strong> plays/stops a sequence when you are outside a text field or control. On the neck, arrow keys move; Enter selects.</p><p><strong>Undo / Redo:</strong> restore up to 40 edits until reload. Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z or Ctrl+Y redoes. A new edit clears Redo; text fields keep their normal shortcuts.</p><p><strong>Note names:</strong> Sharps and Flats are alternate labels, such as C♯ and D♭, for the same pitch. They do not change tuning or sound. Key-family names follow their musical key.</p><p><strong>Sound:</strong> Acoustic and Clean electric use bundled recordings. Settings adjusts volume and tone. Playback starts only when requested.</p><p><a href="SAMPLE_CREDITS.html" target="_blank" rel="noopener">Sound and font credits</a></p></section></dialog>
  <dialog id="path-dialog" aria-labelledby="path-title"><div class="section-heading"><h2 id="path-title">Hear the fretboard</h2><button id="path-close">Close</button></div><p>Play a scale across all six strings, a short octave, or the notes in your selected grip. Watch the bright ring on the neck.</p><div class="revision-controls"><label>Scale coverage<select id="path-coverage"><option value="six-strings">All six strings</option><option value="octave">One octave</option></select></label><label>Direction<select id="path-direction"><option value="up">Forward</option><option value="down">Reverse</option><option value="both">There and back</option></select></label><label>Scale position<select id="path-range"><option value="0,4">Frets 0–4</option><option value="4,8">Frets 4–8</option><option value="8,12">Frets 8–12</option><option value="0,12">All frets</option></select></label><label>Tempo<input id="path-tempo" type="number" value="90" min="40" max="180"></label><label><input id="path-repeat" type="checkbox">Repeat</label></div><div class="actions"><button id="path-scale" class="primary">Play scale</button><button id="path-arpeggio">Play arpeggio</button></div><p class="hint">One note per beat. All six strings follows each string through the selected fret range; One octave follows pitch order. Frets are relative to the capo. Arpeggio uses only the selected grip. Stop sound ends the run.</p></dialog>
  <dialog id="arrange-dialog" aria-labelledby="arrange-title"><div class="section-heading"><h2 id="arrange-title">Arrange your piece</h2><button id="arrange-close">Close</button></div><p>Name a range of steps, then repeat or move it as a section. Undo restores every change.</p><div class="revision-controls"><label>From step<input id="section-from" type="number" min="1" value="1"></label><label>To step<input id="section-to" type="number" min="1" value="1"></label><label>Section name<input id="section-name" maxlength="40" placeholder="Verse, Chorus, Bridge…"></label><label>Plays<select id="section-repeats">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<option>${n}</option>`).join('')}</select></label><button id="section-apply">Apply section</button></div><div id="section-list"></div></dialog>
  <dialog id="pattern-dialog" aria-labelledby="pattern-title"><div class="section-heading"><h2 id="pattern-title">Your strum pattern</h2><button id="pattern-close">Close</button></div><p>Eight half-beat slots across four beats. An accent plays a little stronger. Short chords use the beginning of the pattern.</p><div id="pattern-grid"></div><button id="pattern-save" class="primary">Use this pattern</button></dialog>
  <dialog id="passage-dialog" aria-labelledby="passage-title"><div class="section-heading"><h2 id="passage-title">Loop a passage</h2><button id="passage-close">Close</button></div><div class="revision-controls"><label>From step<input id="passage-from" type="number" value="1" min="1"></label><label>To step<input id="passage-to" type="number" value="1" min="1"></label><label><input id="passage-enabled" type="checkbox">Use this range</label></div><p>Play sequence repeats this passage until Stop. This practice range is not included in exports or saved songs.</p><button id="passage-apply" class="primary">Apply range</button></dialog>`;
  // This markup is fixed application text. User content is always assigned with textContent.
  document.body.append(...fragment.children);
  const guide = button('Guide', () => $('guide-dialog').showModal());
  guide.id = 'guide-open';
  $('studio-settings').before(guide);
  for (const id of ['guide', 'path', 'arrange', 'pattern', 'passage'])
    on(id + '-close', 'click', () => $(id + '-dialog').close());
  const spelling = $('spelling-select').closest('label');
  spelling.firstChild.textContent = 'Note names';
  $('spelling-select').options[0].textContent = 'Sharps (♯)';
  $('spelling-select').options[1].textContent = 'Flats (♭)';
  $('settings-dialog')
    .querySelector('.help-copy')
    .before(
      spelling,
      node('p', 'C♯ and D♭ name the same pitch. This setting changes labels, not sound.', 'hint'),
    );
  const hear = button('Hear scale / arpeggio', () => {
    $('path-tempo').value = getState().tempo;
    $('path-dialog').showModal();
  });
  hear.id = 'hear-path';
  $('labels-mode').closest('label').after(hear);
  if (!hear.isConnected) $('fretboard').closest('.fretboard-panel').append(hear);
  for (const kind of ['scale', 'arpeggio'])
    on('path-' + kind, 'click', async () => {
      const [min, max] = $('path-range').value.split(',').map(Number);
      const tempo = Number($('path-tempo').value);
      if (!Number.isInteger(tempo) || tempo < 40 || tempo > 180)
        return status('Choose a tempo from 40 to 180 BPM.');
      const ok = await playPath({
        kind,
        coverage: $('path-coverage').value,
        min,
        max,
        tempo,
        direction: $('path-direction').value,
        repeat: $('path-repeat').checked,
      });
      if (ok) $('path-dialog').close();
    });
  for (const [id, label] of [
    ['arrange', 'Arrange'],
    ['pattern', 'Pattern'],
    ['passage', 'Loop'],
  ]) {
    const b = button(label, () => {
      render();
      $(id + '-dialog').showModal();
    });
    b.id = id + '-open';
    b.title = {
      arrange: 'Name, repeat and move sections',
      pattern: 'Edit your strum pattern',
      passage: 'Choose a passage to loop',
    }[id];
    $('sequence-tools').before(b);
  }
  const sheet = button('Song sheet', showSongSheet);
  sheet.id = 'song-sheet';
  $('export-midi').before(sheet);
  let range = null;
  on('passage-apply', 'click', () => {
    const from = Number($('passage-from').value) - 1,
      to = Number($('passage-to').value) - 1;
    if (
      $('passage-enabled').checked &&
      (!Number.isInteger(from) ||
        !Number.isInteger(to) ||
        from < 0 ||
        to < from ||
        to >= getState().tab.length)
    )
      return status('Choose a valid start and end step.');
    range = $('passage-enabled').checked ? { from, to } : null;
    stopAudio();
    $('passage-dialog').close();
    status(
      range ? `Looping steps ${from + 1}–${to + 1} on the next Play sequence.` : 'Full sequence selected.',
    );
    $('passage-open').textContent = range ? `Loop ${from + 1}–${to + 1}` : 'Loop';
  });
  on('section-apply', 'click', () => {
    const s = getState(),
      from = Number($('section-from').value) - 1,
      to = Number($('section-to').value) - 1,
      title = $('section-name').value.trim(),
      repeats = Number($('section-repeats').value);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to >= s.tab.length)
      return status('Choose a valid section range.');
    const tab = s.tab.map((e, i) =>
      i >= from && i <= to
        ? { ...e, section: title, sectionStart: i === from, sectionRepeats: i === from ? repeats : 1 }
        : e,
    );
    update({ tab }, 'Section updated. Undo restores the arrangement.');
  });
  for (let i = 0; i < 8; i++) {
    const label = node('label', `${Math.floor(i / 2) + 1}${i % 2 ? ' &' : ''}`),
      select = node('select');
    select.id = 'pattern-' + i;
    for (const [value, text] of [
      ['-', 'Rest'],
      ['d', '↓ Down'],
      ['u', '↑ Up'],
      ['D', '↓ Accent'],
      ['U', '↑ Accent'],
    ])
      select.append(new Option(text, value));
    label.append(select);
    $('pattern-grid').append(label);
  }
  on('pattern-save', 'click', () => {
    update(
      { pattern: Array.from({ length: 8 }, (_, i) => $('pattern-' + i).value), rhythm: 'custom' },
      'Custom strum pattern saved with the draft.',
    );
    $('pattern-dialog').close();
  });
  for (const target of ['play-tab', 'stage-play']) {
    const b = button('Pause', () => pauseAudio());
    b.id = target === 'play-tab' ? 'pause-audio' : 'stage-pause';
    b.disabled = true;
    $(target).after(b);
  }
  const transportStatus = node('output', '', 'transport-status');
  transportStatus.id = 'transport-position';
  $('pause-audio').after(transportStatus);
  document.addEventListener('step-editor-ready', (e) => decorateStep(e.detail.index, e.detail.change));
  function decorateStep(index, change) {
    const s = getState(),
      event = s.tab[index],
      editor = $('step-editor'),
      row = node('label', 'Rhythm');
    const select = node('select');
    select.setAttribute('aria-label', 'Step rhythm');
    select.append(new Option('Use song rhythm', ''));
    RHYTHMS.forEach((r) => select.append(new Option(r.title, r.id)));
    select.value = event.rhythm || '';
    select.onchange = () => change({ rhythm: select.value || null });
    row.append(select);
    editor.append(row);
    if (index === 0 || event.shape.every((f) => f === 'x')) return;
    const current = analyzeSelection(event.shape, { capo: event.capo, tuning: event.tuning }).chords.find(
        (c) => c.exact,
      ),
      type = current && CHORD_TYPES.find((t) => t.id === current.suffix);
    if (!type) return;
    const prev = s.tab[index - 1],
      distance = (shape) =>
        shape.reduce(
          (sum, f, i) =>
            sum +
            (typeof f === 'number' && typeof prev.shape[i] === 'number'
              ? Math.abs(f + event.capo - prev.shape[i] - prev.capo)
              : f === prev.shape[i]
                ? 0
                : 3),
          0,
        );
    const matches = findVoicings(normalizePitchClass(current.root), type.id, {
      capo: event.capo,
      tuning: event.tuning,
      bass: normalizePitchClass(current.bass),
      limit: 36,
    })
      .sort((a, b) => distance(a.shape) - distance(b.shape))
      .filter((v) => JSON.stringify(v.shape) !== JSON.stringify(event.shape))
      .slice(0, 3);
    if (!matches.length) return;
    editor.append(
      node('h3', 'Compare smoother changes'),
      node('p', 'Ranked by movement from the previous grip. Choose what feels comfortable.', 'hint'),
    );
    const choices = node('div', undefined, 'voicing-choices');
    for (const v of matches) {
      const b = button(
        v.shape.join(' '),
        () => change({ shape: [...v.shape] }),
        'Use smoother grip ' + v.shape.join(' '),
      );
      b.prepend(diagram(v.shape, event.tuning));
      choices.append(b);
    }
    editor.append(choices);
  }
  function showSongSheet() {
    const s = getState(),
      sheet = $('study-content');
    sheet.replaceChildren();
    sheet.append(
      node('h2', s.songTitle || 'Guitar song sheet'),
      node('p', `${s.tempo} BPM · ${RHYTHMS.find((r) => r.id === s.rhythm).title}`),
      node('p', s.songNote),
    );
    for (const group of sections(s.tab)) {
      const section = node('section', undefined, 'song-print-section');
      section.append(
        node(
          'h3',
          `${group.title || 'Sequence'} · play ${group.repeats} time${group.repeats === 1 ? '' : 's'}`,
        ),
      );
      const grid = node('div', undefined, 'song-print-grid');
      for (let i = group.start; i <= group.end; i++) {
        const e = s.tab[i],
          card = node('article');
        card.append(
          node('strong', `${i + 1}. ${eventName(e, { key: s.songKey, mode: s.songMode })}`),
          diagram(e.shape, e.tuning),
          node('p', `${e.beats} beats · ${tuningName(e.tuning)} · capo ${e.capo}`),
        );
        if (e.rhythm) card.append(node('p', RHYTHMS.find((r) => r.id === e.rhythm).title));
        grid.append(card);
      }
      section.append(grid);
      sheet.append(section);
    }
    $('study-dialog').showModal();
  }
  function render() {
    const s = getState();
    if (range && range.to >= s.tab.length) {
      range = null;
      $('passage-open').textContent = 'Loop';
    }
    for (const id of ['section-from', 'section-to', 'passage-from', 'passage-to'])
      $(id).max = Math.max(1, s.tab.length);
    if (!$('arrange-dialog').open) {
      $('section-from').value = 1;
      $('section-to').value = Math.max(1, s.tab.length);
    }
    if (!$('passage-dialog').open) {
      $('passage-from').value = (range?.from ?? 0) + 1;
      $('passage-to').value = (range?.to ?? s.tab.length - 1) + 1;
      $('passage-enabled').checked = !!range;
    }
    s.pattern.forEach((value, i) => ($('pattern-' + i).value = value));
    const groups = sections(s.tab);
    $('section-list').replaceChildren();
    groups.forEach((g, i) => {
      const row = node('article', undefined, 'section-row');
      row.append(
        node('strong', `${g.title || 'Sequence'} · steps ${g.start + 1}–${g.end + 1} · ×${g.repeats}`),
      );
      row.append(
        button('Edit', () => {
          $('section-name').value = g.title;
          $('section-from').value = g.start + 1;
          $('section-to').value = g.end + 1;
          $('section-repeats').value = g.repeats;
        }),
      );
      const copy = button('Copy', () => {
        const tab = structuredClone(s.tab),
          part = structuredClone(tab.slice(g.start, g.end + 1));
        part.forEach((e) => (e.section = (g.title || 'Section').slice(0, 33) + ' copy'));
        tab.splice(g.end + 1, 0, ...part);
        update({ tab }, 'Section copied.');
      });
      copy.disabled = s.tab.length + (g.end - g.start + 1) > 128;
      row.append(copy);
      for (const delta of [-1, 1]) {
        const move = button(delta < 0 ? 'Earlier' : 'Later', () => {
          const parts = groups.map((x) => s.tab.slice(x.start, x.end + 1));
          [parts[i], parts[i + delta]] = [parts[i + delta], parts[i]];
          update({ tab: parts.flat() }, 'Section moved.');
        });
        move.disabled = i + delta < 0 || i + delta >= groups.length;
        row.append(move);
      }
      $('section-list').append(row);
    });
    for (const el of document.querySelectorAll('.sequence-step')) {
      const e = s.tab[Number(el.dataset.step)];
      if (e?.section) {
        let badge = el.querySelector('.section-badge');
        if (!badge) {
          badge = node('span', undefined, 'section-badge');
          el.append(badge);
        }
        badge.textContent = e.section + (e.sectionRepeats > 1 ? ` ×${e.sectionRepeats}` : '');
      }
    }
    // A proportional-font table keeps fret columns aligned without a monospace override.
    const display = $('tab-display');
    display.replaceChildren();
    if (s.tab.length) {
      const table = node('table');
      for (const [label, get] of [
        ['Step', (_, i) => i + 1],
        ['Tuning', (e) => tuningName(e.tuning)],
        ['Capo', (e) => e.capo],
        ['Beats', (e) => e.beats],
        ...[1, 2, 3, 4, 5, 6].map((n, i) => [
          'String ' + n,
          (e) => tuningStrings(e.tuning)[5 - i].label + ' ' + e.shape[5 - i],
        ]),
      ]) {
        const tr = node('tr');
        tr.append(node('th', label));
        s.tab.forEach((e, i) => tr.append(node('td', String(get(e, i)))));
        table.append(tr);
      }
      display.append(table);
    }
  }
  return {
    render,
    range: () => range,
    paused(value) {
      for (const id of ['pause-audio', 'stage-pause']) {
        $(id).textContent = value ? 'Resume' : 'Pause';
        $(id).disabled = false;
      }
    },
    playing() {
      for (const id of ['pause-audio', 'stage-pause']) $(id).disabled = false;
    },
    stopped() {
      for (const id of ['pause-audio', 'stage-pause']) {
        $(id).disabled = true;
        $(id).textContent = 'Pause';
      }
      $('transport-position').textContent = '';
    },
    position(text) {
      $('transport-position').textContent = text;
    },
  };
}
