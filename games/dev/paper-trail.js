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

const CELL = 32;                    // internal pixels per cell
const U = CELL / 24;                // glyphs are drawn in a 24-unit box

/* ============================================================
   The two boards
   ============================================================
   Not one board scaled. A phone is held upright, so it gets a
   grid of its own shape rather than a wide one shrunk into a
   letterbox. The cells stay square on both, which is what keeps
   a gap honest: two cells across has to look like two cells
   down, or you cannot judge whether you fit.

   She starts along the long axis, so there is runway either way,
   and the cells she starts on are kept clear in every room.
   ============================================================ */

export const SHAPES = {
  wide: { cols: 24, rows: 18, start: { x: 11, y: 16 }, dir: 'right', back: { x: -1, y: 0 }, probe: { x: 18, y:  8 } },
  tall: { cols: 16, rows: 24, start: { x:  8, y: 20 }, dir: 'up',    back: { x:  0, y: 1 }, probe: { x:  7, y: 12 } }
};

const shapeKeyOf = (s) => (SHAPES[s] ? s : 'wide');
const shapeOf    = (s) => SHAPES[shapeKeyOf(s)];
const itemsOf    = (roomKey, s) => {
  const room = ROOMS[roomKey] || ROOMS.classic;
  return room.items[shapeKeyOf(s)] || [];
};

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
   Pickups
   ============================================================
   Counted in steps rather than seconds, because the board speeds
   up as she prints: twelve seconds is about ninety steps at the
   start and nearly two hundred by the end, which would quietly
   make the same pickup worth twice as much to somebody already
   winning. Ninety steps is ninety steps.

   One on the board at a time, and one running at a time. Taking
   a second while the first is still going would mean two sets of
   rules at once, which is a lot to hold in your head at the speed
   this moves.
   ============================================================ */

const POWER_STEPS = 90;      // how long one runs once taken
const POWER_WARN  = 22;      // and when it starts flashing to say it is going
const POWER_LIFE  = 110;     // how long one waits on the board to be taken
const GAP_MIN     = 150;     // steps between one leaving and the next arriving
const GAP_MAX     = 280;
const MAGNET_REACH = 3;      // cells, measured as a square around her
const MAGNET_FLY   = 190;    // ms the ink takes to reach her once it lets go

/* How much the press drags under Time Warp. A flat multiplier rather than
   a return to the starting pace: pegging it to the start would do almost
   nothing in the first half of a run, which is the one real complaint
   against phasing, and there is no reason to build a second one. */
export const WARP_SLOW = 1.7;

/* Violet is the club's own color and the one thing on the board that is
   not an ink -- the other two already borrow from the four plates. */
const POWERS = {
  magnet: { name: 'Magnetic Ink', glow: '#E8394F' },
  phase:  { name: 'Phasing',      glow: '#7FDAF5' },
  warp:   { name: 'Time Warp',    glow: '#99A2F7' }
};

const POWER_KEYS = Object.keys(POWERS);

/* ============================================================
   The rooms
   ============================================================
   A room is a fixed arrangement, identical every time you pick it.
   That is the point of choosing one: you learn where the gaps are in
   the Data Center and get good at that board in particular. Random
   layouts would throw that away.

   Everything in here is gray. Color on this board means ink and
   nothing else, so nobody has to wonder whether a thing is food or
   furniture; the pieces are told apart by shape and surface.

   w and h are in cells. Row 16 is left clear in every room, because
   that is where she starts.
   ============================================================ */

