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
let bed = null;                     // the written organ, so it can be faded alone
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

  /* The written bed goes through here on its way to the same place, so
     it can be taken down on its own when a recording arrives. */
  bed = ctx.createGain();
  bed.gain.value = 1;
  bed.connect(voice);
}

/* One note. The organ stops are stacked by hand: the note, its octave and
   its twelfth, which is roughly what a small pipe organ gives you. */
/* `dest` is for the written bed only. Everything else -- the clear
   bell, the win, the jam -- hangs off `voice` and must stay there, so
   that silencing the bed when a recording takes over cannot duck the
   effects with it. */
function pipe(at, hz, dur, level, kind, dest) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.connect(dest || voice);

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
      for (const n of bar.chord) pipe(nextAt, semi(n), BEAT * 4 - 0.05, 0.055, 'organ', bed);
      // and the pedal, an octave and a half below
      pipe(nextAt, semi(bar.root) / 2, BEAT * 4 - 0.05, 0.085, 'pedal', bed);
    }

    // A second voice inside the bar, so a held chord is not the only thing
    // happening for three and a half seconds.
    if (beat === 4) {
      for (const n of bar.chord) pipe(nextAt, semi(n + 12), BEAT * 2 - 0.05, 0.028, 'organ', bed);
    }

    // the plucked line: chord tones, wandering, never the same way twice
    if (beat % 2 === 0 || Math.random() < 0.6) {
      const tone = bar.chord[(Math.random() * bar.chord.length) | 0];
      const up = Math.random() < 0.55 ? 12 : 24;
      pipe(nextAt, semi(tone + up), SUB * 2.4, 0.03, 'pluck', bed);
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
let lastStab = -99;             // and how long since she last got a word in
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

function stabFire(at, want) {
  if (cueFaint) return;                         // she is speaking; she does not need quoting
  if (!stabBuf || !stabAt || !stabAt.length) return;

  /* A named fragment, when the caller wants a particular one. Her first
     line of the level is "I am art", and it is asked for rather than
     rolled: it is the one of the five that is about what she is doing to
     the place, so it is the one worth being sure of. */
  let i = -1;
  if (want) i = stabAt.findIndex((c) => c.id === want);
  if (i < 0) {
    i = (rnd() * stabAt.length) | 0;
    if (i === stabLast) i = (i + 1) % stabAt.length;   // not the same one twice running
  }
  stabLast = i;
  const cut = stabAt[i];
  const back = want ? false : rnd() < 0.22;     // the first one is not mangled

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

  /* The third bar is hers by right, and it is "I am art" -- a run that
     ends in twenty seconds should still have heard her say the thing the
     level is about. After that she is spaced rather than rolled, the
     same way the tape faults are: five clear bars minimum, then about
     one bar in five. That is a line every twenty six seconds or so,
     against every eleven before, which was often enough that the same
     five fragments started to wear.

     Which one she says is random after the first, and about one in five
     comes out backwards. */
  if (cueBar === 3) {
    stabFire(at, 'art');
    lastStab = cueBar;
  } else if (cueBar > 3 && cueBar - lastStab >= 6 && rnd() < 0.2) {
    stabFire(at);
    lastStab = cueBar;
  }

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

  /* Stopping the scheduler only stops new bars. A held chord runs very
     nearly three seconds, so the understudy went on sounding over the
     opening of the recording -- the organ outro heard after pressing
     Play. Its own bus comes down over a third of a second, which reads
     as the end of a phrase rather than a cut. */
  bedFade(0.0001, 0.35);
}

/* The written bed's level, moved on its own: the effects hang off voice
   and must not come down with it. */
function bedFade(to, secs) {
  if (!bed || !ctx) return;
  const t = ctx.currentTime;
  bed.gain.cancelScheduledValues(t);
  bed.gain.setValueAtTime(Math.max(bed.gain.value, 0.0001), t);
  bed.gain.exponentialRampToValueAtTime(Math.max(to, 0.0001), t + secs);
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
    /* The page makes one of these inside the gesture itself, because by
       the time this module has been fetched and run the gesture is over
       and Safari will not resume a context for it. If there is one
       waiting, it is already running -- take it rather than opening a
       second one that is not allowed to make a sound. */
    ctx = window.__cpCtx || new AC();
    build();
    cueBuild();
  }
  /* Resuming is a promise, and it is the moment the context stops being
     silent. Anything the page asked for while it was suspended -- which
     is everything, if the page tried to open with music on -- has to be
     re-asserted here, or the cue sits there wanted and never started. */
  if (ctx.state === 'suspended') {
    ctx.resume().then(() => {
      if (on && cueWant && cueWant !== cueHave) setCue(cueWant);
    }).catch(() => { /* still not allowed; the next gesture tries again */ });
  }
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
  bedFade(1, 0.2);                  // back up, if a recording faded it out
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

/* A virus going off.
   ------------------------------------------------------------------
   Not an explosion. The shop is a machine and what just happened is a
   fault in it, so this is a fault: a tone bent down hard while a gate
   chops it on and off in lengthening slices. What that does is stop it
   being a sound and make it a signal that has gone wrong -- the same
   note arriving in pieces, each piece longer than the last, until the
   whole thing gives up.

   Quantised through a five step transfer curve, which is a bitcrusher
   by another name and the reason the pieces have an edge on them.
   Through the same bus as the rest, so it takes the room with it and
   ducks under her voice the way everything else does.

   Picked by ear from five, against a spark, a discharge, an arc and a
   plain falling tone. */
export function zap() {
  if (!on || !ctx) return;
  const t = ctx.currentTime;

  const crush = ctx.createWaveShaper();
  const steps = 5, curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.round(x * steps) / steps;
  }
  crush.curve = curve;

  const out = ctx.createGain();
  out.gain.value = 0.11;
  crush.connect(out);
  out.connect(voice);

  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.Q.value = 3;
  low.frequency.setValueAtTime(4200, t);
  low.frequency.exponentialRampToValueAtTime(300, t + 0.38);
  low.connect(crush);

  /* The stutter. Hard steps rather than ramps, because a signal
     breaking up does not fade in and out, and each slice is longer
     than the one before it so the thing slows down as it dies. */
  const gate = ctx.createGain();
  gate.gain.setValueAtTime(0, t);
  let at = t;
  for (let i = 0; i < 11; i++) {
    gate.gain.setValueAtTime(i % 2 ? 0 : 1, at);
    at += 0.012 + i * 0.006;
  }
  gate.gain.setValueAtTime(0, at);
  gate.connect(low);

  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(semi(-2), t);
  o.frequency.exponentialRampToValueAtTime(semi(-2) / 6, t + 0.36);

  /* Rung against a fixed tone. The modulator drives the gain of a node
     whose own gain is zero, so what comes out is the product of the two
     rather than the sum, which is what takes the music out of it. */
  const ring = ctx.createOscillator();
  ring.type = 'square';
  ring.frequency.value = 112;
  const rg = ctx.createGain();
  rg.gain.value = 0;
  ring.connect(rg.gain);
  o.connect(rg);
  rg.connect(gate);

  o.start(t); ring.start(t);
  o.stop(t + 0.5); ring.stop(t + 0.5);
}

