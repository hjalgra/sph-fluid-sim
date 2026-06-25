/**
 * Renderer for the SPH simulator.
 *
 * Two render modes:
 *   'particle'  — per-particle dots colour-coded by a chosen field
 *   'continuum' — density field on a coarse grid drawn as a heatmap
 *
 * Colour-by options (particle mode):
 *   'speed'    — particle speed magnitude
 *   'pressure' — particle pressure (clamped to 0+ range for colour)
 *
 * Public API
 * ----------
 * createRenderer(canvas, ctx, engine) → Renderer
 *
 * Renderer methods:
 *   .draw(mode, colorBy)       — draw one frame; call each RAF tick
 *   .setEngine(engine)         — swap to a different engine instance
 *   .setColormap(name)         — switch active colormap (viridis|inferno|turbo|coolwarm)
 *   .worldToScreen(wx, wy)     — physics → screen coords {x, y}
 *   .screenToWorld(sx, sy)     — screen → physics coords {x, y}
 *
 * Renderer properties (readable, not settable):
 *   .scaleX, .scaleY           — pixels per metre (set on each draw call)
 */

import { buildLUT } from './colormap.js';

// Continuum field resolution (cells across the shortest domain dimension).
const GRID_CELLS = 48;

// Fixed colour scale bounds — avoids per-frame rescale flicker.
// Sensible defaults for a ~1 m domain, g = 9.81 m/s².
const SPEED_MAX    = 5;      // m/s
const PRESSURE_MAX = 12000;  // Pa

// Active LUT — rebuilt by setColormap(); shared by particle and continuum modes.
let LUT = buildLUT('viridis', 256);

// Muted gray-blue used for boundary particles when walls are shown
const WALL_COLOR = 'rgba(100,120,150,0.55)';

/**
 * Create a renderer bound to a canvas/context pair.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./engine.js').Engine} engine
 * @returns {Renderer}
 */
