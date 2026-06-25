/**
 * Scene definitions for the SPH simulator.
 *
 * Available scenes:
 *   'dam-break'         — tall fluid column on the left, released under gravity
 *   'droplet-drop'      — compact droplet falling from above onto a shallow pool
 *   'two-column'        — two symmetric fluid columns collide in the center
 *
 * Particle-count presets (approximate fluid totals):
 *   'low'   ~1 000 fluid particles  (coarse spacing)
 *   'med'   ~3 000 fluid particles  (medium spacing)
 *   'high'  ~5 000 fluid particles  (fine spacing; ceiling for performance)
 *
 * Boundary particles (ptype=1) are placed first in each engine; the 5000
 * fluid cap applies to _nFluid only. Total N = _nBoundary + _nFluid.
 *
 * Public API
 * ----------
 * createEngineForScene(sceneName, opts?)
 *   Returns a new Engine ready to simulate.
 *   opts.preset  — 'low' | 'med' | 'high'  (default 'med')
 *   Any additional opts key overrides the Engine constructor parameter directly.
 *
 * resetScene(engine, sceneName, opts?)
 *   Re-initializes an existing Engine to the named scene from rest.
 *   The engine must have been created with createEngineForScene (same scene/preset).
 *   Useful for a Reset button: engine state is zeroed then repopulated.
 *
 * warmUp(engine, steps?)
 *   Runs a few low-dt steps to relax the t=0 boundary pressure impulse.
 *   Call once after createEngineForScene before the first rendered frame.
 */

import { Engine } from './engine.js';

// ------------------------------------------------------------------ //
//  Presets — target fluid particle counts drive spacing and h selection
// ------------------------------------------------------------------ //

/**
 * Particle-count presets.
 * Ntarget drives spacing = sqrt(fillArea / Ntarget), then h = spacing / 0.9.
 * Actual nFluid (lattice fit) will be approximate; high is the hard ceiling (~5000).
 */
export const PRESETS = {
  low:  { Ntarget: 1000 },
  med:  { Ntarget: 3000 },
  high: { Ntarget: 5000 },
};

// ------------------------------------------------------------------ //
//  Internal lattice helpers
// ------------------------------------------------------------------ //

/**
 * Place fluid particles on a regular lattice inside [xMin,xMax] x [yMin,yMax].
 * The first row/column is offset by spacing/2 from the region edge, but never
 * closer to the domain wall than the DBC-aware inset wallR = 3*dp + dp/2.
 * Writes into engine arrays starting at index startIdx; stops at eng.N.
 * Returns the number of particles placed.
 *
 * @param {Engine} eng
 * @param {number} xMin
 * @param {number} xMax
 * @param {number} yMin
 * @param {number} yMax
 * @param {number} spacing  grid spacing (= dp)
 * @param {number} startIdx first index to write
 * @param {number} vx0      initial x-velocity (default 0)
 * @param {number} vy0      initial y-velocity (default 0)
 * @returns {number} count placed
 */
function placeLattice(eng, xMin, xMax, yMin, yMax, spacing,
                      startIdx = 0, vx0 = 0, vy0 = 0) {
  // DBC inset: fluid must be clear of all 3 boundary layers + 1 dp gap
  const dp = spacing;
  const wallR = 3 * dp + dp;
  const x0 = Math.max(xMin + spacing * 0.5, wallR);
  const y0 = Math.max(yMin + spacing * 0.5, wallR);
  const xEnd = Math.min(xMax, eng.domainW - wallR);
  const yEnd = Math.min(yMax, eng.domainH - wallR);

  let i = startIdx;
  outer: for (let iy = 0; ; iy++) {
    const py = y0 + iy * spacing;
    if (py > yEnd) break;
    for (let ix = 0; ; ix++) {
      const px = x0 + ix * spacing;
      if (px > xEnd) break;
      if (i >= eng.N) break outer;
      eng.x[i]  = px;
      eng.y[i]  = py;
      eng.vx[i] = vx0;
      eng.vy[i] = vy0;
      i++;
    }
  }
  return i - startIdx;
}

/**
 * Count how many fluid lattice points fit in a region — without writing.
 * Uses the same DBC-aware inset as placeLattice.
 *
 * @param {number} dp  particle spacing
 */
