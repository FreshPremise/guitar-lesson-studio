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
  <dialog id="guide-dialog" aria-labelledby="guide-title">
    <div class="section-heading"><h2 id="guide-title">Your guitar guide</h2><button id="guide-close">Close</button></div>
    <nav class="guide-nav" aria-label="Guide topics">
      <a href="#guide-overview">Overview</a><a href="#guide-start">Quick start</a><a href="#guide-neck">Fretboard</a><a href="#guide-compose">Compose</a><a href="#guide-practice">Practice</a><a href="#guide-save">Save &amp; export</a><a href="#guide-controls">Controls</a><a href="#guide-credits">Credits</a>
    </nav>
    <div class="guide-content" tabindex="0" aria-label="Guide instructions">
      <section id="guide-overview" tabindex="-1"><h3>Explore chords. Build a piece. Practice.</h3>
        <p><strong>Guitar Lesson Studio</strong> is an interactive guitar workbench for students and players. Explore a color-coded fretboard, identify and hear chords, learn scales, compose chord sequences, and save your discoveries.</p>
        <p><strong>Get the application:</strong> <a href="https://github.com/FreshPremise/guitar-lesson-studio" target="_blank" rel="noopener noreferrer">Download Guitar Lesson Studio from GitHub</a>. The repository includes source code and installation instructions. Check the README for the current version.</p>
      </section>
      <section id="guide-start" tabindex="-1"><h3>Make your first piece</h3><ol>
        <li>Open <strong>Sequence → Progressions</strong> and choose a key.</li>
        <li>Select <strong>Use progression</strong> to add a ready-made chord sequence.</li>
        <li>Set a comfortable tempo, then choose <strong>Playing view → Play</strong>.</li>
        <li>Give your piece a title and choose <strong>Save song</strong>.</li>
      </ol></section>
      <section id="guide-neck" tabindex="-1"><h3>Read and explore the fretboard</h3>
        <h4>Select notes and read the neck</h4><ul>
          <li><strong>Click a fret</strong> to select a note. <strong>×</strong> mutes that string; <strong>0</strong> means open. The selection panel identifies the notes and chord.</li>
          <li><strong>Orientation:</strong> the thin high e string starts at the bottom; the bass string is at the top. <strong>Flip</strong> reverses the view.</li>
          <li><strong>Capo:</strong> frets count from the capo. Numbers in parentheses show physical frets. The neck stops at <strong>physical fret 24</strong>.</li>
          <li><strong>Reach higher frets:</strong> drag the scroll control beneath the neck, or choose a four-fret range up to <strong>20–24</strong>. Notes outside the view remain selected and are counted in the caption.</li>
          <li><strong>Colors:</strong> each of the twelve note names has a consistent color across strings and octaves. C♯ and D♭ share a color because they are the same pitch. A <strong>red ring</strong> marks your selection; a <strong>blue outer halo</strong> follows playback.</li>
        </ul>
        <h4>Choose a tuning and find chords</h4><ul>
          <li><strong>Tuning:</strong> Standard, Drop D, DADGAD, Open G, Open D and Half-step down are in the top bar. The virtual guitar, chord recognition, scales, generated grips and audio follow your choice. Tune your real guitar separately.</li>
          <li><strong>Saved tuning:</strong> each saved grip and sequence step remembers its tuning. Playing a mixed-tuning sequence on a real guitar requires retuning between those steps.</li>
          <li><strong>Library:</strong> explore familiar Standard-tuning Shapes, Key family chords, Triads and the Chord finder. <strong>Labels</strong> switches between note names and chord degrees.</li>
        </ul>
        <h4>Hear scales and arpeggios</h4><ul>
          <li><strong>Scale → Show map</strong> marks scale notes on all six strings.</li>
          <li><strong>Hear scale / arpeggio</strong> lets you choose direction, fret range, tempo and repeat.</li>
          <li><strong>All six strings</strong> plays each scale position in the range, from bass to treble. <strong>Reverse</strong> retraces that route. Wider ranges revisit pitches in different positions.</li>
          <li><strong>One octave</strong> is a shorter root-to-root exercise. <strong>Play arpeggio</strong> plays the notes in your selected grip.</li>
          <li><strong>Follow the light:</strong> playback scrolls to the exact string and fret without changing your selection, then restores your chosen range.</li>
        </ul>
      </section>
      <section id="guide-compose" tabindex="-1"><h3>Build and shape a composition</h3><ul>
        <li><strong>+ Sequence:</strong> add the current grip to your piece.</li>
        <li><strong>Edit a step:</strong> change its duration, strum direction or rhythm; move or copy it; compare smoother grips from the previous chord.</li>
        <li><strong>Arrange:</strong> name a range Verse, Chorus or Bridge, then repeat, copy or move whole sections.</li>
        <li><strong>Rhythm:</strong> choose a song-wide pattern or override it for one step. <strong>My strum pattern</strong> has eight half-beat slots for downstrokes, upstrokes, rests and accents.</li>
        <li><strong>Loop:</strong> repeat a selected passage for practice. <strong>Playing view</strong> shows the current and next chord.</li>
        <li><strong>Pause / Resume:</strong> hold the exact playback position and continue. <strong>Stop sound</strong> ends the run.</li>
        <li><strong>Song sheet:</strong> preview and print your arrangement with chord diagrams and notes.</li>
      </ul></section>
      <section id="guide-practice" tabindex="-1"><h3>Practice a little at a time</h3><ul>
        <li><strong>Find notes / Name notes:</strong> quiz yourself on the Standard-tuning neck without a capo.</li>
        <li><strong>Hear intervals:</strong> identify two ascending notes. <strong>Show answer</strong> helps when you are stuck; results count correct first attempts.</li>
        <li><strong>Notebook → Recall practice:</strong> review your saved discoveries.</li>
        <li><strong>Count in / Metronome:</strong> practice chord changes with a steady pulse.</li>
        <li><strong>Settings → Practice speed:</strong> add 1, 2, 5 or 10 BPM after your chosen number of full passes, up to a target. Enable Repeat on a sequence or scale/arpeggio, or loop a passage.</li>
      </ul><p><strong>Tempo behavior:</strong> Pause keeps your place; a new run starts at the original tempo. Exports keep the song tempo.</p></section>
      <section id="guide-save" tabindex="-1"><h3>Save, back up and export</h3><ul>
        <li><strong>Working draft:</strong> edits save in this browser. <strong>Save song</strong> keeps a named version; <strong>Update song</strong> replaces that saved version.</li>
        <li><strong>Notebook:</strong> save individual grips with your notes.</li>
        <li><strong>Back up everything:</strong> open <strong>Settings → Back up my music</strong> or <strong>Notebook → Export</strong> for a JSON backup.</li>
        <li><strong>Confirm your backup:</strong> check the downloaded file, then choose <strong>I saved this backup</strong>. Requesting a download alone does not confirm that it was saved.</li>
        <li><strong>Import:</strong> merge a JSON backup into this browser's collection.</li>
        <li><strong>Sequence → Tools &amp; export:</strong> save MIDI, WAV or text tab. Section repeats are included; practice loops and metronome are not. WAV export is limited to three minutes.</li>
      </ul><p><strong>Keep a backup:</strong> saved music stays in your browser and is not uploaded. Different browsers and site addresses have separate storage. Export JSON before switching browsers or clearing browsing data.</p></section>
      <section id="guide-controls" tabindex="-1"><h3>Controls, layout and shortcuts</h3>
        <h4>Make room to work</h4><ul>
          <li><strong>Resize Your selection:</strong> drag its left edge. With keyboard focus on the divider, use Left/Right to adjust and Home to reset.</li>
          <li><strong>Expand:</strong> open a larger Library, Notebook, Sequence or Practice workspace. All four tabs stay available. <strong>Restore</strong> or Escape returns to the main page.</li>
          <li><strong>Short windows:</strong> scroll the page to reach the lower workspace. On narrow screens, panels stack.</li>
        </ul>
        <h4>Playback and editing</h4><ul>
          <li><strong>Stop sound:</strong> silence notes, loops and metronome clicks without deleting your work. It is disabled when nothing is playing. Use Pause to resume from the same point.</li>
          <li><strong>Escape:</strong> stop sound and close the active dialog.</li>
          <li><strong>Space:</strong> play or stop a sequence when focus is outside a text field or control.</li>
          <li><strong>On the neck:</strong> arrow keys move between notes; Enter selects.</li>
          <li><strong>Undo / Redo:</strong> restore up to 40 edits until reload. Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z or Ctrl+Y redoes. A new edit clears Redo; text fields keep their normal shortcuts.</li>
          <li><strong>Note names:</strong> Sharps and Flats change labels, such as C♯ and D♭, without changing pitch or tuning. Key-family names follow the musical key.</li>
          <li><strong>Sound:</strong> Acoustic and Clean electric use bundled recordings. Settings adjusts volume and tone. Playback starts only when requested.</li>
        </ul>
      </section>
      <section id="guide-credits" tabindex="-1"><h3>Development, sound and font credits</h3>
        <h4>Development</h4><p>Guitar Lesson Studio was created using <strong>OpenAI Codex with ChatGPT-6 Astra</strong>.</p>
        <h4>Acoustic and clean electric guitar</h4>
        <p>Ten acoustic and fifteen electric recordings from <a href="https://github.com/nbrosowsky/tonejs-instruments" target="_blank" rel="noopener noreferrer">tonejs-instruments</a>, collected by <strong>Nicholaus P. Brosowsky</strong>. The source notes identify the <strong>University of Iowa Musical Instrument Samples</strong> for acoustic guitar and <strong>Karoryfer</strong> for electric guitar.</p>
        <ul><li><strong>License:</strong> samples are distributed under <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener noreferrer">Creative Commons Attribution 3.0</a>.</li>
          <li><strong>Source revision:</strong> <code>622c2f1c32c8cfce4158ddc3eb26e518ddef37e5</code>.</li>
          <li><strong>Processing:</strong> MP3 recordings are unchanged. During playback the app skips leading silence, adjusts level, transposes nearby pitches and applies an envelope. No endorsement is implied.</li>
          <li><strong>High acoustic notes:</strong> the highest acoustic frets transpose the D5 recording upward and can sound thinner.</li>
        </ul>
        <h4>Manrope</h4><p>Copyright 2018 The Manrope Project Authors. <strong>Manrope</strong> is bundled under the <a href="assets/fonts/OFL.txt" target="_blank" rel="noopener noreferrer">SIL Open Font License 1.1</a>. Typeface source: <a href="https://fonts.google.com/specimen/Manrope" target="_blank" rel="noopener noreferrer">Google Fonts</a>.</p>
        <p>Source notes, license files and SHA-256 hashes are retained in the downloadable source's assets folder. <strong>Sounds and fonts are served by this app</strong> without remote runtime requests.</p>
      </section>
    </div>
  </dialog>
  <dialog id="path-dialog" aria-labelledby="path-title"><div class="section-heading"><h2 id="path-title">Hear the fretboard</h2><button id="path-close">Close</button></div><p>Play a scale across all six strings, a short octave, or the notes in your selected grip. Watch the bright ring on the neck.</p><div class="revision-controls"><label>Scale coverage<select id="path-coverage"><option value="six-strings">All six strings</option><option value="octave">One octave</option></select></label><label>Direction<select id="path-direction"><option value="up">Forward</option><option value="down">Reverse</option><option value="both">There and back</option></select></label><label>Scale position<select id="path-range"><option value="0,4">Frets 0–4</option><option value="4,8">Frets 4–8</option><option value="8,12">Frets 8–12</option><option value="12,16">Frets 12–16</option><option value="16,20">Frets 16–20</option><option value="20,24">Frets 20–24</option><option value="0,24">Full neck</option></select></label><label>Tempo<input id="path-tempo" type="number" value="90" min="40" max="180"></label><label><input id="path-repeat" type="checkbox">Repeat</label></div><div class="actions"><button id="path-scale" class="primary">Play scale</button><button id="path-arpeggio">Play arpeggio</button></div><p class="hint">One note per beat. All six strings follows each string through the selected fret range; One octave follows pitch order. Frets are relative to the capo. Arpeggio uses only the selected grip. Stop sound ends the run.</p></dialog>
  <dialog id="arrange-dialog" aria-labelledby="arrange-title"><div class="section-heading"><h2 id="arrange-title">Arrange your piece</h2><button id="arrange-close">Close</button></div><p>Name a range of steps, then repeat or move it as a section. Undo restores every change.</p><div class="revision-controls"><label>From step<input id="section-from" type="number" min="1" value="1"></label><label>To step<input id="section-to" type="number" min="1" value="1"></label><label>Section name<input id="section-name" maxlength="40" placeholder="Verse, Chorus, Bridge…"></label><label>Plays<select id="section-repeats">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<option>${n}</option>`).join('')}</select></label><button id="section-apply">Apply section</button></div><div id="section-list"></div></dialog>
  <dialog id="pattern-dialog" aria-labelledby="pattern-title"><div class="section-heading"><h2 id="pattern-title">Your strum pattern</h2><button id="pattern-close">Close</button></div><p>Eight half-beat slots across four beats. An accent plays a little stronger. Short chords use the beginning of the pattern.</p><div id="pattern-grid"></div><button id="pattern-save" class="primary">Use this pattern</button></dialog>
  <dialog id="passage-dialog" aria-labelledby="passage-title"><div class="section-heading"><h2 id="passage-title">Loop a passage</h2><button id="passage-close">Close</button></div><div class="revision-controls"><label>From step<input id="passage-from" type="number" value="1" min="1"></label><label>To step<input id="passage-to" type="number" value="1" min="1"></label><label><input id="passage-enabled" type="checkbox">Use this range</label></div><p>Play sequence repeats this passage until Stop. This practice range is not included in exports or saved songs.</p><button id="passage-apply" class="primary">Apply range</button></dialog>`;
  // This markup is fixed application text. User content is always assigned with textContent.
  document.body.append(...fragment.children);
  const guide = button('Guide', () => {
    $('guide-dialog').showModal();
    document.querySelector('.guide-content').scrollTop = 0;
  });
  document.querySelector('.guide-nav').addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;
    const target = $(link.hash.slice(1));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ block: 'start' });
    target.focus({ preventScroll: true });
  });
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
