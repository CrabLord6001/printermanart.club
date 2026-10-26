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

/* The two halves of the crossfade, built once. Sine up and cosine down:
   their squares sum to one at every point, so the power through the join
   stays level even though the two sides are unrelated music. */
const XF_STEPS = 65;
const XF_UP = new Float32Array(XF_STEPS);
const XF_DOWN = new Float32Array(XF_STEPS);
for (let i = 0; i < XF_STEPS; i++) {
  const t = (i / (XF_STEPS - 1)) * (Math.PI / 2);
  XF_UP[i] = Math.max(0.0001, Math.sin(t));
  XF_DOWN[i] = Math.max(0.0001, Math.cos(t));
}
const CUE_LOOK = 0.9;               // how far ahead laps are written
const CUE_LEVEL = 0.52;             // the soundtrack sits under the effects

let cueBus = null;                  // everything musical hangs off this
let cueDuck = null;                 // which steps back while she speaks
let cueFaint = false;               // or sits right down, under her intro
let voiceBus = null;                // her lines, which the music does not scale
let cueWant = null;                 // the cue that should be playing
let cueHave = null;                 // the one that is
let cueBuf = null;
let cueAt = 0;                      // when the next lap starts
let cueTimer = null;
let cueLive = [];                   // sources still sounding
let cueTurn = 0;                    // which request is the current one
const cueCache = new Map();         // name -> AudioBuffer, or a promise for one

function cueBuild() {
  /* Her lines hang off the master rather than off the music, so the
     level the track is playing at cannot quietly decide how loud she
     is -- and ducking the track cannot duck her with it. */
  voiceBus = ctx.createGain();
  voiceBus.gain.value = 0.62;
  voiceBus.connect(master);

  cueDuck = ctx.createGain();
  cueDuck.gain.value = 1;
  cueDuck.connect(master);
  cueBus = ctx.createGain();
  cueBus.gain.value = 0.0001;
  cueBus.connect(cueDuck);
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
  /* Equal power, not a straight line. A lap meets itself at the seam, and
     the two ends are different music -- so their levels do not add, they
     add in power. Two straight ramps crossing at a half each leave a
     noticeable dip in the middle of the join; sine and cosine cross at
     about .71 and hold the power flat. Worth up to 3 dB at every loop in
     the game, which is the difference between a lap and an audible seam. */
  g.gain.setValueAtTime(0.0001, at);
  g.gain.setValueCurveAtTime(XF_UP, at, CUE_XF);
  g.gain.setValueAtTime(1, at + CUE_XF);
  g.gain.setValueCurveAtTime(XF_DOWN, at + dur - CUE_XF, CUE_XF);

  src.connect(g);
  g.connect(cueFx || cueBus);
  src.start(at);
  src.stop(at + dur + 0.05);
  src.onended = () => { cueLive = cueLive.filter((x) => x.src !== src); try { g.disconnect(); } catch (e) {} };
  cueLive.push({ src, g });
  return dur;
}

/* ---- the remix ----
   Her stage does not get the cue straight. It gets it a bar at a time,
   and each bar is handed one of a few treatments: left alone, played
   backwards, halved, doubled, stuttered, or dropped. The slot is always
   one bar wide whatever happens inside it, so the groove holds and the
   thing stays danceable rather than becoming noise -- which was the one
   condition he set on it.

   Half the bars are left alone on purpose. A remix that mangles
   everything stops being a remix of anything. */
const BAR = 2.786;                  // The Clockwork Ledger is 86 BPM in four

/* Her stage runs the title piece from four bars in, and laps back to
   there rather than to the top. The piece opens with eleven seconds of
   sparse, quiet music -- right for the screen the game opens on, wrong
   for the last level, which began on almost nothing and fell back into
   it every lap. What is left is the forty-odd seconds of it that are
   actually playing. The bar count still runs from zero, because her
   first line is owed to the third bar of the level, not of the tape. */
const BOSS_IN = 4;
let cueBar = 0;
let lastFault = -99;            // how long since the tape last misbehaved
let cueRev = null;                  // the same buffer, backwards
let cueSeed = 1;

function rnd() {
  cueSeed = (cueSeed * 1664525 + 1013904223) >>> 0;
  return cueSeed / 4294967296;
}

function reverseOf(buf) {
  const out = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const from = buf.getChannelData(c), to = out.getChannelData(c);
    for (let i = 0, n = buf.length; i < n; i++) to[i] = from[n - 1 - i];
  }
  return out;
}

/* One source, started at `at`, reading `len` seconds from `off`, filling
   `slot` seconds of the bar. */
