/* ============================================================
   paper-trail.js — the game
   ============================================================
   Snake, as a printer. You are the print head, the ink blobs are
   the food, and every blob you take prints a sheet onto the trail
   behind you. Run into the edge of the tray or into your own
   print-offs and it is a paper jam.

   Deliberately plain: one canvas, no libraries, fixed internal
   resolution scaled by CSS so the cells stay square at any width.

   The ink you last picked up is the ink the printer is loaded with,
   so sheets come out cyan until you eat a magenta blob, and so on.
   That is the whole reason the blobs are the four process colors
   rather than one generic dot.
   ============================================================ */

const COLS = 24;
const ROWS = 18;
const CELL = 32;                    // internal pixels per cell
const U = CELL / 24;                // glyphs are drawn in a 24-unit box

const START_MS = 125;               // ms per step at the start
const FLOOR_MS = 62;                // fastest it ever gets
const RAMP = 2.4;                   // ms shaved off per sheet printed

const PAPER      = '#F2EFE6';
const PAPER_MID  = '#D6D0C2';
const PAPER_LOW  = '#B9B3A4';
const PAPER_LINE = '#C9C3B4';
const TONGUE     = '#F07A95';
const SLOT       = '#9A9488';
/* Ms. Printer's own colors, taken off the bot's avatar: red shell, cream
   face panel, pink cheeks. She is the only warm thing on the board, which
   is what makes her easy to follow at speed. */
const SHELL      = '#E8394F';
const SHELL_DEEP = '#B82438';
const FACE       = '#F7F4ED';
const CHEEK      = '#F79AAC';
const EYE        = '#241B22';
const MOUTH      = '#7A1626';
const TRAY       = '#15171F';
const TRAY_DOT   = '#1E222D';

const INKS = [
  { name: 'cyan',    fill: '#22B8E6', lift: '#7FDAF5' },
  { name: 'magenta', fill: '#E8459B', lift: '#F58FC4' },
  { name: 'yellow',  fill: '#E8C53D', lift: '#F5E08C' },
  { name: 'black',   fill: '#2B2F3A', lift: '#5A6070' }
];

/* ============================================================
   The rooms
   ============================================================
   A room is a fixed arrangement, identical every time you pick it.
   That is the point of choosing one: you learn where the gaps are in
   the Data Center and get good at that board in particular. Random
   layouts would throw that away.

   Everything in here is grey. Color on this board means ink and
   nothing else, so nobody has to wonder whether a thing is food or
   furniture; the pieces are told apart by shape and surface.

   w and h are in cells. Row 16 is left clear in every room, because
   that is where she starts.
   ============================================================ */