function countLattice(xMin, xMax, yMin, yMax, dp, domainW = 1, domainH = 1) {
  const wallR = 3 * dp + dp;
  const x0   = Math.max(xMin + dp * 0.5, wallR);
  const y0   = Math.max(yMin + dp * 0.5, wallR);
  const xEnd = Math.min(xMax, domainW - wallR);
  const yEnd = Math.min(yMax, domainH - wallR);
  const nx = Math.max(0, Math.floor((xEnd - x0) / dp) + 1);
  const ny = Math.max(0, Math.floor((yEnd - y0) / dp) + 1);
  return nx * ny;
}

/**
 * Count boundary particles that will be placed for a domain of size W×H at spacing dp.
 * Left/right walls: 3 layers × full height strip.
 * Bottom/top walls: 3 layers × inset x-range (avoids corner duplicates).
 */
function countBoundary(W, H, dp) {
  const nyLR = Math.floor(H / dp) + 1;         // left/right: full height
  const xInsetStart = 3 * dp;
  const xInsetEnd   = W - 3 * dp;
  const nxBT = Math.max(0, Math.floor((xInsetEnd - xInsetStart) / dp) + 1); // bottom/top: inset
  return 3 * 2 * nyLR + 3 * 2 * nxBT;
}

// ------------------------------------------------------------------ //
//  Scene layout descriptors
// ------------------------------------------------------------------ //

/**
 * Returns the layout regions for each scene.
 * Each region is { xMin, xMax, yMin, yMax, vx0?, vy0? }.
 *
 * @param {string} name   scene name
 * @param {number} W      domain width
 * @param {number} H      domain height
 * @returns {Array<object>}
 */
function sceneRegions(name, W, H) {
  switch (name) {
    case 'dam-break':
      // Tall column on the left third of the domain, lower 60% height
      return [{ xMin: 0, xMax: W * 0.35, yMin: 0, yMax: H * 0.6 }];

    case 'droplet-drop': {
      // Shallow pool on the floor + compact droplet high above center
      const poolH   = H * 0.15;
      const dropR   = H * 0.08;
      const dropCx  = W * 0.5;
      const dropCy  = H * 0.75;
      return [
        { xMin: 0,           xMax: W,            yMin: 0,            yMax: poolH },
        { xMin: dropCx - dropR, xMax: dropCx + dropR,
          yMin: dropCy - dropR, yMax: dropCy + dropR },
      ];
    }

    case 'two-column':
      // Two symmetric columns, each ~25% wide, lower 55% height
      return [
        { xMin: 0,       xMax: W * 0.25, yMin: 0, yMax: H * 0.55 },
        { xMin: W * 0.75, xMax: W,        yMin: 0, yMax: H * 0.55 },
      ];

    default:
      throw new Error(`Unknown scene: "${name}". Valid: dam-break, droplet-drop, two-column`);
  }
}

/**
 * Count total fluid particles for a scene at a given spacing.
 */
function countParticlesForScene(name, W, H, dp) {
  return sceneRegions(name, W, H).reduce(
    (sum, r) => sum + countLattice(r.xMin, r.xMax, r.yMin, r.yMax, dp, W, H),
    0
  );
}

// ------------------------------------------------------------------ //
//  Spacing derivation
// ------------------------------------------------------------------ //

/**
 * Derive particle spacing and smoothing length from a target count.
 * Fill area is the sum of region areas for the scene.
 * spacing = sqrt(fillArea / Ntarget);  h = spacing / 0.9 (SPH packing convention).
 *
 * @returns {{ spacing: number, h: number }}
 */
function _deriveSpacing(name, W, H, Ntarget) {
  const fillArea = sceneRegions(name, W, H).reduce(
    (sum, r) => sum + (r.xMax - r.xMin) * (r.yMax - r.yMin),
    0
  );
  // Use 0.97 safety factor so lattice packing stays below Ntarget
  const spacing = Math.sqrt(fillArea / (Ntarget * 0.97));
  const h       = spacing / 0.9;
  return { spacing, h };
}

// ------------------------------------------------------------------ //
//  Boundary particle placement
// ------------------------------------------------------------------ //

/**
 * Place 3 layers of DBC boundary particles along all four walls.
 * Layers at x/y = dp, 2*dp, 3*dp from each wall.
 * Corner exclusion: left/right walls span full height;
 * bottom/top walls span the inset x-range [3*dp, W-3*dp] to avoid duplicates.
 *
 * @param {Engine} eng
 * @param {number} dp  particle spacing
 */