/* A plate landing: two notes, struck and gone.

   It used to be the same swelled organ chord as done(), an octave down
   and a second and a half long. The idea was good -- an open fifth with
   no third in it, asking a question all level that done() answers by
   adding the third -- but it does not survive the room it plays in. The
   soundtrack is under it at 0.52, and a sustained chord in the bass, on
   the same pipes, is the one thing guaranteed to muddy a track rather
   than sit on top of it. Four of these a level and the music is fighting
   for its own register.

   So the fifth stays and the sustain goes: plucked, up an octave out of
   the track's way, done inside half a second. The question is still
   asked, and the only thing left humming in this game is the answer. */
export function lay() {
  if (!on || !ctx) return;
  const t = ctx.currentTime;
  /* Levels are not carried over from the chord it replaces. A swelled
     organ note holds its level for a second and a half; a pluck is at
     its loudest for a few milliseconds and gone. Matched by the number
     in the call the new one landed thirteen decibels down and would
     have disappeared under the track entirely. These are set by what
     comes out: peak about half the old chord's, over in a fifth of the
     time. */
  pipe(t,        semi(0), 0.42, 0.125, 'pluck');
  pipe(t + 0.05, semi(7), 0.38, 0.095, 'pluck');
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

/* The epilogue, read aloud.
   ------------------------------------------------------------------
   PrinterMan's own voice, band-limited and slapped so it arrives as a
   transmission rather than a man in a room, over the top of the lofi
   bed endRoom is already playing. It goes through the voice bus like
   her lines do, so the mute and the master both reach it and it sits
   at a known level against the room rather than a guessed one.

   The caller gets back a clock rather than nothing: the words on
   screen have to land on the words in the file, and the only honest
   source for "where are we" is the context that is playing it. */
let epiBuf = null, epiJob = null, epiSrc = null;

export async function epilogue() {
  if (!on || !ctx) return null;
  if (!epiBuf) {
    if (!epiJob) {
      epiJob = (async () => {
        try {
          const r = await fetch(CUE_DIR + 'epilogue.mp3');
          if (!r.ok) return null;
          return await ctx.decodeAudioData(await r.arrayBuffer());
        } catch (e) { return null; }
      })();
    }
    epiBuf = await epiJob;
  }
  if (!epiBuf || !on || !ctx) return null;

  epilogueStop();
  const src = ctx.createBufferSource();
  src.buffer = epiBuf;
  const g = ctx.createGain();
  g.gain.value = 1;
  src.connect(g);
  g.connect(voiceBus || master || ctx.destination);
  const at = ctx.currentTime + 0.05;
  src.start(at);
  epiSrc = src;
  src.onended = () => { try { g.disconnect(); } catch (e) {} };
  return () => Math.max(0, ctx.currentTime - at);
}

export function epilogueStop() {
  if (!epiSrc) return;
  try { epiSrc.stop(); } catch (e) {}
  epiSrc = null;
}

export function done() {
  if (!on || !ctx) return;
  const t = ctx.currentTime;
  [0, 4, 7, 12].forEach((n, i) => pipe(t + i * 0.09, semi(n), 2.8, 0.07, 'organ'));
  pipe(t, semi(0) / 2, 3, 0.09, 'pedal');
}

/* ---- a meter, for anything that wants to move with the music --------
   The dance floor in the endless mode pulses on the track rather than
   on a tempo somebody typed in, which means it is right for whatever is
   playing and stays right if the track is ever swapped.

   Hung off the cue bus rather than the master, so the readout follows
   the music and not the sound effects going off over it -- a clear
   should light the floor by its own color, not by shoving the meter.

   Low frequencies only. The whole spectrum averages out to a fairly
   steady number and barely moves; the bottom two hundred hertz or so
   is the kick, which is the thing a floor pulses on. */
let meterNode = null, meterBuf = null, meterLow = null;

function meterMake() {
  if (meterNode || !ctx || !cueBus) return;
  meterLow = ctx.createBiquadFilter();
  meterLow.type = 'lowpass';
  meterLow.frequency.value = 200;
  meterLow.Q.value = 0.7;
  meterNode = ctx.createAnalyser();
  meterNode.fftSize = 256;
  meterNode.smoothingTimeConstant = 0.55;
  meterBuf = new Uint8Array(meterNode.fftSize);
  cueBus.connect(meterLow);
  meterLow.connect(meterNode);
  /* The analyser is a leaf. Connecting it onward would put a second,
     unfiltered copy of the music into the output. */
}

/* 0 when there is nothing playing, up towards 1 on a kick. Safe to call
   every frame and safe to call with the sound off, which is the case the
   floor falls back to its own tempo for. */
export function level() {
  if (!on || !ctx || !cueBus) return 0;
  meterMake();
  if (!meterNode) return 0;
  meterNode.getByteTimeDomainData(meterBuf);
  let peak = 0;
  for (let i = 0; i < meterBuf.length; i++) {
    const v = Math.abs(meterBuf[i] - 128) / 128;
    if (v > peak) peak = v;
  }
  return Math.min(1, peak * 2.6);
}

/* ---- a machine losing power ----
   The end of her. Not an explosion: a thing whose supply has gone. The
   pitch sags because the clock driving it is slowing down, the filter
   shuts because there is less and less left to get through it, and the
   mains hum underneath it drops away last -- which is the part that
   actually reads as "off" rather than as "quiet". */
export function powerDown() {
  if (!on || !ctx) return;
  const t = ctx.currentTime;

  const out = ctx.createGain();
  out.gain.value = 0.0001;
  out.gain.exponentialRampToValueAtTime(0.16, t + 0.08);
  out.gain.setValueAtTime(0.16, t + 1.9);
  out.gain.exponentialRampToValueAtTime(0.0001, t + 3.1);
  out.connect(voice);

  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.Q.value = 7;
  low.frequency.setValueAtTime(5200, t);
  low.frequency.exponentialRampToValueAtTime(140, t + 2.7);
  low.connect(out);

  /* The thing itself: two detuned saws sagging away together, which is
     what a falling clock does to anything built on one. */
  for (const off of [0, 7]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f0 = semi(-5) + off;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 / 9, t + 2.6);
    const g = ctx.createGain();
    g.gain.value = off ? 0.35 : 0.6;
    o.connect(g); g.connect(low);
    o.start(t); o.stop(t + 3.2);
  }

  /* The hum, going last. */
  const hum = ctx.createOscillator();
  hum.type = 'sine';
  hum.frequency.setValueAtTime(60, t);
  hum.frequency.exponentialRampToValueAtTime(28, t + 2.9);
  const hg = ctx.createGain();
  hg.gain.setValueAtTime(0.22, t);
  hg.gain.setValueAtTime(0.22, t + 2.2);
  hg.gain.exponentialRampToValueAtTime(0.0001, t + 3.0);
  hum.connect(hg); hg.connect(out);
  hum.start(t); hum.stop(t + 3.1);

  /* And the last flicker of the lamp, a beat before it is dark. */
  const tick = ctx.createOscillator();
  tick.type = 'square';
  tick.frequency.value = 1800;
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0, t);
  tg.gain.setValueAtTime(0.05, t + 2.52);
  tg.gain.setValueAtTime(0, t + 2.56);
  tick.connect(tg); tg.connect(out);
  tick.start(t); tick.stop(t + 2.7);
}