export const ROOMS = {
  classic: { name: 'Classic', items: [] },

  lobby: {
    name: 'Corporate Lobby',
    items: [
      { x: 8,  y: 4,  w: 8, h: 1, k: 'desk' },
      { x: 5,  y: 9,  w: 1, h: 1, k: 'pillar' },
      { x: 18, y: 9,  w: 1, h: 1, k: 'pillar' },
      { x: 5,  y: 13, w: 1, h: 1, k: 'pillar' },
      { x: 18, y: 13, w: 1, h: 1, k: 'pillar' },
      { x: 10, y: 12, w: 3, h: 1, k: 'bench' }
    ]
  },

  office: {
    name: 'Executive Office',
    items: [
      { x: 9,  y: 7,  w: 6, h: 2, k: 'desk' },
      { x: 1,  y: 3,  w: 1, h: 8, k: 'shelf' },
      { x: 20, y: 4,  w: 1, h: 3, k: 'cabinet' },
      { x: 11, y: 11, w: 1, h: 1, k: 'cart' },
      { x: 13, y: 11, w: 1, h: 1, k: 'cart' },
      { x: 17, y: 13, w: 2, h: 1, k: 'bench' }
    ]
  },

  mail: {
    name: 'Mail Room',
    items: [
      { x: 2,  y: 2,  w: 5, h: 1, k: 'shelf' },
      { x: 9,  y: 2,  w: 5, h: 1, k: 'shelf' },
      { x: 16, y: 2,  w: 5, h: 1, k: 'shelf' },
      { x: 5,  y: 7,  w: 4, h: 1, k: 'desk' },
      { x: 13, y: 7,  w: 4, h: 1, k: 'desk' },
      { x: 9,  y: 11, w: 4, h: 1, k: 'desk' },
      { x: 3,  y: 12, w: 1, h: 1, k: 'cart' },
      { x: 19, y: 10, w: 1, h: 1, k: 'cart' },
      { x: 21, y: 13, w: 1, h: 1, k: 'cart' }
    ]
  },

  data: {
    name: 'Data Center',
    items: [
      { x: 4,  y: 2, w: 1, h: 6, k: 'rack' }, { x: 4,  y: 10, w: 1, h: 5, k: 'rack' },
      { x: 8,  y: 2, w: 1, h: 6, k: 'rack' }, { x: 8,  y: 10, w: 1, h: 5, k: 'rack' },
      { x: 12, y: 2, w: 1, h: 6, k: 'rack' }, { x: 12, y: 10, w: 1, h: 5, k: 'rack' },
      { x: 16, y: 2, w: 1, h: 6, k: 'rack' }, { x: 16, y: 10, w: 1, h: 5, k: 'rack' },
      { x: 20, y: 2, w: 1, h: 6, k: 'rack' }, { x: 20, y: 10, w: 1, h: 5, k: 'rack' }
    ]
  }
};

export const ROOM_ORDER = ['classic', 'lobby', 'office', 'mail', 'data'];

const GREY = {
  rack: '#343B49', shelf: '#434A5C', desk: '#4A5162',
  cabinet: '#3D4454', pillar: '#555D6E', bench: '#474E5F', cart: '#525A6B'
};
const ETCH = '#8A93A6';

const DIRS = {
  up:    { x:  0, y: -1 },
  down:  { x:  0, y:  1 },
  left:  { x: -1, y:  0 },
  right: { x:  1, y:  0 }
};

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

/* Small seeded generator. Each blob gets its shape from its own cell, so
   every splat is different but none of them wobble between frames. */
function seeded(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/* ============================================================
   Painting
   ============================================================
   These draw onto any context rather than the game's own, which is
   what lets the room previews in the chooser be drawn by exactly
   the code that draws the live board. If the board changes, the
   previews cannot drift out of step with it.
   ============================================================ */

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function paintTray(ctx) {
  ctx.fillStyle = TRAY;
  ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);

  // A dot at each cell corner. Faint enough to read as texture, but it
  // gives the eye a grid to judge distance against, which matters when
  // you are deciding whether a gap is one cell or two.
  ctx.fillStyle = TRAY_DOT;
  for (let y = 1; y < ROWS; y++) {
    for (let x = 1; x < COLS; x++) ctx.fillRect(x * CELL - 1, y * CELL - 1, 2, 2);
  }
}

/* The furniture. Grey throughout and told apart by what is etched on it:
   vents on a rack, pigeonholes on a shelf, a lighter top on a desk. */