export const ROOMS = {
  classic: { name: 'Classic', items: { wide: [], tall: [] } },

  lobby: {
    name: 'Corporate Lobby',
    items: {
      wide: [
        { x: 8,  y: 4,  w: 8, h: 1, k: 'desk' },
        { x: 5,  y: 9,  w: 1, h: 1, k: 'pillar' },
        { x: 18, y: 9,  w: 1, h: 1, k: 'pillar' },
        { x: 5,  y: 13, w: 1, h: 1, k: 'pillar' },
        { x: 18, y: 13, w: 1, h: 1, k: 'pillar' },
        { x: 10, y: 12, w: 3, h: 1, k: 'bench' }
      ],
      /* Upright, the reception desk reads better across the top of the
         room and the pillars march down the sides, which is what a lobby
         looks like when you walk into it rather than past it. */
      tall: [
        { x: 4,  y: 3,  w: 8, h: 1, k: 'desk' },
        { x: 3,  y: 7,  w: 1, h: 1, k: 'pillar' },
        { x: 12, y: 7,  w: 1, h: 1, k: 'pillar' },
        { x: 6,  y: 9,  w: 4, h: 1, k: 'bench' },
        { x: 3,  y: 11, w: 1, h: 1, k: 'pillar' },
        { x: 12, y: 11, w: 1, h: 1, k: 'pillar' },
        { x: 3,  y: 15, w: 1, h: 1, k: 'pillar' },
        { x: 12, y: 15, w: 1, h: 1, k: 'pillar' },
        { x: 2,  y: 17, w: 4, h: 1, k: 'bench' },
        { x: 10, y: 17, w: 4, h: 1, k: 'bench' }
      ]
    }
  },

  office: {
    name: 'Executive Office',
    items: {
      wide: [
        { x: 9,  y: 7,  w: 6, h: 2, k: 'desk' },
        { x: 1,  y: 3,  w: 1, h: 8, k: 'shelf' },
        { x: 20, y: 4,  w: 1, h: 3, k: 'cabinet' },
        { x: 11, y: 11, w: 1, h: 1, k: 'cart' },
        { x: 13, y: 11, w: 1, h: 1, k: 'cart' },
        { x: 17, y: 13, w: 2, h: 1, k: 'bench' }
      ],
      /* The big desk still sits in the middle of the floor with the
         bookcase along one wall; there is just more floor above and below
         it than beside it now. */
      tall: [
        { x: 1,  y: 3,  w: 1, h: 9, k: 'shelf' },
        { x: 14, y: 3,  w: 1, h: 9, k: 'shelf' },
        { x: 5,  y: 7,  w: 6, h: 2, k: 'desk' },
        { x: 5,  y: 12, w: 1, h: 1, k: 'cart' },
        { x: 10, y: 12, w: 1, h: 1, k: 'cart' },
        { x: 1,  y: 14, w: 1, h: 4, k: 'cabinet' },
        { x: 14, y: 14, w: 1, h: 4, k: 'cabinet' },
        { x: 5,  y: 18, w: 1, h: 1, k: 'cart' },
        { x: 10, y: 18, w: 1, h: 1, k: 'cart' }
      ]
    }
  },

  mail: {
    name: 'Mail Room',
    items: {
      wide: [
        { x: 2,  y: 2,  w: 5, h: 1, k: 'shelf' },
        { x: 9,  y: 2,  w: 5, h: 1, k: 'shelf' },
        { x: 16, y: 2,  w: 5, h: 1, k: 'shelf' },
        { x: 5,  y: 7,  w: 4, h: 1, k: 'desk' },
        { x: 13, y: 7,  w: 4, h: 1, k: 'desk' },
        { x: 9,  y: 11, w: 4, h: 1, k: 'desk' },
        { x: 3,  y: 12, w: 1, h: 1, k: 'cart' },
        { x: 19, y: 10, w: 1, h: 1, k: 'cart' },
        { x: 21, y: 13, w: 1, h: 1, k: 'cart' }
      ],
      /* Four banks of pigeonholes stacked down the room with the sorting
         benches between them, and the carts left where they were dumped. */
      tall: [
        { x: 1,  y: 2,  w: 6, h: 1, k: 'shelf' },
        { x: 9,  y: 2,  w: 6, h: 1, k: 'shelf' },
        { x: 4,  y: 5,  w: 8, h: 1, k: 'desk' },
        /* The middle bank of pigeonholes is deliberately missing: with it
           there the room was a corridor of furniture with nowhere to breathe,
           and the open middle gives you somewhere to make a mistake. */
        { x: 4,  y: 11, w: 8, h: 1, k: 'desk' },
        { x: 1,  y: 14, w: 6, h: 1, k: 'shelf' },
        { x: 9,  y: 14, w: 6, h: 1, k: 'shelf' },
        { x: 2,  y: 17, w: 1, h: 1, k: 'cart' },
        { x: 13, y: 17, w: 1, h: 1, k: 'cart' },
        { x: 3,  y: 19, w: 4, h: 1, k: 'desk' },
        { x: 10, y: 19, w: 4, h: 1, k: 'desk' }
      ]
    }
  },

  data: {
    name: 'Data Center',
    items: {
      wide: [
        { x: 4,  y: 2, w: 1, h: 6, k: 'rack' }, { x: 4,  y: 10, w: 1, h: 5, k: 'rack' },
        { x: 8,  y: 2, w: 1, h: 6, k: 'rack' }, { x: 8,  y: 10, w: 1, h: 5, k: 'rack' },
        { x: 12, y: 2, w: 1, h: 6, k: 'rack' }, { x: 12, y: 10, w: 1, h: 5, k: 'rack' },
        { x: 16, y: 2, w: 1, h: 6, k: 'rack' }, { x: 16, y: 10, w: 1, h: 5, k: 'rack' },
        { x: 20, y: 2, w: 1, h: 6, k: 'rack' }, { x: 20, y: 10, w: 1, h: 5, k: 'rack' }
      ],
      /* The same hall turned a quarter: racks in long rows with a cold
         aisle straight up the middle and a lap around the outside. */
      tall: [
        { x: 1, y: 3,  w: 6, h: 1, k: 'rack' }, { x: 9, y: 3,  w: 6, h: 1, k: 'rack' },
        { x: 1, y: 7,  w: 6, h: 1, k: 'rack' }, { x: 9, y: 7,  w: 6, h: 1, k: 'rack' },
        { x: 1, y: 11, w: 6, h: 1, k: 'rack' }, { x: 9, y: 11, w: 6, h: 1, k: 'rack' },
        { x: 1, y: 15, w: 6, h: 1, k: 'rack' }, { x: 9, y: 15, w: 6, h: 1, k: 'rack' },
        { x: 1, y: 19, w: 6, h: 1, k: 'rack' }, { x: 9, y: 19, w: 6, h: 1, k: 'rack' }
      ]
    }
  }
};