/* ---- the room she dies in ----
   The end screen runs about nineteen seconds and had three seconds of
   sound on it, so most of her death was silence. This is the rest of it,
   and it is not music: it is machine noise put on a grid until it keeps
   time. A fan holds the drone, a steel case thumps on the downbeats, a
   drive head ticks the eighths, and two notification tones do the work a
   melody would -- which is the whole joke, because every sound in here
   is one a computer actually makes.

   Her own supply is gone by the second bar. What is still running is the
   building around her, which is the point: the room does not care.

   Deliberately not pitched off nothing -- the tones sit on the same D
   the organ is in, so this is in the same key as the rest of the game
   without ever playing a tune in it. */
let roomBus = null, roomGen = 0, roomTimer = 0;
let roomAt = 0, roomBarN = 0;
/* Only the drone is held: it loops forever and has to be stopped by
   hand. The one-shots all carry their own stop() and are let go, or the
   list would grow a note at a time for as long as somebody reads. */
let roomLive = [];

const ROOM_BPM = 70;                // slow enough to read as a pulse, not a beat
const RBEAT = 60 / ROOM_BPM;
const REIGHTH = RBEAT / 2;
const RBAR = RBEAT * 4;
const ROOM_LOOK = 2.2;              // how far ahead the bars are written

/* One second of white noise, made once. Every click, thump and breath of
   air in here is a window onto this buffer with a different filter over
   it, which is cheaper than a buffer each and sounds the same. */
