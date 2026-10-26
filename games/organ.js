/* ============================================================
   organ.js — the sound for Gallery Printshop
   ============================================================
   Two halves. The cues are a real soundtrack, cut from one
   through-composed piece into a set of loops, one per chapter.
   The effects below them -- the bell on a clear, the swell on a
   plate, the fall on a jam -- are written rather than recorded:
   a few oscillators and a delay, so there is no file to load for
   the part that has to answer instantly.

   The written organ loop is still here and still correct. It is
   what plays when a cue has not loaded, which on a slow
   connection is the first few seconds of a level.

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

/* ============================================================
   The cues
   ============================================================
   One piece of music, cut on its own sixteen second grid into
   the stretches that sound different from each other, one per
   chapter. Each loops.

   Nothing lifted out of a through-composed piece meets itself at
   the ends -- a block finishes where the next one began, not
   where it began itself -- so the laps are overlapped and
   crossfaded rather than butted together. That costs a tenth of
   a second of the phrase and buys a loop that never clicks,
   which is the right trade for something a player hears for a
   minute and a half at a time.

   Scheduled ahead like the organ above it, for the same reason:
   a setInterval firing late must not leave a hole in the sound.
   ============================================================ */

const CUE_DIR = '/games/music/';
const CUE_XF = 0.14;                // the overlap between laps
const CUE_LOOK = 0.9;               // how far ahead laps are written
const CUE_LEVEL = 0.52;             // the soundtrack sits under the effects

let cueBus = null;                  // everything musical hangs off this
let cueWant = null;                 // the cue that should be playing
let cueHave = null;                 // the one that is
let cueBuf = null;
let cueAt = 0;                      // when the next lap starts
let cueTimer = null;
let cueLive = [];                   // sources still sounding
let cueTurn = 0;                    // which request is the current one
const cueCache = new Map();         // name -> AudioBuffer, or a promise for one

function cueBuild() {
  cueBus = ctx.createGain();
  cueBus.gain.value = 0.0001;
  cueBus.connect(master);
}

async function cueLoad(name) {
  if (cueCache.has(name)) return cueCache.get(name);
  const job = (async () => {
    const r = await fetch(CUE_DIR + name + '.mp3');
    if (!r.ok) throw new Error(r.status + ' ' + name);
    return await ctx.decodeAudioData(await r.arrayBuffer());
  })().catch(() => null);
  cueCache.set(name, job);
  const buf = await job;
  cueCache.set(name, buf);
  return buf;
}

/* One lap, faded in over the tail of the one before it. */
function cueLap(at) {
  const src = ctx.createBufferSource();
  src.buffer = cueBuf;
  if (cueRate !== 1) src.playbackRate.value = cueRate;

  const g = ctx.createGain();
  const dur = cueBuf.duration / (cueRate || 1);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(1, at + CUE_XF);
  g.gain.setValueAtTime(1, at + dur - CUE_XF);
  g.gain.linearRampToValueAtTime(0.0001, at + dur);

  src.connect(g);
  g.connect(cueFx || cueBus);
  src.start(at);
  src.stop(at + dur + 0.05);
  src.onended = () => { cueLive = cueLive.filter((x) => x.src !== src); try { g.disconnect(); } catch (e) {} };
  cueLive.push({ src, g });
  return dur;
}

function cueSchedule() {
  if (!cueBuf || !ctx) return;
  while (cueAt < ctx.currentTime + CUE_LOOK) {
    const dur = cueLap(cueAt);
    cueAt += dur - CUE_XF;          // the next one starts inside this one
  }
}

function cueSilence() {
  for (const { src } of cueLive) { try { src.stop(); } catch (e) {} }
  cueLive = [];
  clearInterval(cueTimer);
  cueTimer = null;
  cueBuf = null;
  cueHave = null;
}

/* Which cue is wanted. Called whenever the game changes screen; doing
   nothing when it is already the right one is the whole point, or every
   repaint would restart the music. */
export async function setCue(name) {
  cueWant = name || null;
  const mine = ++cueTurn;                     // anything later than this wins
  if (!on || !ctx) return;
  if (cueWant === cueHave) return;
  if (!cueWant) { cueFade(0, mine); return; }

  const buf = await cueLoad(cueWant);
  if (mine !== cueTurn) return;               // somebody asked for another one meanwhile
  if (!buf) { cueHave = null; return; }       // no file, the written organ carries it
  if (!on) return;

  cueSilence();
  cueBuf = buf;
  cueHave = name;
  cueAt = ctx.currentTime + 0.06;
  cueSchedule();
  cueTimer = setInterval(cueSchedule, 200);
  cueFade(CUE_LEVEL, mine);
}