function paintRoom(ctx, roomKey) {
  const room = ROOMS[roomKey] || ROOMS.classic;

  for (const it of room.items) {
    const x = it.x * CELL + 2;
    const y = it.y * CELL + 2;
    const w = it.w * CELL - 4;
    const h = it.h * CELL - 4;

    ctx.fillStyle = GREY[it.k] || GREY.desk;
    rr(ctx, x, y, w, h, 4);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)';
    ctx.lineWidth = 1;
    rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 4);
    ctx.stroke();

    ctx.fillStyle = ETCH;
    ctx.globalAlpha = 0.55;

    if (it.k === 'rack') {
      const n = it.h * 3;
      for (let i = 0; i < n; i++) ctx.fillRect(x + 4, y + 6 + i * ((h - 12) / (n - 1)), w - 8, 1.6);
    } else if (it.k === 'shelf') {
      const cx = Math.max(1, it.w * 2), cy = Math.max(1, it.h * 2);
      for (let a = 0; a < cx; a++) {
        for (let b = 0; b < cy; b++) {
          ctx.fillRect(x + 4 + a * ((w - 8) / cx), y + 4 + b * ((h - 8) / cy),
                       Math.max(2, (w - 8) / cx - 3), Math.max(2, (h - 8) / cy - 3));
        }
      }
    } else if (it.k === 'desk') {
      ctx.fillRect(x + 4, y + 4, w - 8, Math.min(5, h * 0.3));
    } else if (it.k === 'cabinet') {
      for (let i = 0; i < it.h; i++) ctx.fillRect(x + 4, y + 7 + i * (h / it.h), w - 8, 1.6);
    } else if (it.k === 'pillar') {
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.28, 0, Math.PI * 2);
      ctx.fill();
    } else if (it.k === 'bench') {
      ctx.fillRect(x + 4, y + h / 2 - 1, w - 8, 2);
    } else if (it.k === 'cart') {
      ctx.fillRect(x + w * 0.28, y + h * 0.28, w * 0.44, h * 0.44);
    }

    ctx.globalAlpha = 1;
  }
}

/* Each print-off is a small stack of paper rather than one sheet. At this
   size a single sheet just reads as a pale square; the offset layers are
   what make it read as something that came out of a printer. */
function paintStack(ctx, cell, isTail) {
  ctx.save();
  ctx.translate(cell.x * CELL + CELL / 2, cell.y * CELL + CELL / 2);
  ctx.scale(U, U);

  const layers = [
    { d:  2.2, fill: PAPER_LOW },
    { d:  0,   fill: PAPER_MID },
    { d: -2.2, fill: PAPER }
  ];

  for (let i = 0; i < layers.length; i++) {
    ctx.fillStyle = layers[i].fill;
    rr(ctx, layers[i].d - 8, layers[i].d - 8, 16, 16, 2);
    ctx.fill();
  }

  // Only the top sheet of the stack carries print.
  const tx = -10.2;
  const ty = -10.2;

  ctx.fillStyle = cell.ink.fill;
  rr(ctx, tx + 2.4, ty + 2.4, 11.2, 3, 1.2);
  ctx.fill();

  ctx.fillStyle = PAPER_LINE;
  ctx.fillRect(tx + 2.4, ty + 8.6, 11.2, 1.2);
  ctx.fillRect(tx + 2.4, ty + 11.6, 7.4, 1.2);

  // The far end of the trail is shaded, so you can tell at a glance where
  // it stops rather than tracing it back.
  if (isTail) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.17)';
    rr(ctx, -10.4, -10.4, 20.8, 20.8, 3);
    ctx.fill();
  }

  ctx.restore();
}

/* Ms. Printer. Drawn upright, never rotated.

   Rotating her was the first attempt and it was wrong: a printer seen from
   a different angle every few seconds stops looking like a printer, and
   two eyes across a banded body leaves no room for the bands. So she sits
   the way a printer sits, and the direction she is heading is carried by
   her pupils instead, which is clearer anyway at this size. */