function cuePiece(at, buf, off, len, slot, rate, fade) {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  const f = fade === undefined ? 0.012 : fade;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(1, at + f);
  g.gain.setValueAtTime(1, at + slot - f);
  g.gain.linearRampToValueAtTime(0.0001, at + slot);
  src.connect(g);
  g.connect(cueFx || cueBus);
  src.start(at, Math.max(0, off), Math.max(0.02, len));
  src.stop(at + slot + 0.03);
  src.onended = () => { cueLive = cueLive.filter((x) => x.src !== src); try { g.disconnect(); } catch (e) {} };
  cueLive.push({ src, g });
}

/* ---- her, over the top of it ----
   She is not narrating the level; she is losing hold of it. Every so
   often a line of her taunt comes through the track itself, on the bar,
   sometimes backwards -- the same thing happening to her voice that is
   happening to her music.

   One file and a table of offsets rather than five fetches, and it only
   loads on the one stage that uses it. */
const STABS = '/games/voice/asil-stabs';
let stabBuf = null, stabRev = null, stabAt = null, stabJob = null;
let stabLast = -1;

async function stabLoad() {
  if (stabBuf) return true;
  if (stabJob) return stabJob;
  stabJob = (async () => {
    try {
      const [a, t] = await Promise.all([
        fetch(STABS + '.mp3').then((r) => r.ok ? r.arrayBuffer() : Promise.reject()),
        fetch(STABS + '.json').then((r) => r.ok ? r.json() : Promise.reject())
      ]);
      stabBuf = await ctx.decodeAudioData(a);
      stabRev = reverseOf(stabBuf);
      stabAt = t;
      return true;
    } catch (e) { return false; }   // no lines, same level
  })();
  return stabJob;
}

function stabFire(at) {
  if (cueFaint) return;                         // she is speaking; she does not need quoting
  if (!stabBuf || !stabAt || !stabAt.length) return;
  let i = (rnd() * stabAt.length) | 0;
  if (i === stabLast) i = (i + 1) % stabAt.length;   // not the same one twice running
  stabLast = i;
  const cut = stabAt[i];
  const back = rnd() < 0.22;

  /* Backwards means reading a reversed copy from the mirrored offset.
     A negative playback rate is not a thing Web Audio will do. */
  const src = ctx.createBufferSource();
  src.buffer = back ? stabRev : stabBuf;
  const off = back ? (stabBuf.duration - cut.at - cut.dur) : cut.at;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(1, at + 0.01);
  g.gain.setValueAtTime(1, at + cut.dur - 0.05);
  g.gain.linearRampToValueAtTime(0.0001, at + cut.dur);

  src.connect(g);
  /* Over the music rather than through the same mangling. She is already
     a voice that does not work; putting her through the ring modulator
     as well only makes her hard to make out. */
  g.connect(voiceBus || cueBus);

  /* And the track steps back for the length of the line. Her voice over
     the top of its own remix was a voice you could hear was there and
     not make out, which is worse than not having it. */
  const d = cueDuck;
  if (d) {
    d.gain.cancelScheduledValues(at);
    d.gain.setValueAtTime(Math.max(d.gain.value, 0.0001), at);
    d.gain.linearRampToValueAtTime(0.26, at + 0.08);
    d.gain.setValueAtTime(0.26, at + cut.dur - 0.08);
    d.gain.linearRampToValueAtTime(1, at + cut.dur + 0.55);
  }

  try { src.start(at, Math.max(0, off), cut.dur); } catch (e) { return; }
  src.stop(at + cut.dur + 0.05);
  src.onended = () => { cueLive = cueLive.filter((x) => x.src !== src); try { g.disconnect(); } catch (e) {} };
  cueLive.push({ src, g });
}