function _placeBoundaryParticles(eng, dp) {
  const W = eng.domainW;
  const H = eng.domainH;

  // Left wall: x = dp, 2*dp, 3*dp; y from 0 to H
  for (let layer = 1; layer <= 3; layer++) {
    const bx = layer * dp;
    for (let iy = 0; ; iy++) {
      const by = iy * dp;
      if (by > H) break;
      eng.addParticle(bx, by, 0, 0, 1);
    }
  }

  // Right wall: x = W-dp, W-2*dp, W-3*dp; y from 0 to H
  for (let layer = 1; layer <= 3; layer++) {
    const bx = W - layer * dp;
    for (let iy = 0; ; iy++) {
      const by = iy * dp;
      if (by > H) break;
      eng.addParticle(bx, by, 0, 0, 1);
    }
  }

  // Bottom wall: y = dp, 2*dp, 3*dp; x from 3*dp to W-3*dp (inset to avoid corner duplicates)
  for (let layer = 1; layer <= 3; layer++) {
    const by = layer * dp;
    for (let ix = 0; ; ix++) {
      const bx = 3 * dp + ix * dp;
      if (bx > W - 3 * dp) break;
      eng.addParticle(bx, by, 0, 0, 1);
    }
  }

  // Top wall: y = H-dp, H-2*dp, H-3*dp; x from 3*dp to W-3*dp
  for (let layer = 1; layer <= 3; layer++) {
    const by = H - layer * dp;
    for (let ix = 0; ; ix++) {
      const bx = 3 * dp + ix * dp;
      if (bx > W - 3 * dp) break;
      eng.addParticle(bx, by, 0, 0, 1);
    }
  }
}

// ------------------------------------------------------------------ //
//  Capacity helper
// ------------------------------------------------------------------ //

/**
 * Ensure the engine's SoA arrays can hold at least n entries.
 * Does not change eng.N — only grows raw capacity.
 */
function _ensureCapacity(eng, n) {
  if (n <= eng._capacity) return;
  let newCap = eng._capacity;
  while (newCap < n) newCap *= 2;
  const floatKeys = ['x', 'y', 'vx', 'vy', 'density', 'pressure', '_ax', '_ay'];
  for (const k of floatKeys) {
    const next = new Float32Array(newCap);
    next.set(eng[k].subarray(0, eng.N));
    eng[k] = next;
  }
  const nextPtype = new Uint8Array(newCap);
  nextPtype.set(eng.ptype.subarray(0, eng.N));
  eng.ptype = nextPtype;
  eng._capacity = newCap;
}

// ------------------------------------------------------------------ //
//  Public factory
// ------------------------------------------------------------------ //

/**
 * Create and initialize an Engine for the named scene.
 * Boundary particles are placed first (ptype=1, indices 0.._nBoundary-1),
 * then fluid particles (ptype=0, indices _nBoundary..N-1).
 *
 * Extra bookkeeping stored on the engine:
 *   eng._sceneN         — total N at scene creation (boundary + fluid)
 *   eng._sceneBoundaryN — number of boundary particles (= _nBoundary)
 *   eng._sceneName      — scene name (used by resetScene to detect stale state)
 *   eng.spacing         — particle spacing dp (exposed for Chat 15 renderer)
 *
 * @param {string} name   'dam-break' | 'droplet-drop' | 'two-column'
 * @param {object} [opts]
 * @param {string} [opts.preset]  'low' | 'med' | 'high'  (default 'med')
 * @param {number} [opts.domainW] (default 1.0)
 * @param {number} [opts.domainH] (default 1.0)
 * @param {number} [opts.rho0]    rest density (default 1000)
 * Any extra opts keys are forwarded to the Engine constructor.
 * @returns {Engine}
 */