function cueFade(to, mine) {
  if (!cueBus || !ctx) return;
  const t = ctx.currentTime;
  cueBus.gain.cancelScheduledValues(t);
  cueBus.gain.setValueAtTime(Math.max(cueBus.gain.value, 0.0001), t);
  cueBus.gain.exponentialRampToValueAtTime(Math.max(to, 0.0001), t + (to > 0 ? 0.7 : 0.5));
  /* Tearing the sources down after the fade, and only if nothing has
     asked for a cue in the meantime -- otherwise the silence that
     belonged to the old one arrives on top of the new one. */
  if (to <= 0) setTimeout(() => { if (mine === cueTurn) cueSilence(); }, 600);
}

/* ---- her version of it ----
   The boss does not get music of its own. She is wearing the shop's own
   theme the way she is wearing the painting's face, so it is the same
   cue put through something: slowed, detuned, and run into a ring
   modulator and a long delay. Unpleasant enough to be wrong, not
   unpleasant enough to turn off. */
let cueRate = 1;
let cueFx = null;
let cueRing = null;

export function corrupt(onOff) {
  if (!ctx) return;
  if (onOff && !cueFx) {
    cueFx = ctx.createGain();

    // the ring, at a rate slow enough to wobble rather than buzz
    const ring = ctx.createGain();
    ring.gain.value = 0.72;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 23;
    const depth = ctx.createGain();
    depth.gain.value = 0.28;
    osc.connect(depth); depth.connect(ring.gain);
    osc.start();
    cueRing = osc;

    // a long delay, fed back, so phrases arrive on top of each other
    const dl = ctx.createDelay(1.5);
    dl.delayTime.value = 0.375;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 1600;

    // and the top taken off, which is what makes it sound broken rather
    // than merely effected
    const tilt = ctx.createBiquadFilter();
    tilt.type = 'lowshelf';
    tilt.frequency.value = 220;
    tilt.gain.value = 5;

    cueFx.connect(ring);
    ring.connect(tilt);
    tilt.connect(cueBus);
    ring.connect(dl); dl.connect(damp); damp.connect(fb); fb.connect(dl);
    damp.connect(cueBus);

    cueRate = 0.84;                           // slower, and a little lower
    cueRelap();
    return;
  }
  if (!onOff && cueFx) {
    try { cueRing.stop(); } catch (e) {}
    try { cueFx.disconnect(); } catch (e) {}
    cueFx = null; cueRing = null;
    cueRate = 1;
    cueRelap();
  }
}

/* The same cue again, through whatever the graph looks like now. */
function cueRelap() {
  if (!cueHave) return;
  const n = cueHave;
  cueHave = null;
  setCue(n);
}

/* The end of the game, which is the one piece of music allowed to finish
   rather than loop: the loudest stretch of the piece, then the collapse
   the piece itself ends on, then nothing. */
export async function ending() {
  if (!on || !ctx) return;
  const mine = ++cueTurn;
  cueSilence();
  cueWant = null;

  const [a, b] = await Promise.all([cueLoad('win'), cueLoad('tail')]);
  if (mine !== cueTurn || !on || !ctx || !a) return;

  cueFade(CUE_LEVEL, mine);
  let at = ctx.currentTime + 0.06;
  for (const buf of [a, b]) {
    if (!buf) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(1, at + CUE_XF);
    src.connect(g); g.connect(cueBus);
    src.start(at);
    cueLive.push({ src, g });
    at += buf.duration - CUE_XF;
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
    cueBuild();
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
  if (!on) { cueTurn++; cueSilence(); }
  else if (cueWant && !cueHave) setCue(cueWant);
}

export function startMusic() {
  if (!on || !ctx) return;
  /* Whatever screen the game is on asked for a cue; this is the moment it
     is allowed to sound. If the file has not arrived the written organ
     plays instead, so there is never a silent level. */
  if (cueWant) setCue(cueWant);
  if (timer || cueHave) return;
  nextAt = ctx.currentTime + 0.1;
  timer = setInterval(schedule, 40);
}

export function stopMusic() {
  clearInterval(timer);
  timer = null;
  /* The cue is not stopped here. It follows the screen, through setCue,
     and a pause is still the same level -- fading it out and straight
     back in on resume was a dip in the middle of nothing happening. */
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