function paintPrinter(ctx, cell, dirKey, over, gape) {
  const d = DIRS[dirKey] || DIRS.right;

  ctx.save();
  ctx.translate(cell.x * CELL + CELL / 2, cell.y * CELL + CELL / 2);
  ctx.scale(U, U);

  // Sheet standing up in the feed tray.
  ctx.fillStyle = PAPER;
  rr(ctx, -5, -14, 10, 7, 1.2);
  ctx.fill();
  ctx.fillStyle = PAPER_LINE;
  ctx.fillRect(-3.4, -12.2, 6.8, 1);
  ctx.fillRect(-3.4, -10, 6.8, 1);

  // Output tray under the front.
  ctx.fillStyle = over ? '#7E1A2B' : '#C72E42';
  rr(ctx, -7, 9, 14, 3.4, 1.4);
  ctx.fill();

  // The shell, wider than it is deep, with the cream panel across the
  // middle. That banding is what reads as a printer.
  ctx.fillStyle = over ? SHELL_DEEP : SHELL;
  rr(ctx, -11, -9.5, 22, 20, 4.5);
  ctx.fill();

  ctx.fillStyle = FACE;
  rr(ctx, -9, -5.5, 18, 13, 3);
  ctx.fill();

  // Feed slot along the top band.
  ctx.fillStyle = over ? '#6F1524' : '#C72E42';
  rr(ctx, -6.5, -8.2, 13, 2, 1);
  ctx.fill();

  ctx.fillStyle = CHEEK;
  for (const sign of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sign * 7.6, 3.4, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  if (over) {
    ctx.strokeStyle = EYE;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    for (const sign of [-1, 1]) {
      const ex = sign * 4.5;
      ctx.beginPath();
      ctx.moveTo(ex - 2.4, -3.4); ctx.lineTo(ex + 2.4, 1.4);
      ctx.moveTo(ex + 2.4, -3.4); ctx.lineTo(ex - 2.4, 1.4);
      ctx.stroke();
    }
    // A flat line of a mouth.
    ctx.fillStyle = MOUTH;
    rr(ctx, -2.6, 3.4, 5.2, 1.8, 0.9);
    ctx.fill();
    ctx.restore();
    return;
  }

  // Eyes front, pupils pushed toward wherever she is headed.
  for (const sign of [-1, 1]) {
    const ex = sign * 4.5;

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(ex, -1, 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = EYE;
    ctx.beginPath();
    ctx.arc(ex + d.x * 1.2, -1 + d.y * 1.2, 1.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(ex + d.x * 1.2 + 0.6, -1 + d.y * 1.2 - 1, 0.62, 0, Math.PI * 2);
    ctx.fill();
  }

  // The smile opens wider the closer she gets to a blob. It is the only
  // animation she has and it reads from across the room.
  ctx.fillStyle = MOUTH;
  ctx.beginPath();
  ctx.arc(0, 2.8, gape, 0, Math.PI);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = TONGUE;
  ctx.beginPath();
  ctx.arc(0, 2.8 + gape * 0.3, gape * 0.42, 0, Math.PI);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/* An ink splat: a closed curve through seven uneven lobes, plus the
   droplets that landed clear of it. Curving through the midpoints with
   each lobe as the control point keeps every corner rounded. */
function paintSplat(ctx, blob, now) {
  ctx.save();
  ctx.translate(blob.x * CELL + CELL / 2, blob.y * CELL + CELL / 2);
  ctx.scale(U, U);

  const pulse = 1 + Math.sin((now - blob.born) / 300) * 0.05;
  const n = blob.radii.length;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = blob.radii[i] * pulse;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }

  ctx.fillStyle = blob.ink.fill;
  ctx.beginPath();
  ctx.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[j][0]) / 2, (pts[i][1] + pts[j][1]) / 2);
  }
  ctx.closePath();
  ctx.fill();

  for (const sp of blob.spots) {
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, sp.r * pulse, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = blob.ink.lift;
  ctx.beginPath();
  ctx.ellipse(-1.8, -2.2, 2.5, 1.9, -0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/* A blob's shape is settled once, from its own cell, so it never twitches
   while it sits there waiting to be eaten. */
function makeBlob(x, y, ink, salt) {
  const rnd = seeded((x * 73856093) ^ (y * 19349663) ^ (salt || 0));

  // Seven lobes at uneven radii is enough to look spilled rather than drawn.
  const radii = [];
  for (let i = 0; i < 7; i++) radii.push(5.4 + rnd() * 3);

  // A couple of droplets thrown clear of the main splat.
  const spots = [];
  const many = 2 + ((rnd() * 2) | 0);
  for (let i = 0; i < many; i++) {
    const a = rnd() * Math.PI * 2;
    const away = 8 + rnd() * 2;
    spots.push({ x: Math.cos(a) * away, y: Math.sin(a) * away, r: 0.9 + rnd() * 1.1 });
  }

  return { x, y, ink, born: performance.now(), radii, spots };
}

/* A still of a room, for the chooser. Her and a couple of print-offs are in
   it on purpose: without something of known size the picture says nothing
   about how tight the gaps actually are. */
export function drawPreview(canvas, roomKey) {
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;

  const ctx = canvas.getContext('2d');
  paintTray(ctx);
  paintRoom(ctx, roomKey);

  const row = 16;
  const ink = INKS[3];
  paintStack(ctx, { x: 9,  y: row, ink }, true);
  paintStack(ctx, { x: 10, y: row, ink }, false);
  paintSplat(ctx, makeBlob(18, 8, INKS[0], 7), 0);
  paintPrinter(ctx, { x: 11, y: row }, 'right', false, 2.3);
}

export function startPaperTrail(options) {
  const canvas = options.canvas;
  const ctx = canvas.getContext('2d');

  // Backing store at device resolution so the sheets have crisp edges on a
  // phone, while the CSS box stays fluid.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = COLS * CELL * dpr;
  canvas.height = ROWS * CELL * dpr;
  ctx.scale(dpr, dpr);

  let snake, dir, queued, blob, ink, sheets, running, over, acc, last, raf;
  let roomKey = 'classic', walls = new Set();

  function freeCell() {
    // Few enough cells that collecting the empty ones is cheaper to reason
    // about than rejection sampling near the end of a long run.
    const taken = new Set(snake.map(s => s.x + ',' + s.y));
    const open = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const key = x + ',' + y;
        if (!taken.has(key) && !walls.has(key)) open.push({ x, y });
      }
    }
    if (!open.length) return null;
    return open[(Math.random() * open.length) | 0];
  }

  function spawnBlob() {
    const cell = freeCell();
    if (!cell) { blob = null; return; }
    blob = makeBlob(cell.x, cell.y, INKS[(Math.random() * INKS.length) | 0], snake.length);
  }

  function reset(room) {
    roomKey = (room && ROOMS[room]) ? room : 'classic';

    walls = new Set();
    for (const it of ROOMS[roomKey].items) {
      for (let y = it.y; y < it.y + it.h; y++) {
        for (let x = it.x; x < it.x + it.w; x++) walls.add(x + ',' + y);
      }
    }

    // Row 16 is kept clear in every room, so one start works for all of them.
    const row = 16;
    ink = INKS[3];                                  // loaded with black to begin
    snake = [
      { x: 11, y: row, ink },
      { x: 10, y: row, ink },
      { x: 9,  y: row, ink }
    ];
    dir = 'right';
    queued = [];
    sheets = 0;
    over = false;
    acc = 0;
    spawnBlob();
  }

  function stepMs() {
    return Math.max(FLOOR_MS, START_MS - sheets * RAMP);
  }

  function turn(next) {
    if (!running || over) return;
    // Queue up to two turns so a fast corner (right then down in the same
    // step) both register instead of the second one being swallowed.
    const from = queued.length ? queued[queued.length - 1] : dir;
    if (next === from || next === OPPOSITE[from]) return;
    if (queued.length < 2) queued.push(next);
  }

  function step() {
    if (queued.length) dir = queued.shift();

    const d = DIRS[dir];
    const head = { x: snake[0].x + d.x, y: snake[0].y + d.y, ink };

    // The tray edge is a wall. No wrapping: a printer does not print off
    // one side of the page and back on from the other.
    if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS) return jam();

    // Furniture is as solid as the edge of the tray.
    if (walls.has(head.x + ',' + head.y)) return jam();

    // The tail cell is about to be vacated, so running into it is fine
    // unless you are also growing into it this step.
    const ate = blob && head.x === blob.x && head.y === blob.y;
    const body = ate ? snake : snake.slice(0, -1);
    if (body.some(s => s.x === head.x && s.y === head.y)) return jam();

    snake.unshift(head);
    if (ate) {
      ink = blob.ink;          // reload: sheets from here on come out this color
      sheets++;
      spawnBlob();
      if (options.onScore) options.onScore(sheets);
      if (!blob) return full(); // whole tray printed, which is a win
    } else {
      snake.pop();
    }
  }

  function jam() {
    over = true;
    running = false;
    draw();
    if (options.onEnd) options.onEnd({ sheets, reason: 'jam' });
  }

  function full() {
    over = true;
    running = false;
    draw();
    if (options.onEnd) options.onEnd({ sheets, reason: 'full' });
  }

  /* ---- drawing ------------------------------------------------ */
  /* Thin now: the painting itself lives at module level so the chooser can
     use it too. These only supply what the game knows. */

  function drawTray() { paintTray(ctx); }

  function drawRoom() { paintRoom(ctx, roomKey); }

  function drawSheet(cell, index) { paintStack(ctx, cell, index === snake.length - 1); }

  function drawHead() {
    const h = snake[0];
    const near = blob ? Math.abs(blob.x - h.x) + Math.abs(blob.y - h.y) : 9;
    paintPrinter(ctx, h, dir, over, near <= 1 ? 4 : near <= 3 ? 3.1 : 2.3);
  }

  function drawBlob(now) {
    if (blob) paintSplat(ctx, blob, now);
  }

  function draw(now) {
    drawTray();
    drawRoom();
    for (let i = snake.length - 1; i >= 1; i--) drawSheet(snake[i], i);
    drawBlob(now || performance.now());
    drawHead();
  }

  /* ---- loop --------------------------------------------------- */

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!running) return;

    // Clamp the gap so coming back to a backgrounded tab does not fast
    // forward the snake straight into a wall.
    const gap = Math.min(now - last, 250);
    last = now;
    acc += gap;

    const ms = stepMs();
    while (acc >= ms && running) {
      acc -= ms;
      step();
    }
    draw(now);
  }

  /* ---- controls ----------------------------------------------- */

  const KEYS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', a: 'left', s: 'down', d: 'right',
    W: 'up', A: 'left', S: 'down', D: 'right'
  };

  function onKey(e) {
    if (e.key === ' ' || e.key === 'Enter') {
      if (!running && options.onConfirm) { e.preventDefault(); options.onConfirm(); }
      return;
    }
    if (e.key === 'p' || e.key === 'P') { if (running) pause(); else if (!over) resume(); return; }
    const next = KEYS[e.key];
    if (!next) return;
    e.preventDefault();          // stop arrow keys scrolling the page mid-run
    turn(next);
  }

  // Swipe, horizontal or vertical, whichever the gesture favors.
  let t0 = null;
  function onTouchStart(e) {
    const t = e.changedTouches[0];
    t0 = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e) {
    if (!t0) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - t0.x;
    const dy = t.clientY - t0.y;
    t0 = null;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }

  function onHide() { if (document.hidden && running) pause(); }

  window.addEventListener('keydown', onKey);
  canvas.addEventListener('touchstart', onTouchStart, { passive: true });
  canvas.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('visibilitychange', onHide);

  /* ---- outside controls --------------------------------------- */

  function begin(room) {
    reset(room);
    if (options.onScore) options.onScore(0);
    running = true;
    last = performance.now();
    if (!raf) raf = requestAnimationFrame(frame);
    draw();
  }

  function pause() {
    if (!running) return;
    running = false;
    if (options.onPause) options.onPause();
  }

  function resume() {
    if (running || over) return;
    running = true;
    last = performance.now();
    if (options.onResume) options.onResume();
  }

  reset();
  draw();

  return {
    begin,
    pause,
    resume,
    turn,
    isRunning: () => running,
    isOver: () => over,
    room: () => roomKey,
    destroy() {
      cancelAnimationFrame(raf);
      raf = null;
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('visibilitychange', onHide);
    }
  };
}