export function createEngineForScene(name, opts = {}) {
  const preset   = opts.preset ?? 'med';
  const domainW  = opts.domainW ?? 1.0;
  const domainH  = opts.domainH ?? 1.0;
  const rho0     = opts.rho0   ?? 1000;

  if (!PRESETS[preset]) {
    throw new Error(`Unknown preset: "${preset}". Valid: low, med, high`);
  }

  // Derive spacing and h from fill area and target fluid count
  const { spacing, h } = _deriveSpacing(name, domainW, domainH, PRESETS[preset].Ntarget);
  const dp      = spacing;
  const mass    = rho0 * dp * dp;
  const nFluid  = countParticlesForScene(name, domainW, domainH, dp);
  const nBnd    = countBoundary(domainW, domainH, dp);
  const totalN  = nBnd + nFluid;

  // Forward any extra opts the caller provided, then apply scene-derived values.
  // Start with N=0: boundary particles are added via addParticle, fluid via direct write.
  const engineOpts = Object.assign({}, opts, {
    N: 0, domainW, domainH, h, rho0, mass,
  });
  delete engineOpts.preset;

  const eng = new Engine(engineOpts);
  eng.spacing = dp; // expose for renderer (Chat 15)

  // 1. Place boundary particles (ptype=1) first
  _placeBoundaryParticles(eng, dp);
  eng._sceneBoundaryN = eng._nBoundary;

  // 2. Ensure capacity for fluid particles, extend N to full total
  _ensureCapacity(eng, totalN);
  eng.N = totalN;

  // 3. Fill fluid slots (indices _nBoundary..totalN-1)
  const nFluidPlaced = _fillScene(eng, name, domainW, domainH, dp, eng._nBoundary);
  eng._nFluid = nFluidPlaced;

  // 4. Trim N to actual placed count (in case lattice math differed slightly from estimate)
  eng.N = eng._nBoundary + nFluidPlaced;

  // 5. Record scene bookkeeping for resetScene
  eng._sceneN    = eng.N;
  eng._sceneName = name;

  return eng;
}

/**
 * Re-initialize an existing Engine from rest for the named scene.
 * Boundary particle positions (indices 0.._nBoundary-1) are left untouched.
 * Only fluid slots (_nBoundary..N-1) are re-filled.
 *
 * @param {Engine} engine
 * @param {string} name
 * @param {object} [opts]  same opts as createEngineForScene
 */
export function resetScene(engine, name, opts = {}) {
  // Assert the engine was created for this scene (stale boundary positions otherwise)
  if (engine._sceneName !== undefined && engine._sceneName !== name) {
    throw new Error(
      `resetScene: engine was created for "${engine._sceneName}", not "${name}". ` +
      'Use createEngineForScene to switch scenes.'
    );
  }

  const domainW = opts.domainW ?? engine.domainW ?? 1.0;
  const domainH = opts.domainH ?? engine.domainH ?? 1.0;
  const preset  = opts.preset ?? 'med';

  const { spacing } = _deriveSpacing(name, domainW, domainH, PRESETS[preset].Ntarget);
  const dp = spacing;

  // Restore total particle count (boundary + fluid)
  if (engine._sceneN !== undefined) engine.N = engine._sceneN;

  // Zero velocities for fluid particles only; boundary particles are fixed
  const nBnd = engine._sceneBoundaryN ?? 0;
  for (let i = nBnd; i < engine.N; i++) {
    engine.vx[i] = 0;
    engine.vy[i] = 0;
  }

  // Re-fill fluid slots starting at _nBoundary; boundary slots are untouched
  _fillScene(engine, name, domainW, domainH, dp, nBnd);

  // Reset step counter
  engine._stepCount = 0;
}

/**
 * Run a few warm-up steps with a tiny dt to relax the t=0 boundary pressure
 * impulse before the first rendered frame.
 * Call once after createEngineForScene.
 *
 * @param {Engine} eng
 * @param {number} [steps=5]  number of warm-up steps
 */
export function warmUp(eng, steps = 5) {
  for (let s = 0; s < steps; s++) {
    eng.step(0.0001); // very small dt to avoid startup impulse
  }
  eng._stepCount = 0; // don't count warm-up steps toward Shepard cadence
}

// ------------------------------------------------------------------ //
//  Internal: fill engine fluid arrays from scene layout
// ------------------------------------------------------------------ //

/**
 * Fill fluid particle slots starting at startIdx.
 * Returns the count of particles placed.
 */
function _fillScene(eng, name, W, H, dp, startIdx = 0) {
  const regions = sceneRegions(name, W, H);
  let idx = startIdx;
  for (const r of regions) {
    const placed = placeLattice(
      eng,
      r.xMin, r.xMax, r.yMin, r.yMax,
      dp, idx,
      r.vx0 ?? 0, r.vy0 ?? 0
    );
    idx += placed;
  }
  return idx - startIdx;
}