export function createRenderer(canvas, ctx, engine) {
  let _engine = engine;
  let scaleX = 1, scaleY = 1;
  let _bgColor = '#0a0a14';                 // domain background; themeable
  let _borderColor = 'rgba(255,255,255,0.4)'; // domain border; themeable
  let _showWalls = false;                   // whether to render boundary particles


  // --- coordinate transforms ---

  function worldToScreen(wx, wy) {
    // Physics: y up; screen: y down — flip wy relative to domainH
    return {
      x: wx * scaleX,
      y: (_engine.domainH - wy) * scaleY,
    };
  }

  function screenToWorld(sx, sy) {
    return {
      x: sx / scaleX,
      y: _engine.domainH - sy / scaleY,
    };
  }

  // --- particle mode ---

  function _drawParticles(colorBy) {
    const { N, x, y, vx, vy, pressure, ptype, h, domainH } = _engine;
    const nBnd   = _engine._nBoundary ?? 0;
    const nFluid = _engine._nFluid ?? N;

    // Fixed scale: map raw value to [0,1] with clamping — no per-frame min/max scan.
    const byPressure = colorBy === 'pressure';
    const fixedMax   = byPressure ? PRESSURE_MAX : SPEED_MAX;
    const invFixed   = 1 / fixedMax;

    // Dot radius: smaller at high fluid counts to reduce overlap
    const dotR = Math.max(1.2, h * scaleX * 0.45);

    // At high fluid N reduce alpha so overlapping dots don't blow out
    const alpha = nFluid > 3000 ? 0.75 : 0.9;

    const TWO_PI = 6.283185307;

    // Draw boundary particles first (underneath fluid) if walls visible
    if (_showWalls && ptype) {
      ctx.fillStyle = WALL_COLOR;
      const wallR = Math.max(1.0, h * scaleX * 0.35);
      for (let i = 0; i < nBnd; i++) {
        ctx.beginPath();
        ctx.arc(x[i] * scaleX, (domainH - y[i]) * scaleY, wallR, 0, TWO_PI);
        ctx.fill();
      }
    }

    // Draw fluid particles
    for (let i = nBnd; i < N; i++) {
      const sx = x[i] * scaleX;
      const sy = (domainH - y[i]) * scaleY;

      const raw  = byPressure ? Math.max(0, pressure[i]) : Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
      const t    = Math.max(0, Math.min(1, raw * invFixed));
      const lOff = (t * 255 + 0.5 | 0) * 4;

      ctx.fillStyle = `rgba(${LUT[lOff]},${LUT[lOff+1]},${LUT[lOff+2]},${alpha})`;
      ctx.beginPath();
      ctx.arc(sx, sy, dotR, 0, TWO_PI);
      ctx.fill();
    }
  }

  // --- continuum mode ---

  // Reusable buffers (allocated on first use / engine change)
  let _gridW = 0, _gridH = 0;
  let _fieldBuf  = null;   // Float32Array [gridW * gridH]
  let _imgData   = null;   // ImageData  — reused to avoid per-frame GC

  // Reusable spatial hash for continuum: maps bucket cell → linked list of particle indices.
  let _bucketHead = null;  // Int32Array [nBuckets], -1 = empty
  let _bucketNext = null;  // Int32Array [N]
  let _bucketNX = 0, _bucketNY = 0;

  // Offscreen canvas used to scale ImageData onto the main canvas via drawImage
  let _offCanvas = null, _offCtx = null;

  function _ensureGrid() {
    const { domainW, domainH } = _engine;
    const aspect = domainW / domainH;
    const gH = GRID_CELLS;
    const gW = Math.max(1, Math.round(gH * aspect));
    if (gW !== _gridW || gH !== _gridH) {
      _gridW = gW;
      _gridH = gH;
      _fieldBuf = new Float32Array(gW * gH);
      _imgData  = null; // force re-create when pixel size changes
    }
  }

  function _drawContinuum() {
    const { N, x, y, density, domainW, domainH, h } = _engine;
    const nBnd = _engine._nBoundary ?? 0; // skip boundary particles
    _ensureGrid();

    const gW = _gridW, gH = _gridH;
    const field = _fieldBuf;
    const cellW = domainW / gW;
    const cellH = domainH / gH;
    const hh = h * h;
    const support2 = 4 * hh; // Gaussian support: 2h radius

    // Build a spatial bucket grid sized to the render cell size.
    // Using a cell size of 2h ensures every particle in the 3x3 neighborhood
    // of a given render cell is within the Gaussian support.
    const bCellSize = 2 * h;
    const bNX = Math.ceil(domainW / bCellSize);
    const bNY = Math.ceil(domainH / bCellSize);
    const nBuckets = bNX * bNY;

    if (!_bucketHead || _bucketHead.length < nBuckets || _bucketNX !== bNX || _bucketNY !== bNY) {
      _bucketHead = new Int32Array(nBuckets);
      _bucketNX = bNX;
      _bucketNY = bNY;
    }
    if (!_bucketNext || _bucketNext.length < N) {
      _bucketNext = new Int32Array(Math.max(N, 64));
    }

    // Fill bucket linked list — fluid particles only
    _bucketHead.fill(-1);
    for (let i = nBnd; i < N; i++) {
      const bx = Math.max(0, Math.min(bNX - 1, Math.floor(x[i] / bCellSize)));
      const by = Math.max(0, Math.min(bNY - 1, Math.floor(y[i] / bCellSize)));
      const bi = by * bNX + bx;
      _bucketNext[i] = _bucketHead[bi];
      _bucketHead[bi] = i;
    }

    // Accumulate Gaussian density field — only query nearby buckets per cell
    field.fill(0);
    for (let gi = 0; gi < gH; gi++) {
      const wy = (gi + 0.5) * cellH;  // physics y (bottom-up)
      // Bucket row range that overlaps the Gaussian support of this render row
      const byMin = Math.max(0, Math.floor((wy - 2 * h) / bCellSize));
      const byMax = Math.min(bNY - 1, Math.floor((wy + 2 * h) / bCellSize));

      for (let gj = 0; gj < gW; gj++) {
        const wx = (gj + 0.5) * cellW;
        const bxMin = Math.max(0, Math.floor((wx - 2 * h) / bCellSize));
        const bxMax = Math.min(bNX - 1, Math.floor((wx + 2 * h) / bCellSize));

        let val = 0;
        for (let by = byMin; by <= byMax; by++) {
          for (let bx = bxMin; bx <= bxMax; bx++) {
            let j = _bucketHead[by * bNX + bx];
            while (j !== -1) {
              const dx = wx - x[j];
              const dy = wy - y[j];
              const r2 = dx * dx + dy * dy;
              if (r2 < support2) {
                val += density[j] * Math.exp(-r2 / hh);
              }
              j = _bucketNext[j];
            }
          }
        }
        field[gi * gW + gj] = val;
      }
    }

    // Continuum density field: autoscale per-frame (the range is not fixed;
    // we want to see density variations even when absolute values shift).
    let fMin = Infinity, fMax = -Infinity;
    for (let k = 0; k < gW * gH; k++) {
      if (field[k] < fMin) fMin = field[k];
      if (field[k] > fMax) fMax = field[k];
    }
    const fInvRange = 1 / (fMax - fMin || 1);

    // Render via ImageData — one putImageData per frame instead of gW*gH fillRects.
    // Re-create ImageData only when the pixel dimensions change (e.g. on resize).
    const pxW = gW, pxH = gH; // ImageData is same size as the field grid
    if (!_imgData || _imgData.width !== pxW || _imgData.height !== pxH) {
      _imgData = ctx.createImageData(pxW, pxH);
    }
    const px = _imgData.data;

    // Fill RGBA pixels — field rows are physics-y-up, ImageData is top-down so flip gi.
    for (let gi = 0; gi < gH; gi++) {
      const imgRow = (gH - 1 - gi) * gW; // flip vertical
      const rowBase = gi * gW;
      for (let gj = 0; gj < gW; gj++) {
        const t    = (field[rowBase + gj] - fMin) * fInvRange;
        const li   = (t * 255 + 0.5) | 0;
        const lOff = li * 4;
        const dOff = (imgRow + gj) * 4;
        px[dOff]     = LUT[lOff];
        px[dOff + 1] = LUT[lOff + 1];
        px[dOff + 2] = LUT[lOff + 2];
        px[dOff + 3] = 255;
      }
    }

    // Scale the low-res field image to fill the domain on-screen
    const domainPxW = _engine.domainW * scaleX;
    const domainPxH = _engine.domainH * scaleY;
    // putImageData ignores transforms, so use drawImage via createImageBitmap or
    // a temporary offscreen canvas to get GPU scaling.
    // Fallback: use putImageData at (0,0) into an offscreen canvas then drawImage.
    if (!_offCanvas || _offCanvas.width !== pxW || _offCanvas.height !== pxH) {
      _offCanvas = document.createElement('canvas');
      _offCanvas.width  = pxW;
      _offCanvas.height = pxH;
      _offCtx = _offCanvas.getContext('2d');
    }
    _offCtx.putImageData(_imgData, 0, 0);
    ctx.drawImage(_offCanvas, 0, 0, domainPxW, domainPxH);
  }

  // --- domain border ---

  function _drawBorder() {
    const { domainW, domainH } = _engine;
    const W = domainW * scaleX;
    const H = domainH * scaleY;
    ctx.strokeStyle = _borderColor;
    ctx.lineWidth   = 1;
    ctx.strokeRect(0, 0, W, H);
  }

  // Shared viewport layout: uniform fit-scale (s) + centering offsets.
  function _layout() {
    const cssW = canvas.clientWidth  || window.innerWidth;
    const cssH = canvas.clientHeight || window.innerHeight;
    const margin = 8; // px
    const s = Math.min(
      (cssW - 2 * margin) / _engine.domainW,
      (cssH - 2 * margin) / _engine.domainH
    );
    const offX = (cssW - _engine.domainW * s) / 2;
    const offY = (cssH - _engine.domainH * s) / 2;
    return { cssW, cssH, s, offX, offY };
  }

  // --- public draw ---

  /**
   * Draw one frame.
   *
   * @param {'particle'|'continuum'} mode
   * @param {'speed'|'pressure'} colorBy  (only used in particle mode)
   */
  function draw(mode = 'particle', colorBy = 'speed') {
    const { cssW, cssH, s, offX, offY } = _layout();
    scaleX = s;
    scaleY = s;

    ctx.clearRect(0, 0, cssW, cssH);
    ctx.save();
    ctx.translate(offX, offY);

    // Domain background (themeable)
    ctx.fillStyle = _bgColor;
    ctx.fillRect(0, 0, _engine.domainW * scaleX, _engine.domainH * scaleY);

    if (mode === 'continuum') {
      _drawContinuum();
    } else {
      _drawParticles(colorBy);
    }
    _drawBorder();

    ctx.restore();
  }

  // --- public API object ---

  const renderer = {
    draw,
    setEngine(eng) { _engine = eng; _gridW = 0; _gridH = 0; _imgData = null; },
    setBackground(bg, border) { _bgColor = bg; if (border) _borderColor = border; },
    setShowWalls(show) { _showWalls = show; },

    /** Rebuild the LUT for a new named palette. */
    setColormap(name) {
      LUT = buildLUT(name, 256);
    },

    worldToScreen(wx, wy) {
      const { s, offX, offY } = _layout();
      return { x: offX + wx * s, y: offY + (_engine.domainH - wy) * s };
    },
    screenToWorld(sx, sy) {
      const { s, offX, offY } = _layout();
      return { x: (sx - offX) / s, y: _engine.domainH - (sy - offY) / s };
    },
    get scaleX() { return scaleX; },
    get scaleY() { return scaleY; },
  };

  return renderer;
}
