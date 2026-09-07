import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { analyzeSelection, midiToFrequency } from '../src/theory.js';
import { prepareSamples, sampledVoice } from '../src/samples.js';
import { gripPath } from '../src/fret-path.js';
import { expandArrangement } from '../src/arrangement.js';
import { createTransport } from '../src/transport.js';
import { scheduleGuitar, audioOutput, pitches } from '../src/audio-engine.js';
const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
function harness() {
  const stop = { disabled: true },
    messages = [],
    oscillators = [],
    timeouts = [];
  class AudioContext {
    currentTime = 10;
    state = 'suspended';
    destination = {};
    sampleRate = 44100;
    createBuffer(channels, length, sampleRate) {
      return { duration: length / sampleRate, copyToChannel() {} };
    }
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
    decodeAudioData() {
      return Promise.resolve({
        duration: 5,
        numberOfChannels: 1,
        length: 2,
        sampleRate: 44100,
        getChannelData: () => new Float32Array([0.5, 0]),
      });
    }
    createBufferSource() {
      const osc = {
        frequency: { value: 0 },
        playbackRate: { value: 1 },
        connect() {
          return { connect() {} };
        },
        disconnect() {},
        start(t) {
          this.startTime = t;
        },
        stop(t) {
          this.stopTime = t;
          this.stops = (this.stops ?? 0) + 1;
        },
      };
      oscillators.push(osc);
      return osc;
    }
    createGain() {
      return {
        gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {
          return { connect() {} };
        },
        disconnect() {},
      };
    }
    createBiquadFilter() {
      return {
        frequency: {},
        Q: {},
        connect() {
          return { connect() {} };
        },
        disconnect() {},
      };
    }
  }
  const ctx = vm.createContext({
    AudioContext,
    analyzeSelection,
    midiToFrequency,
    prepareSamples,
    sampledVoice,
    gripPath,
    expandArrangement,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    scheduleGuitar,
    audioOutput,
    pitches,
    renderBoard() {},
    renderAnalysis() {},
    createTransport: (options) =>
      createTransport({
        ...options,
        setTimer: (fn) => {
          timeouts.push({ fn });
          return timeouts.length;
        },
        clearTimer() {},
      }),
    structuredClone,
    Float32Array,
    document: { querySelectorAll: () => [] },
    $: (id) => (id === 'stop-audio' ? stop : {}),
    status: (s) => messages.push(s),
    later: (fn, ms) => timeouts.push({ fn, ms }),
    clearTimeout() {},
    state: {
      sound: 'acoustic',
      shape: [0, 2, 2, 0, 0, 0],
      capo: 0,
      tempo: 120,
      tab: [
        { shape: [0, 2, 2, 0, 0, 0], capo: 0, beats: 1, strum: 'down' },
        { shape: ['x', 3, 2, 0, 1, 0], capo: 2, beats: 2, strum: 'up' },
      ],
    },
  });
  vm.runInContext(
    'let audioContext, transport, audioBus, studio, revision, lightFrame=null, noteLights=[], paused=false, playbackPreview=false, playbackToken=0; const voices=new Set(),timers=new Set();' +
      source.slice(source.indexOf('async function startAudio()')),
    ctx,
  );
  return { ctx, stop, messages, oscillators, timeouts };
}
test('chord playback schedules correct pitches only after context resumes and Stop cancels every voice', async () => {
  const h = harness();
  await vm.runInContext("playCurrent('chord')", h.ctx);
  assert.equal(h.oscillators.length, 6);
  assert.equal(h.stop.disabled, false);
  assert.equal(h.oscillators[0].buffer, vm.runInContext('sampledVoice(audioContext,40).buffer', h.ctx));
  assert.equal(h.oscillators[0].startTime, 10.04);
  vm.runInContext('stopAudio(true)', h.ctx);
  assert.equal(h.stop.disabled, true);
  assert.ok(h.oscillators.every((o) => o.stops === 2));
  assert.equal(h.messages.at(-1), 'Playback stopped.');
});
test('Stop while AudioContext resume is pending prevents delayed playback', async () => {
  const h = harness();
  vm.runInContext(
    'AudioContext.prototype.resume=function(){return new Promise(r=>{this.release=()=>{this.state="running";r()}})}',
    h.ctx,
  );
  const pending = vm.runInContext("playCurrent('chord')", h.ctx);
  vm.runInContext('stopAudio();audioContext.release()', h.ctx);
  await pending;
  assert.equal(h.oscillators.length, 0);
  assert.equal(h.stop.disabled, true);
});
test('sequence scheduling uses tempo and each step capo', async () => {
  const h = harness();
  await vm.runInContext('playSequence()', h.ctx);
  assert.equal(h.oscillators.length, 6);
  vm.runInContext('audioContext.currentTime=10.5', h.ctx);
  h.timeouts.at(-1).fn();
  assert.equal(h.oscillators.length, 11);
  assert.ok(Math.abs(h.oscillators[6].startTime - h.oscillators[0].startTime - 0.5) < 0.0001);
  assert.equal(h.oscillators[6].buffer, vm.runInContext('sampledVoice(audioContext,66).buffer', h.ctx));
  assert.ok(h.oscillators.slice(0, 6).every((o) => o.stopTime <= 10.58));
  vm.runInContext('stopAudio()', h.ctx);
  const n = h.oscillators.length;
  h.timeouts.at(-1).fn();
  assert.equal(h.oscillators.length, n);
});