let noiseBuf = null;
function noiseOnce() {
  if (noiseBuf) return noiseBuf;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

/* A filtered burst of that noise. Every percussive sound in the room is
   one of these with different numbers on it. */
function burst(at, dur, type, hz, q, level, from) {
  const src = ctx.createBufferSource();
  src.buffer = noiseOnce();
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(from || hz, at);
  if (from) f.frequency.exponentialRampToValueAtTime(hz, at + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(level, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f); f.connect(g); g.connect(roomBus);
  src.start(at, Math.random());     // a different slice each time
  src.stop(at + dur + 0.06);
}

/* The thump a steel enclosure makes when something heavy inside it
   parks. A sine falling a fifth in a tenth of a second is a kick drum
   anywhere else; here it is a degauss, and it lands where a kick would. */
function thump(at, level) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(112, at);
  o.frequency.exponentialRampToValueAtTime(41, at + 0.11);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(level, at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
  o.connect(g); g.connect(roomBus);
  o.start(at); o.stop(at + 0.34);
  burst(at, 0.05, 'lowpass', 420, 1, level * 0.5);     // the panel with it
}

/* A head seeking: the hat part. Short, bright, and the only thing in the
   bar that moves fast enough to carry the tempo on its own. */
const seek = (at, level) => burst(at, 0.03, 'bandpass', 3400, 2.4, level);

/* A drive stepping through tracks -- a run of clicks where a kit would
   put a roll, which is the one place this reads most like a drum
   machine and least like a computer. Used once a loop, no more. */
function stepper(at, n, level) {
  for (let i = 0; i < n; i++)
    burst(at + i * 0.036, 0.015, 'bandpass', 2200 + i * 95, 6,
          level * (1 - i / (n * 1.7)));
}

/* The notification tone, doing a melody's job without being one: a sine
   and one interval above it, struck together and gone inside a quarter
   second. Two notes is a chime; three would be a tune, and a tune would
   stop being a computer noise. */
function blip(at, n, iv, level) {
  for (const [k, amp] of [[n, 1], [n + iv, 0.7]]) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = semi(k) * 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(level * amp, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.26);
    o.connect(g); g.connect(roomBus);
    o.start(at); o.stop(at + 0.3);
  }
}

/* Data going somewhere: a tone bent around by a faster one. A handshake
   is the single most dated sound a computer ever made, so it gets used
   once, quietly, and never on a downbeat. */
function warble(at, dur, level) {
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.value = 1070;
  const lfo = ctx.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = 23;
  const amt = ctx.createGain();
  amt.gain.value = 340;
  lfo.connect(amt); amt.connect(o.frequency);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass'; band.frequency.value = 1300; band.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(level, at + 0.02);
  g.gain.setValueAtTime(level, at + dur - 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(band); band.connect(g); g.connect(roomBus);
  o.start(at); o.stop(at + dur + 0.06);
  lfo.start(at); lfo.stop(at + dur + 0.06);
}

/* The bed under all of it: moving air and the mains. The fan comes up
   over two bars rather than arriving, because her supply is still dying
   through the first one and two things going at once reads as neither. */
function roomDrone(at) {
  const src = ctx.createBufferSource();
  src.buffer = noiseOnce();
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 340; f.Q.value = 0.6;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(0.055, at + 2.4);
  src.connect(f); f.connect(g); g.connect(roomBus);
  src.start(at);
  roomLive.push(src);

  /* Sixty cycles and its octave. This is the sound of a building, not of
     a machine, and it is the reason the room does not feel switched off
     when she does. */
  for (const [hz, amp] of [[60, 0.032], [120, 0.014]]) {
    const o = ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = hz;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, at);
    og.gain.linearRampToValueAtTime(amp, at + 3);
    o.connect(og); og.connect(roomBus);
    o.start(at);
    roomLive.push(o);
  }
}

/* Four bars, looped. Eighths are slots 0..7. The notes are scale steps
   off D: 0 D, 3 F, 5 G, 7 A, 10 C -- D minor without ever landing on the
   root hard enough to resolve, because she does not get a resolution.
   blip entries are [slot, note, interval]. */
const ROOM_BARS = [
  { thump: [0, 5],    seek: [2, 4, 6, 7], blip: [[0, 7, 5], [6, 3, 5]] },
  { thump: [0, 4, 6], seek: [2, 7],       blip: [[2, 5, 7]] },
  { thump: [0, 5],    seek: [2, 4, 6],    blip: [[0, 7, 5], [4, 5, 4]], step: 7 },
  { thump: [0, 4],    seek: [2, 6, 7],    blip: [[0, 3, 4]], warble: 6 },
];

/* The alert, in the tradition and not out of anybody's asset folder: two
   falling tones, a minor third apart, on a square with its corners taken
   off. Every system of that era had one of these and they all sounded
   like this because they were all a two-operator chip doing the cheapest
   thing available -- which is a genre, not a recording. Fires where she
   compresses, so the picture of her closing has a sound for it. */
export function alertDing(when) {
  if (!on || !ctx || !roomBus) return;
  const t = when != null ? when : ctx.currentTime + 0.01;
  const soft = ctx.createBiquadFilter();
  soft.type = 'lowpass'; soft.frequency.value = 2600; soft.Q.value = 0.8;
  soft.connect(roomBus);
  for (const [k, at, dur] of [[12, 0, 0.14], [9, 0.13, 0.42]]) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = semi(k) * 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t + at);
    g.gain.linearRampToValueAtTime(0.1, t + at + 0.008);
    g.gain.setValueAtTime(0.1, t + at + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
    o.connect(g); g.connect(soft);
    o.start(t + at); o.stop(t + at + dur + 0.05);
  }
}