function cueRemixBar(at) {
  const bars = Math.max(1, Math.round(cueBuf.duration / BAR));
  const span = Math.max(1, bars - BOSS_IN);
  const n = BOSS_IN + (cueBar % span);
  const off = n * BAR;

  /* Wow: the slow drift of a tape that is not quite running true. Under
     half a percent, always there, never the thing you notice -- it is
     what makes the rest read as a tape fault rather than a bug. */
  const wow = 1 + 0.004 * Math.sin(cueBar * 0.63) + 0.002 * Math.sin(cueBar * 1.7);

  /* Faults are spaced rather than rolled. Pure chance clusters, and three
     in a row stops sounding like damage and starts sounding broken --
     which is what went wrong the first time. At least three clean bars
     between any two, so what lands is heard as one event. */
  const clear = cueBar - lastFault >= 4;
  const pick = clear && rnd() < 0.45 ? rnd() : -1;
  let slot = BAR / wow;

  if (pick < 0) {                                       // as written, and most of it is
    cuePiece(at, cueBuf, off, BAR, slot, wow);

  } else if (pick < 0.30) {                             // the oxide has shed: a hole
    const gap = 0.05 + rnd() * 0.07;                    // 50 to 120 ms
    const when = BAR * (0.25 + rnd() * 0.4);
    cuePiece(at, cueBuf, off, when, when, wow);
    cuePiece(at + when + gap, cueBuf, off + when + gap, BAR - when - gap, BAR - when - gap, wow);
    lastFault = cueBar;

  } else if (pick < 0.52) {                             // a note simply missing
    const gap = 0.018 + rnd() * 0.035;                  // under 55 ms
    const when = BAR * (0.2 + rnd() * 0.55);
    cuePiece(at, cueBuf, off, when, when, wow);
    cuePiece(at + when + gap, cueBuf, off + when + gap, BAR - when - gap, BAR - when - gap, wow);
    lastFault = cueBar;

  } else if (pick < 0.72) {                             // the capstan sags and recovers
    const sag = 0.93 + rnd() * 0.04;
    slot = BAR / sag;
    cuePiece(at, cueBuf, off, BAR, slot, sag);
    lastFault = cueBar;

  } else if (pick < 0.88 && cueRev) {                   // a quarter of it runs backwards
    const part = BAR / 4;
    cuePiece(at, cueBuf, off, BAR - part, BAR - part, wow);
    const mirror = Math.max(0, cueBuf.duration - (off + BAR));
    cuePiece(at + BAR - part, cueRev, mirror, part, part, 1);
    lastFault = cueBar;

  } else {                                              // the head catches and repeats
    const bit = BAR / 8;
    cuePiece(at, cueBuf, off, BAR - bit * 2, BAR - bit * 2, wow);
    for (let k = 0; k < 2; k++) {
      cuePiece(at + BAR - bit * 2 + k * bit, cueBuf, off + BAR - bit * 2, bit, bit, 1, 0.005);
    }
    lastFault = cueBar;
  }

  cueBar += 1;

  /* She comes through the track early and often. At one bar in eight,
     starting after the eighth, a run that ends in twenty seconds heard
     her not at all -- and most runs on this level end in twenty
     seconds. The third bar is hers by right; after that it is one in
     four, which is about every eleven seconds. */
  if (cueBar === 3 || (cueBar > 3 && rnd() < 0.25)) stabFire(at);

  return slot;
}

function cueSchedule() {
  if (!cueBuf || !ctx) return;
  while (cueAt < ctx.currentTime + CUE_LOOK) {
    if (cueFx) { cueAt += cueRemixBar(cueAt); continue; }
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
  cueRev = null;
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
  cueRev = cueFx ? reverseOf(buf) : null;
  cueBar = 0;
  cueSeed = 1;
  cueHave = name;
  cueAt = ctx.currentTime + 0.06;
  cueSchedule();
  cueTimer = setInterval(cueSchedule, 200);
  cueFade(CUE_LEVEL, mine);

  /* The written organ stands down, now that there is a real cue to carry
     the level. It is the understudy: it plays when the file has not
     arrived, or has not been cut for this screen, and it stops the moment
     the recording starts.

     It did not stop before, and the two played over each other. The guard
     in startMusic tests cueHave, which is only set down here -- and
     getting here means waiting for the file, so by the time the answer is
     true the organ has already been started on the strength of it being
     false. A flag set after an await cannot hold a gate that was tested
     before it. */
  clearInterval(timer);
  timer = null;
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
let cueFxNodes = [];

/* A room to play it in, built rather than loaded: white noise with an
   exponential tail is a plain hall, and a plain hall is all this needs.
   No impulse file to fetch for something only one level ever hears. */
function hall(seconds, decay) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
  }
  return buf;
}

/* A soft knee rather than a hard one. Hard clipping on music is a buzz;
   this leans on it and lets it come back. */
function bendCurve(k) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    c[i] = (1 + k) * x / (1 + k * Math.abs(x));
  }
  return c;
}

/* Her intro plays the stage's own music, but a long way down: enough to
   be the room she is standing in, not enough to argue with her. */
export function under(on) {
  cueFaint = !!on;
  if (!cueDuck || !ctx) return;
  const t = ctx.currentTime;
  cueDuck.gain.cancelScheduledValues(t);
  cueDuck.gain.setValueAtTime(Math.max(cueDuck.gain.value, 0.0001), t);
  cueDuck.gain.exponentialRampToValueAtTime(cueFaint ? 0.17 : 1, t + 0.6);
}