export const ROOM_ORDER = ['classic', 'lobby', 'office', 'mail', 'data'];

const GRAY = {
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

function paintTray(ctx, shape) {
  const S = shapeOf(shape);
  ctx.fillStyle = TRAY;
  ctx.fillRect(0, 0, S.cols * CELL, S.rows * CELL);

  // A dot at each cell corner. Faint enough to read as texture, but it
  // gives the eye a grid to judge distance against, which matters when
  // you are deciding whether a gap is one cell or two.
  ctx.fillStyle = TRAY_DOT;
  for (let y = 1; y < S.rows; y++) {
    for (let x = 1; x < S.cols; x++) ctx.fillRect(x * CELL - 1, y * CELL - 1, 2, 2);
  }
}

/* The furniture. Gray throughout and told apart by what is etched on it:
   vents on a rack, pigeonholes on a shelf, a lighter top on a desk. */
function paintRoom(ctx, roomKey, shape) {
  for (const it of itemsOf(roomKey, shape)) {
    const x = it.x * CELL + 2;
    const y = it.y * CELL + 2;
    const w = it.w * CELL - 4;
    const h = it.h * CELL - 4;

    ctx.fillStyle = GRAY[it.k] || GRAY.desk;
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

  /* On the board it sits in a cell. Pulled by the magnet it comes off the
     grid entirely and is drawn wherever it has got to, which is the whole
     point of the thing: a cell at a time was a crawl she could outrun. */
  const cx = blob.px != null ? blob.px : blob.x * CELL + CELL / 2;
  const cy = blob.py != null ? blob.py : blob.y * CELL + CELL / 2;

  if (blob.fly) {
    const back = Math.atan2(blob.fly.y0 - cy, blob.fly.x0 - cx);
    for (let i = 1; i <= 3; i++) {
      ctx.save();
      ctx.globalAlpha = 0.26 / i;
      ctx.translate(cx + Math.cos(back) * i * 9, cy + Math.sin(back) * i * 9);
      ctx.scale(U * (1 - i * 0.18), U * (1 - i * 0.18));
      ctx.fillStyle = blob.ink.fill;
      ctx.beginPath();
      ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.translate(cx, cy);
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

/* ---- the pickups, drawn the way everything else here is: shapes in a
   24-unit box, no glyphs and no images. An emoji would arrive looking
   like a different thing on every machine, and none of them would look
   like they came out of this printer. ---- */

function drawMagnet(ctx) {
  const R = 8, r = 4.3;

  ctx.fillStyle = '#E8394F';
  ctx.beginPath();
  ctx.arc(0, 1, R, Math.PI, 0, false);
  ctx.lineTo(r, 1);
  ctx.arc(0, 1, r, 0, Math.PI, true);
  ctx.closePath();
  ctx.fill();

  ctx.fillRect(-R, 1, R - r, 4.6);
  ctx.fillRect(r, 1, R - r, 4.6);

  // The poles, which are the half that says magnet rather than horseshoe.
  ctx.fillStyle = '#C7CBD6';
  ctx.fillRect(-R, 5.6, R - r, 2.8);
  ctx.fillRect(r, 5.6, R - r, 2.8);
}

function drawFlask(ctx) {
  ctx.fillStyle = '#C7CBD6';
  ctx.fillRect(-3.1, -9.6, 6.2, 2.4);          // the stopper

  ctx.fillStyle = 'rgba(127, 218, 245, 0.55)';
  ctx.beginPath();
  ctx.moveTo(-2.2, -7.2);
  ctx.lineTo(2.2, -7.2);
  ctx.lineTo(2.2, -2.4);
  ctx.lineTo(6.6, 5.4);
  ctx.quadraticCurveTo(7.6, 8.2, 4.6, 8.2);
  ctx.lineTo(-4.6, 8.2);
  ctx.quadraticCurveTo(-7.6, 8.2, -6.6, 5.4);
  ctx.lineTo(-2.2, -2.4);
  ctx.closePath();
  ctx.fill();

  // What is in it, filled to about the shoulder.
  ctx.fillStyle = '#22B8E6';
  ctx.beginPath();
  ctx.moveTo(-4.6, 2.6);
  ctx.lineTo(4.6, 2.6);
  ctx.lineTo(6.6, 5.4);
  ctx.quadraticCurveTo(7.6, 8.2, 4.6, 8.2);
  ctx.lineTo(-4.6, 8.2);
  ctx.quadraticCurveTo(-7.6, 8.2, -6.6, 5.4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#9BD7F5';
  ctx.beginPath();
  ctx.ellipse(-2.2, 4.6, 1.5, 1.1, -0.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawClock(ctx) {
  ctx.fillStyle = '#C7CBD6';
  ctx.fillRect(-1.7, -10.6, 3.4, 2.4);              // the winder on top

  ctx.fillStyle = '#F2EFE6';
  ctx.beginPath();
  ctx.arc(0, 1, 8.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#2B2F3A';
  ctx.beginPath();
  ctx.arc(0, 1, 6.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#F2EFE6';
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(0, 1);
  ctx.lineTo(0, -3.3);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 1);
  ctx.lineTo(3.5, 1);
  ctx.stroke();
}

const PICK_ART = { magnet: drawMagnet, phase: drawFlask, warp: drawClock };

/* On the board waiting to be taken. The halo is what separates a pickup
   from the furniture: everything else on here is either gray scenery or
   an ink splat, so a thing that breathes is a thing to go and get.

   Near the end of its stay it blinks, for the same reason a running one
   does -- so it going is something you saw rather than something that
   happened while you were looking at the other end of the board. */
function paintPickup(ctx, pick, now) {
  if (pick.left <= 26 && Math.floor(now / 130) % 2) return;

  const kind = POWERS[pick.kind];
  ctx.save();
  ctx.translate(pick.x * CELL + CELL / 2, pick.y * CELL + CELL / 2);
  ctx.scale(U, U);

  const pulse = 1 + Math.sin((now - pick.born) / 260) * 0.07;

  ctx.globalAlpha = 0.22;
  ctx.fillStyle = kind.glow;
  ctx.beginPath();
  ctx.arc(0, 0, 11 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.scale(pulse, pulse);
  PICK_ART[pick.kind](ctx);
  ctx.restore();
}

/* The one running, said in the corner of the board rather than on the
   message line under it. The line is where the game talks and gets talked
   over; a thing you have to keep track of while steering needs somewhere
   of its own that nothing else writes to. */
function paintPowerBar(ctx, kind, left, shape) {
  const S = shapeOf(shape);
  const warn = left <= POWER_WARN;
  if (warn && Math.floor(performance.now() / 110) % 2) return;

  const w = 86, h = 20, x = 8, y = S.rows * CELL - h - 8;

  ctx.save();
  ctx.fillStyle = 'rgba(8, 10, 16, 0.82)';
  rr(ctx, x, y, w, h, 5);
  ctx.fill();

  ctx.save();
  ctx.translate(x + 13, y + h / 2);
  ctx.scale(U * 0.52, U * 0.52);
  PICK_ART[kind](ctx);
  ctx.restore();

  const bx = x + 26, bw = w - 34;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  rr(ctx, bx, y + h / 2 - 3, bw, 6, 3);
  ctx.fill();

  ctx.fillStyle = warn ? '#F2EFE6' : POWERS[kind].glow;
  rr(ctx, bx, y + h / 2 - 3, Math.max(2, bw * (left / POWER_STEPS)), 6, 3);
  ctx.fill();
  ctx.restore();
}

/* A still of a room, for the chooser. Her and a couple of print-offs are in
   it on purpose: without something of known size the picture says nothing
   about how tight the gaps actually are. */
export function drawPreview(canvas, roomKey, shape) {
  const key = shapeKeyOf(shape);
  const S = SHAPES[key];

  canvas.width = S.cols * CELL;
  canvas.height = S.rows * CELL;
  // The card follows the board rather than the other way round.
  canvas.style.setProperty('--board', S.cols + ' / ' + S.rows);

  const ctx = canvas.getContext('2d');
  paintTray(ctx, key);
  paintRoom(ctx, roomKey, key);

  // She is in the still on purpose, on the squares she really starts from.
  // Without something of known size the picture says nothing about how
  // tight the gaps are.
  const st = S.start, bk = S.back, ink = INKS[3];
  paintStack(ctx, { x: st.x + bk.x * 2, y: st.y + bk.y * 2, ink }, true);
  paintStack(ctx, { x: st.x + bk.x,     y: st.y + bk.y,     ink }, false);
  paintSplat(ctx, makeBlob(S.probe.x, S.probe.y, INKS[0], 7), 0);
  paintPrinter(ctx, { x: st.x, y: st.y }, S.dir, false, 2.3);
}

export function startPaperTrail(options) {
  const canvas = options.canvas;
  const ctx = canvas.getContext('2d');

  // Which board this run is played on. Fixed for the life of the game: a
  // board cannot change shape under a run.
  const SHAPE = shapeKeyOf(options.shape);
  const S = SHAPES[SHAPE];
  const COLS = S.cols, ROWS = S.rows;

  // Backing store at device resolution so the sheets have crisp edges on a
  // phone, while the CSS box stays fluid.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = COLS * CELL * dpr;
  canvas.height = ROWS * CELL * dpr;
  canvas.style.setProperty('--board', COLS + ' / ' + ROWS);
  ctx.scale(dpr, dpr);

  let snake, dir, queued, blob, ink, sheets, running, over, acc, last, raf;
  let roomKey = 'classic', walls = new Set();

  // pick: the one sitting on the board. power: the one running, and the
  // steps it has left. gapLeft: the wait before another turns up.
  let pick = null, power = null, powerLeft = 0, gapLeft = 0;

  // Sheets owed. Eating off the grid finishes between steps, so the growing
  // has to wait for the next one rather than happening mid-frame.
  let grow = 0;

  function freeCell(...avoid) {
    // Few enough cells that collecting the empty ones is cheaper to reason
    // about than rejection sampling near the end of a long run.
    const taken = new Set(snake.map(s => s.x + ',' + s.y));
    for (const a of avoid) if (a) taken.add(a.x + ',' + a.y);
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
    // Not under the pickup, which would make one of them unreadable. If that
    // is the only square left the ink wins: the ink is what the game is.
    const cell = freeCell(pick) || freeCell();
    if (!cell) { blob = null; return; }
    blob = makeBlob(cell.x, cell.y, INKS[(Math.random() * INKS.length) | 0], snake.length);
  }

  const nextGap = () => GAP_MIN + ((Math.random() * (GAP_MAX - GAP_MIN)) | 0);

  function spawnPick() {
    const cell = freeCell(blob);
    if (!cell) return;
    pick = {
      x: cell.x, y: cell.y,
      kind: POWER_KEYS[(Math.random() * POWER_KEYS.length) | 0],
      left: POWER_LIFE,
      born: performance.now()
    };
  }

  function tellPower() {
    if (options.onPower) options.onPower(power, powerLeft);
  }

  /* Phasing must not drop while she is standing inside something, or the
     timer kills her for a mistake she did not make. It holds until she is
     out. Nothing else can be inside anything, so nothing else needs this. */
  function stuck() {
    const h = snake[0];
    if (walls.has(h.x + ',' + h.y)) return true;
    return snake.some((s, i) => i > 0 && s.x === h.x && s.y === h.y);
  }

  function agePower() {
    if (!power) return;
    powerLeft--;
    if (powerLeft > 0) { tellPower(); return; }
    if (power === 'phase' && stuck()) return;
    power = null;
    powerLeft = 0;
    gapLeft = nextGap();
    tellPower();
  }

  /* The magnet. The first version moved the splat one square a step, which
     is exactly the speed she moves -- so it never gained on her and the
     whole thing read as broken. It does not crawl now. Once she is within
     reach the ink lets go of the grid and flies straight at her, and she
     has it a fifth of a second later wherever she has gone in the meantime.

     Reach is what keeps it from being a vacuum: she still has to get near
     the ink. What it buys is not having to line up on the exact square,
     which in a game about not being able to turn around is most of the
     work. */
  function maybeFly() {
    if (!blob || blob.fly) return;
    const h = snake[0];
    const away = Math.max(Math.abs(blob.x - h.x), Math.abs(blob.y - h.y));
    if (away > MAGNET_REACH) return;

    blob.fly = {
      t0: performance.now(),
      x0: blob.x * CELL + CELL / 2,
      y0: blob.y * CELL + CELL / 2
    };
    if (options.onPull) options.onPull();
  }

  function takeInk(next) {
    ink = next;                // reload: sheets from here on come out this color
    sheets++;
    if (options.onScore) options.onScore(sheets);
  }

  /* Runs on the frame clock rather than the step clock, because it is an
     animation and has to look like one however fast the board is going.
     It aims at where her head is now, not where it was when the ink let
     go, so it still lands on her when she is moving across it. */
  function flyInk(now) {
    if (!blob || !blob.fly) return;

    const f = blob.fly;
    const k = Math.min(1, (now - f.t0) / MAGNET_FLY);
    const ease = 1 - Math.pow(1 - k, 3);
    const h = snake[0];

    blob.px = f.x0 + (h.x * CELL + CELL / 2 - f.x0) * ease;
    blob.py = f.y0 + (h.y * CELL + CELL / 2 - f.y0) * ease;
    if (k < 1) return;

    takeInk(blob.ink);
    grow++;
    spawnBlob();
    if (!blob) full();         // whole tray printed, which is a win
  }

  function agePick() {
    if (pick) {
      if (--pick.left <= 0) { pick = null; gapLeft = nextGap(); }
      return;
    }
    if (power) return;                 // one at a time, on the board and running
    if (--gapLeft <= 0) spawnPick();
  }

  function reset(room) {
    roomKey = (room && ROOMS[room]) ? room : 'classic';

    walls = new Set();
    for (const it of itemsOf(roomKey, SHAPE)) {
      for (let y = it.y; y < it.y + it.h; y++) {
        for (let x = it.x; x < it.x + it.w; x++) walls.add(x + ',' + y);
      }
    }

    // These cells are kept clear in every room, so one start works for all.
    const st = S.start, bk = S.back;
    ink = INKS[3];                                  // loaded with black to begin
    snake = [
      { x: st.x,            y: st.y,            ink },
      { x: st.x + bk.x,     y: st.y + bk.y,     ink },
      { x: st.x + bk.x * 2, y: st.y + bk.y * 2, ink }
    ];
    dir = S.dir;
    queued = [];
    sheets = 0;
    over = false;
    acc = 0;
    pick = null;
    power = null;
    powerLeft = 0;
    grow = 0;
    gapLeft = nextGap();
    tellPower();
    spawnBlob();
  }

  function stepMs() {
    const ms = Math.max(FLOOR_MS, START_MS - sheets * RAMP);
    return power === 'warp' ? ms * WARP_SLOW : ms;
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

    // The tray edge is a wall, phasing or not. No wrapping and no way out:
    // a printer does not print off one side of the page and back on from
    // the other, and the page is the one thing she is never inside of.
    if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS) return jam();

    const ghost = power === 'phase';

    // Furniture is as solid as the edge of the tray, unless she is not.
    if (!ghost && walls.has(head.x + ',' + head.y)) return jam();

    /* The tail cell is about to be vacated, so running into it is fine
       unless you are also growing into it this step -- either by driving
       over the ink or by owing a sheet for ink the magnet brought in. */
    const ate = blob && !blob.fly && head.x === blob.x && head.y === blob.y;
    const body = (ate || grow > 0) ? snake : snake.slice(0, -1);
    if (!ghost && body.some(s => s.x === head.x && s.y === head.y)) return jam();

    snake.unshift(head);
    if (ate) {
      takeInk(blob.ink);
      spawnBlob();
      if (!blob) return full(); // whole tray printed, which is a win
    } else if (grow > 0) {
      grow--;
    } else {
      snake.pop();
    }

    // Taken by driving over it, the same as the ink is.
    if (pick && head.x === pick.x && head.y === pick.y) {
      power = pick.kind;
      powerLeft = POWER_STEPS;
      pick = null;
      if (options.onTake) options.onTake(power);
      tellPower();
    }

    agePower();
    if (power === 'magnet') maybeFly();
    agePick();
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

  function drawTray() { paintTray(ctx, SHAPE); }

  function drawRoom() { paintRoom(ctx, roomKey, SHAPE); }

  function drawSheet(cell, index) { paintStack(ctx, cell, index === snake.length - 1); }

  function drawHead(now) {
    const h = snake[0];
    const near = blob ? Math.abs(blob.x - h.x) + Math.abs(blob.y - h.y) : 9;

    /* Phasing is drawn on her, not only in the corner. The rule it changes
       is about her and the thing she is about to hit, so it has to be
       readable where she is, at the moment she decides. */
    if (power === 'phase') {
      const warn = powerLeft <= POWER_WARN;
      if (!warn || Math.floor(now / 110) % 2 === 0) {
        ctx.save();
        ctx.globalAlpha = warn ? 0.5 : 0.3;
        ctx.fillStyle = '#7FDAF5';
        ctx.beginPath();
        ctx.arc(h.x * CELL + CELL / 2, h.y * CELL + CELL / 2, CELL * 0.72, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    paintPrinter(ctx, h, dir, over, near <= 1 ? 4 : near <= 3 ? 3.1 : 2.3);
  }

  function drawBlob(now) {
    if (blob) paintSplat(ctx, blob, now);
  }

  function draw(now) {
    now = now || performance.now();
    drawTray();
    drawRoom();
    for (let i = snake.length - 1; i >= 1; i--) drawSheet(snake[i], i);
    drawBlob(now);
    if (pick) paintPickup(ctx, pick, now);
    drawHead(now);
    if (power) paintPowerBar(ctx, power, powerLeft, SHAPE);
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

    // After the stepping, so it aims at where she actually ended up.
    if (running) flyInk(now);
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

  /* Swipe, horizontal or vertical, whichever the gesture favors. Bound to
     whatever element the page hands over rather than the canvas itself, so
     a gesture that starts just off the board still steers. */
  const surface = options.surface || canvas;

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

  // A swipe over the board is a steer, never a scroll, so the browser is
  // told to keep its hands off once one is under way.
  function onTouchMove(e) { if (t0 && e.cancelable) e.preventDefault(); }

  function onHide() { if (document.hidden && running) pause(); }

  window.addEventListener('keydown', onKey);
  surface.addEventListener('touchstart', onTouchStart, { passive: true });
  surface.addEventListener('touchmove', onTouchMove, { passive: false });
  surface.addEventListener('touchend', onTouchEnd, { passive: true });
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

    /* What is on the board, for the stand-in player that tunes the pickups.
       Read only, and copied rather than handed out, so nothing outside can
       reach in and move a sheet. Nothing in the game itself calls it. */
    peek: () => ({
      cols: COLS, rows: ROWS,
      snake: snake.map(s => ({ x: s.x, y: s.y })),
      dir,
      walls: Array.from(walls),
      blob: blob ? { x: blob.x, y: blob.y } : null,
      pick: pick ? { x: pick.x, y: pick.y, kind: pick.kind, left: pick.left } : null,
      power, powerLeft, sheets
    }),
    destroy() {
      cancelAnimationFrame(raf);
      raf = null;
      window.removeEventListener('keydown', onKey);
      surface.removeEventListener('touchstart', onTouchStart);
      surface.removeEventListener('touchmove', onTouchMove);
      surface.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('visibilitychange', onHide);
    }
  };
}