/* Start the room, and keep writing it for as long as it is up. */
function roomBar(b, at) {
  const bar = ROOM_BARS[b % ROOM_BARS.length];
  /* The kit stays out of the first bar. Her power is still going and a
     backbeat over it would make her death the intro to a track. */
  const kit = b > 0;
  const lift = Math.min(1, 0.55 + b * 0.18);      // the room settling in
  const lap = Math.floor(b / ROOM_BARS.length);

  if (kit) {
    for (const s of bar.thump) thump(at + s * REIGHTH, (s === 0 ? 0.44 : 0.3) * lift);
    for (const s of bar.seek) seek(at + s * REIGHTH, (s % 2 ? 0.07 : 0.11) * lift);
    /* The two loudest ornaments sit out some laps. Four bars under a
       screen somebody is reading will go round a dozen times, and the
       stepper arriving on every single one is what turns a room into a
       loop. */
    if (bar.step != null && lap % 2 === 0) stepper(at + bar.step * REIGHTH, 7, 0.075 * lift);
  }
  for (const [s, n, iv] of bar.blip) blip(at + s * REIGHTH, n, iv, 0.1 * lift);
  if (bar.warble != null && lap % 3 === 0) warble(at + bar.warble * REIGHTH, 0.3, 0.035 * lift);
}