export function corrupt(onOff) {
  if (!ctx) return;

  /* The backwards copy is made here as well as in setCue. The boss asks
     for its cue before it asks for the corruption -- the level is not
     running yet at the moment the screen changes -- so by the time the
     remix wanted a reversed buffer there was none, and reaching for it
     threw inside the scheduler. A source with a null buffer does not
     fail quietly: it takes the whole scheduling tick with it, the bar is
     never laid down, and what was already queued simply runs out. That
     was the ten seconds of silence on her stage. */
  if (onOff && cueBuf && !cueRev) {
    try { cueRev = reverseOf(cueBuf); } catch (e) { cueRev = null; }
  }

  if (onOff && !cueFx) {
    cueFx = ctx.createGain();

    // the ring, slow enough to wobble rather than buzz
    const ring = ctx.createGain();
    ring.gain.value = 0.88;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 23;
    const depth = ctx.createGain();
    depth.gain.value = 0.12;
    osc.connect(depth); depth.connect(ring.gain);
    osc.start();
    cueRing = osc;

    // the bend
    const bend = ctx.createWaveShaper();
    bend.curve = bendCurve(1.1);
    bend.oversample = '2x';

    // the top taken off, which is what makes it sound broken rather than
    // merely effected
    const tilt = ctx.createBiquadFilter();
    tilt.type = 'lowshelf';
    tilt.frequency.value = 220;
    tilt.gain.value = 3;

    // a long delay, fed back, so phrases arrive on top of each other
    const dl = ctx.createDelay(1.5);
    dl.delayTime.value = 0.375;                 // a dotted eighth at this tempo
    const fb = ctx.createGain();
    fb.gain.value = 0.24;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 1600;

    // and the room
    const verb = ctx.createConvolver();
    verb.buffer = hall(2.4, 2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.18;

    cueFx.connect(ring);
    ring.connect(bend);
    bend.connect(tilt);
    /* The delay and the room are added to the dry, not swapped for it,
       so the corrupt version arrives about twice as loud as the clean
       one unless something takes it back down. Measured: without this
       it peaks at 0.99 against the plain cue's 0.52. */
    const trim = ctx.createGain();
    trim.gain.value = 0.62;
    trim.connect(cueBus);

    tilt.connect(trim);
    tilt.connect(verb); verb.connect(wet); wet.connect(trim);
    ring.connect(dl); dl.connect(damp); damp.connect(fb); fb.connect(dl);
    damp.connect(trim);

    cueFxNodes = [ring, bend, tilt, dl, fb, damp, verb, wet, trim];
    cueRate = 1;                                // the bars do the speed now
    stabLoad();                                 // her lines, for the stage that has her on it
    cueRelap();
    return;
  }
  if (!onOff && cueFx) {
    try { cueRing.stop(); } catch (e) {}
    for (const n of cueFxNodes.concat([cueFx])) { try { n.disconnect(); } catch (e) {} }
    cueFx = null; cueRing = null; cueFxNodes = [];
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
/* The victory chime, on the card for the next level.
   ------------------------------------------------------------------
   Not a cue and not part of the written organ: one file, played once,
   through the master so nothing ducks it. It is the only sound on that
   screen, which is otherwise deliberately silent. */
let chimeBuf = null, chimeJob = null;

async function chimeLoad() {
  if (chimeBuf) return true;
  if (!chimeJob) {
    chimeJob = (async () => {
      try {
        const r = await fetch(CUE_DIR + 'victory.mp3');
        if (!r.ok) return false;
        chimeBuf = await ctx.decodeAudioData(await r.arrayBuffer());
        return true;
      } catch (e) { return false; }
    })();
  }
  return chimeJob;
}

export async function chime() {
  if (!on || !ctx) return;
  if (!await chimeLoad()) return;
  const src = ctx.createBufferSource();
  src.buffer = chimeBuf;
  const g = ctx.createGain();
  g.gain.value = 0.85;
  src.connect(g);
  g.connect(master || ctx.destination);   // not the voice trim; it is not a voice
  src.start(ctx.currentTime + 0.02);
  src.onended = () => { try { g.disconnect(); } catch (e) {} };
}

export function done() {
  if (!on || !ctx) return;
  const t = ctx.currentTime;
  [0, 4, 7, 12].forEach((n, i) => pipe(t + i * 0.09, semi(n), 2.8, 0.07, 'organ'));
  pipe(t, semi(0) / 2, 3, 0.09, 'pedal');
}
