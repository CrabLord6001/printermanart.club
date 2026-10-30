/* ============================================================
   chiptune.js — the arcade's noise
   ============================================================
   Everything here is generated in the browser with Web Audio.
   There is no audio file to host, nothing to license and nothing
   to credit, which is the whole reason for doing it this way on a
   site served off GitHub Pages.

   Sound is off until somebody turns it on. Browsers block audio
   that starts by itself anyway, and surprise music on a home page
   is how you get a closed tab. The choice is remembered.

   Nothing is created until the first time sound is switched on, so
   a visitor who leaves it off never pays for any of this.
   ============================================================ */

const STORE = 'pt-sound';

const BPM = 150;
const STEPS = 16;

/* A minor over Am - F - G - Em, with the lead staying inside the pentatonic
   so it sits right over all four chords. Numbers are MIDI notes, 0 is a rest. */
const LEAD = [69, 72, 76, 72, 74, 72, 69, 67, 69, 72, 76, 79, 76, 72, 69, 67];
const BASS = [45,  0, 45,  0, 41,  0, 41,  0, 43,  0, 43,  0, 40,  0, 40,  0];

const LOOKAHEAD = 0.12;   // seconds of audio queued ahead of the clock
const TICK = 25;          // ms between visits to the scheduler

let ctx = null;
let master = null, musicBus = null, sfxBus = null;
let timer = null, step = 0, nextAt = 0, rate = 1;
let powerKind = null, powerWarn = false;
let on = false;
let playing = false;

try { on = localStorage.getItem(STORE) === 'on'; } catch (e) { on = false; }

function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

function build() {
  if (ctx) return ctx;

  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();

  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  // The music sits well under the effects, so a blip still cuts through it.
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.15;
  musicBus.connect(master);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.34;
  sfxBus.connect(master);

  return ctx;
}

/* One note. Gain ramps are exponential, which is why they aim at a hair
   above zero rather than zero itself — an exponential ramp to 0 is not a
   thing Web Audio will do. */
function tone(bus, when, note, dur, type, peak, bendTo) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(midi(note), when);
  if (bendTo) osc.frequency.exponentialRampToValueAtTime(midi(bendTo), when + dur * 0.9);

  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(peak, when + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);

  osc.connect(gain);
  gain.connect(bus);
  osc.start(when);
  osc.stop(when + dur + 0.02);
}

function hiss(when, dur, peak) {
  const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  // Decaying white noise: a tick when it is short, a crunch when it is long.
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);

  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buf;
  gain.gain.value = peak;
  src.connect(gain);
  gain.connect(sfxBus);
  src.start(when);
}

function stepSeconds() {
  return (60 / BPM / 2) / rate;
}

function playStep(n, when) {
  const dur = stepSeconds();

  if (LEAD[n]) tone(musicBus, when, LEAD[n], dur * 0.85, 'square', 0.5);
  if (BASS[n]) tone(musicBus, when, BASS[n], dur * 1.7, 'triangle', 0.9);

  // A tick on the offbeat, which is all the percussion this needs.
  if (n % 2 === 1) hiss(when, 0.025, 0.05);

  /* A pickup's own motif, laid over the loop rather than replacing it: the
     run is still going on and the music still belongs to the run. Every
     fourth step normally, every other step once it is nearly out, so the
     thing running out is something you hear without looking down. */
  if (powerKind && n % (powerWarn ? 2 : 4) === 0) {
    const m = POWER_MOTIF[powerKind];
    const pair = m.notes[(n >> 2) % m.notes.length];
    tone(musicBus, when, pair, dur * m.hold, m.wave, m.peak, m.bend ? pair + m.bend : 0);
  }
}

/* One idea each, and nothing like the other: the magnet is a low fifth that
   drops, the way something being pulled in does, and phasing is a thin high
   note that climbs and thins out. Both sit under the lead rather than over
   it -- a sound you cannot turn off and cannot get away from for ninety
   steps has to be something you stop noticing. */