/* Written a couple of bars ahead on a timer, the way the cues are, so
   the room runs for as long as the screen is up. It used to write a
   fixed two dozen seconds and stop, which was right while the screen
   moved on by itself and wrong the moment it started waiting for a
   thumb -- a reader who takes a minute over the report would have spent
   forty-five seconds of it in silence. */
function roomWrite() {
  if (!ctx || !roomBus) return;
  while (roomAt < ctx.currentTime + ROOM_LOOK) {
    roomBar(roomBarN, roomAt);
    roomAt += RBAR;
    roomBarN++;
  }
}

export function endRoom() {
  if (!on || !ctx) return;
  endRoomStop();

  roomBus = ctx.createGain();
  roomBus.gain.value = 0.0001;
  roomBus.connect(master);

  const t = ctx.currentTime + 0.05;
  /* Up over a bar and a half. She is still sagging through the first one,
     and the room arriving under her rather than with her is the
     difference between two sounds and one scene. */
  roomBus.gain.linearRampToValueAtTime(0.9, t + RBAR * 1.5);

  roomDrone(t);
  roomAt = t;
  roomBarN = 0;
  roomWrite();
  roomTimer = setInterval(roomWrite, 700);
}

/* Leaving. Faded rather than cut, because the credits bring their own
   music in and a room that stops dead under it sounds like a bug. */
