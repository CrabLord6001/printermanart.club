/* ============================================================
   organ.js — the music for Color Processor
   ============================================================
   Written rather than recorded: a few oscillators and a delay,
   so there is no file to load, nothing to credit, and no licence
   to honor. Paper Trail has its chiptune; this is the other
   machine, and the other mood.

   D minor, slow, with an organ holding the chords, a pedal note
   underneath and a plucked line on top -- close enough to a
   chapel to suit a room full of Fra Angelico and Bruegel, and
   far enough from one to not be solemn about it.

   The loop is eight bars and never repeats exactly: the plucked
   line walks its own path through the chord each time round.
   ============================================================ */

let ctx = null;
let on = false;
let master = null, voice = null, wet = null;
let timer = null, nextAt = 0, step = 0;

const BPM = 80;
const BEAT = 60 / BPM;              // one beat in seconds
const SUB = BEAT / 2;               // the plucked line runs in eighths
const LOOK = 0.12;                  // how far ahead the scheduler writes

/* D minor. Each bar names the chord's notes as semitones from D. */
const D = 146.83;                   // D3
const semi = (n) => D * Math.pow(2, n / 12);

const BARS = [
  { root: 0,  chord: [0, 3, 7] },          // Dm
  { root: 0,  chord: [0, 3, 7] },          // Dm
  { root: 5,  chord: [5, 8, 12] },         // Gm
  { root: 0,  chord: [0, 3, 7] },          // Dm
  { root: -2, chord: [-2, 2, 5] },         // Bb
  { root: -7, chord: [-7, -3, 0] },        // F
  { root: 7,  chord: [7, 11, 14] },        // A, with the leading tone
  { root: 7,  chord: [7, 11, 14] }         // A
];

const STEPS_PER_BAR = 8;            // eighths
const LOOP = BARS.length * STEPS_PER_BAR;

/* ---- plumbing ---- */

function build() {
  master = ctx.createGain();
  master.gain.value = 0.0001;
  master.connect(ctx.destination);

  // A short feedback delay standing in for a stone room. Cheaper than a
  // convolver and it does not need an impulse file.
  const delay = ctx.createDelay(1.2);
  delay.delayTime.value = 0.26;
  const fb = ctx.createGain();
  fb.gain.value = 0.34;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 2200;

  wet = ctx.createGain();
  wet.gain.value = 0.3;

  delay.connect(damp); damp.connect(fb); fb.connect(delay);
  delay.connect(wet); wet.connect(master);

  voice = ctx.createGain();
  voice.gain.value = 1;
  voice.connect(master);
  voice.connect(delay);
}

/* One note. The organ stops are stacked by hand: the note, its octave and
   its twelfth, which is roughly what a small pipe organ gives you. */
function pipe(at, hz, dur, level, kind) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.connect(voice);

  const stops = kind === 'pluck' ? [[1, 1], [2, 0.3], [3, 0.12]]
              : kind === 'pedal' ? [[1, 1], [2, 0.22]]
              :                    [[1, 1], [2, 0.42], [3, 0.2], [4, 0.1]];

  for (const [mult, amp] of stops) {
    const o = ctx.createOscillator();
    o.type = kind === 'pluck' ? 'triangle' : 'sine';
    o.frequency.value = hz * mult;
    // a hair of detune keeps it from sounding like a test tone
    o.detune.value = (mult - 1) * 4;
    const og = ctx.createGain();
    og.gain.value = amp;
    o.connect(og); og.connect(g);
    o.start(at);
    o.stop(at + dur + 0.4);
  }

  if (kind === 'pluck') {
    g.gain.linearRampToValueAtTime(level, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  } else {
    g.gain.linearRampToValueAtTime(level, at + 0.28);      // slow swell
    g.gain.setValueAtTime(level, at + dur - 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  }
}

/* ---- the loop ---- */

function schedule() {
  while (nextAt < ctx.currentTime + LOOK) {
    const s = step % LOOP;
    const bar = BARS[Math.floor(s / STEPS_PER_BAR)];
    const beat = s % STEPS_PER_BAR;

    if (beat === 0) {
      // the chord, held for the whole bar
      for (const n of bar.chord) pipe(nextAt, semi(n), BEAT * 4 - 0.05, 0.055, 'organ');
      // and the pedal, an octave and a half below
      pipe(nextAt, semi(bar.root) / 2, BEAT * 4 - 0.05, 0.085, 'pedal');
    }

    // A second voice inside the bar, so a held chord is not the only thing
    // happening for three and a half seconds.
    if (beat === 4) {
      for (const n of bar.chord) pipe(nextAt, semi(n + 12), BEAT * 2 - 0.05, 0.028, 'organ');
    }

    // the plucked line: chord tones, wandering, never the same way twice
    if (beat % 2 === 0 || Math.random() < 0.6) {
      const tone = bar.chord[(Math.random() * bar.chord.length) | 0];
      const up = Math.random() < 0.55 ? 12 : 24;
      pipe(nextAt, semi(tone + up), SUB * 2.4, 0.03, 'pluck');
    }

    nextAt += SUB;
    step++;
  }
}

/* ---- what the page calls ---- */

export function arm() {
  // Browsers will not start audio outside a gesture, so this is called from
  // the click that turns the sound on.
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    build();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function isOn() { return on; }

export function setOn(next) {
  on = !!next;
  if (on) arm();
  if (!master) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), t);
  master.gain.exponentialRampToValueAtTime(on ? 0.9 : 0.0001, t + 0.3);
}

export function startMusic() {
  if (!on || !ctx || timer) return;
  nextAt = ctx.currentTime + 0.1;
  timer = setInterval(schedule, 40);
}

export function stopMusic() {
  clearInterval(timer);
  timer = null;
}

/* A clump going: a bell, rising with the chain so a long one audibly
   climbs. */
export function clear(chain) {
  if (!on || !ctx) return;
  const n = [0, 3, 7, 10, 12, 15, 19, 22][Math.min(chain, 7)];
  pipe(ctx.currentTime, semi(n + 24), 0.5, 0.05, 'pluck');
  if (chain > 1) pipe(ctx.currentTime + 0.06, semi(n + 31), 0.4, 0.035, 'pluck');
}

/* A plate landing: the chord swells underneath. */
export function lay() {
  if (!on || !ctx) return;
  const t = ctx.currentTime;
  for (const n of [0, 7, 12]) pipe(t, semi(n) / 2, 1.6, 0.06, 'organ');
}

/* The page jams. The leading tone, unresolved, falling away. */
export function jam() {
  if (!on || !ctx) return;
  const t = ctx.currentTime;
  for (const n of [11, 5, 2]) pipe(t, semi(n) / 2, 2.4, 0.07, 'organ');
  pipe(t + 0.1, semi(1) / 2, 2.6, 0.05, 'pedal');
}

/* The print finishes: the chord resolves up to the major, which is the
   oldest trick there is and still works. */
export function done() {
  if (!on || !ctx) return;
  const t = ctx.currentTime;
  [0, 4, 7, 12].forEach((n, i) => pipe(t + i * 0.09, semi(n), 2.8, 0.07, 'organ'));
  pipe(t, semi(0) / 2, 3, 0.09, 'pedal');
}