const POWER_MOTIF = {
  magnet: { notes: [45, 52, 45, 50], wave: 'triangle', peak: 0.42, hold: 1.3, bend: -5 },
  phase:  { notes: [84, 88, 91, 88], wave: 'sine',     peak: 0.26, hold: 1.1, bend: 4 }
};

function pump() {
  while (nextAt < ctx.currentTime + LOOKAHEAD) {
    playStep(step, nextAt);
    nextAt += stepSeconds();
    step = (step + 1) % STEPS;
  }
}

/* ---- what the page calls --------------------------------- */

/* Must be called from inside a click. Browsers will not let audio start any
   other way, and a context built outside a gesture starts suspended. */
export function arm() {
  if (!on) return;
  if (!build()) return;
  if (ctx.state === 'suspended') ctx.resume();
}

export function isOn() { return on; }

export function setOn(next) {
  on = !!next;
  try { localStorage.setItem(STORE, on ? 'on' : 'off'); } catch (e) {}

  if (!on) {
    stopMusic();
    if (ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
    return;
  }

  arm();
  if (ctx) master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.02);
  return on;
}

export function startMusic() {
  if (!on || playing) return;
  if (!build()) return;
  if (ctx.state === 'suspended') ctx.resume();

  playing = true;
  step = 0;
  nextAt = ctx.currentTime + 0.06;
  timer = setInterval(pump, TICK);
}

export function stopMusic() {
  playing = false;
  powerKind = null;          // nothing of the run carries on past the run
  if (timer) { clearInterval(timer); timer = null; }
}

/* The loop speeds up with the printer, so the game getting faster is
   something you hear as well as see. Capped, or it turns into a wasp. */
export function setRate(next) {
  rate = Math.max(1, Math.min(1.45, next || 1));
}

/* ---- effects --------------------------------------------- */

export function eat(sheets) {
  if (!on || !ctx) return;
  // Walks up the scale as the run goes on, then rolls over, so a long run
  // keeps feeling like it is climbing without running out of notes.
  const PENT = [69, 72, 74, 76, 79];
  const base = PENT[(sheets - 1) % PENT.length] + Math.floor((sheets - 1) / PENT.length) % 2 * 12;
  const t = ctx.currentTime;
  tone(sfxBus, t, base, 0.07, 'square', 0.5, base + 7);
  hiss(t, 0.02, 0.06);
}

export function jam() {
  if (!on || !ctx) return;
  const t = ctx.currentTime;
  tone(sfxBus, t, 57, 0.18, 'square', 0.5, 45);
  tone(sfxBus, t + 0.12, 45, 0.3, 'sawtooth', 0.4, 33);
  hiss(t + 0.1, 0.32, 0.12);
}

/* Taken. One sting each, in the same shape as its motif so the thing you
   heard on the way in is the thing that keeps going. */
export function take(kind) {
  if (!on || !ctx) return;
  const t = ctx.currentTime;
  if (kind === 'magnet') {
    [57, 64, 69].forEach((n, i) => tone(sfxBus, t + i * 0.045, n, 0.1, 'triangle', 0.5, n - 7));
    hiss(t + 0.09, 0.06, 0.07);
  } else {
    [76, 83, 88, 93].forEach((n, i) => tone(sfxBus, t + i * 0.04, n, 0.12, 'sine', 0.38, n + 5));
  }
}

/* The ink letting go of the board and coming in. Short, rising, and over
   before it lands, so it reads as the thing arriving rather than a reward
   for it having arrived -- the eat blip is already the reward. */
export function pull() {
  if (!on || !ctx) return;
  const t = ctx.currentTime;
  tone(sfxBus, t, 52, 0.16, 'triangle', 0.4, 76);
  hiss(t, 0.05, 0.05);
}

/* Which motif the loop should be carrying, and whether it is running out.
   Null for neither, which is also what the end of a run passes. */
export function setPower(kind, warn) {
  powerKind = POWER_MOTIF[kind] ? kind : null;
  powerWarn = !!warn;
}

export function begin() {
  if (!on || !ctx) return;
  const t = ctx.currentTime;
  [69, 73, 76, 81].forEach((n, i) => tone(sfxBus, t + i * 0.055, n, 0.07, 'square', 0.42));
}