export function endRoomStop() {
  roomGen++;
  if (roomTimer) { clearInterval(roomTimer); roomTimer = 0; }
  if (!ctx || !roomBus) { roomLive = []; return; }
  const bus = roomBus, live = roomLive;
  roomBus = null; roomLive = [];
  const t = ctx.currentTime;
  try {
    bus.gain.cancelScheduledValues(t);
    bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), t);
    bus.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  } catch (e) { /* already gone */ }
  setTimeout(() => {
    for (const n of live) { try { n.stop(); } catch (e) {} }
    try { bus.disconnect(); } catch (e) {}
  }, 620);
}

/* ---- auditioning the room ----
   Renders the bed to a buffer offline, so it can be listened to and
   argued about without beating the game to get to it. It runs the real
   endRoom() rather than a copy of it -- the module's own ctx and master
   are pointed at the offline context for the length of the render and
   put back after -- so what comes out of here is what ships. If that
   ever stops being true it is a bug in this function, not a difference
   of opinion between two versions of the pattern. */
/* The same trick as renderRoom, for anything short: hand it a function
   that plays a cue and get back what that cue actually sounds like. The
   module's own ctx and master are pointed at an offline context for the
   length of the render and put back after, so what comes out is what
   ships rather than a second opinion about it. */
export async function renderCue(play, seconds = 4) {
  const keep = { ctx, master, voice, bed, on, noiseBuf };
  const off = new OfflineAudioContext(1, Math.ceil(44100 * seconds), 44100);
  ctx = off; on = true; noiseBuf = null;
  master = off.createGain(); master.gain.value = 1;
  master.connect(off.destination);
  voice = off.createGain(); voice.gain.value = 1;
  voice.connect(master);
  /* The bed is rebuilt here too. Left pointing at the live context it
     would be a node from one graph handed to another, which throws. */
  bed = off.createGain(); bed.gain.value = 1;
  bed.connect(voice);
  try { play(); } catch (e) { /* the restore below still has to run */ }
  const buf = await off.startRendering();
  ctx = keep.ctx; master = keep.master; voice = keep.voice; bed = keep.bed;
  on = keep.on; noiseBuf = keep.noiseBuf;
  return buf;
}

export async function renderRoom(seconds = 21) {
  const keep = { ctx, master, on, roomBus, roomLive, noiseBuf };
  const off = new OfflineAudioContext(1, Math.ceil(44100 * seconds), 44100);
  ctx = off; on = true; noiseBuf = null; roomBus = null; roomLive = [];
  master = off.createGain();
  master.gain.value = 1;
  master.connect(off.destination);

  endRoom();
  /* Offline there is no clock for the writer to chase, so the bars go
     down in one pass against the length being rendered. The interval
     endRoom just set would never usefully fire here, and left running
     it would go on writing into a context nobody is listening to. */
  if (roomTimer) { clearInterval(roomTimer); roomTimer = 0; }
  while (roomAt < seconds) { roomBar(roomBarN, roomAt); roomAt += RBAR; roomBarN++; }

  alertDing(2.4);                    // where the compression starts on screen
  /* The fade belongs in the audition too -- a bed that ends by running
     out of scheduled bars sounds finished when it is only stopped. */
  if (roomBus) {
    roomBus.gain.setValueAtTime(0.9, seconds - 2.2);
    roomBus.gain.exponentialRampToValueAtTime(0.0001, seconds - 1.7);
  }

  const buf = await off.startRendering();
  ctx = keep.ctx; master = keep.master; on = keep.on;
  roomBus = keep.roomBus; roomLive = keep.roomLive; noiseBuf = keep.noiseBuf;
  return buf;
}
