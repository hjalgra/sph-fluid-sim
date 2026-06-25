/**
 * Headless validation harness for the SPH physics engine.
 * Run with: node src/validate.js
 *
 * Checks:
 *   1. Kernel normalization  — integral of W over 2D domain ≈ 1
 *   2. Kernel gradient symmetry — sum of gradW vectors ≈ 0
 *   3. Static block stability — small block stays bounded, no NaN/Inf
 *   4. Hydrostatic column    — fluid settles; KE decays; no NaN; p increases with depth
 *   5. Momentum conservation — with gravity off, total momentum approximately conserved
 */

import { kernelConstants, W, gradW } from './kernel.js';
import { Engine } from './engine.js';

// ------------------------------------------------------------------ //
//  Utility
// ------------------------------------------------------------------ //

const TOL = (got, want, eps) => Math.abs(got - want) < eps;
const MAX_ERR = (got, want, eps) => Math.abs(got - want) / (Math.abs(want) + 1e-30) < eps;

let passCount = 0;
let failCount = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}${detail ? '  [' + detail + ']' : ''}`);
    passCount++;
  } else {
    console.error(`  FAIL  ${label}${detail ? '  [' + detail + ']' : ''}`);
    failCount++;
  }
}

function hasNaN(...arrs) {
  for (const a of arrs)
    for (let i = 0; i < a.length; i++)
      if (!isFinite(a[i])) return true;
  return false;
}

// ------------------------------------------------------------------ //
//  Test 1 & 2: Kernel normalization and gradient symmetry
// ------------------------------------------------------------------ //

console.log('\n=== Test 1 & 2: Kernel properties ===');
{
  const h = 0.04;
  const kc = kernelConstants(h);
  const support = kc.support; // 2h

  // Sample on a fine grid covering [-2h, 2h] x [-2h, 2h]
  const nGrid = 200;
  const step = (2 * support) / nGrid;
  const dV = step * step;

  let integral = 0;
  let sumGx = 0, sumGy = 0;

  for (let iy = 0; iy < nGrid; iy++) {
    const dy = -support + (iy + 0.5) * step;
    for (let ix = 0; ix < nGrid; ix++) {
      const dx = -support + (ix + 0.5) * step;
      const r = Math.sqrt(dx * dx + dy * dy);
      integral += W(r, kc) * dV;
      const [gx, gy] = gradW(dx, dy, r, kc);
      sumGx += gx * dV;
      sumGy += gy * dV;
    }
  }

  console.log(`  Kernel integral = ${integral.toFixed(6)}  (want approx 1)`);
  console.log(`  Sum gradW*dV = (${sumGx.toExponential(3)}, ${sumGy.toExponential(3)})  (want approx 0)`);

  check('Kernel integral approx 1 (within 2%)',
    Math.abs(integral - 1) < 0.02,
    `got ${integral.toFixed(5)}`);
  check('Sum gradW_x approx 0 (within 1e-6)',
    Math.abs(sumGx) < 1e-6,
    `got ${sumGx.toExponential(3)}`);
  check('Sum gradW_y approx 0 (within 1e-6)',
    Math.abs(sumGy) < 1e-6,
    `got ${sumGy.toExponential(3)}`);
}

// ------------------------------------------------------------------ //
//  Helper: initialize a regular grid of particles
// ------------------------------------------------------------------ //

/**
 * Place N_approx particles on a regular lattice within a rectangular region.
 * Returns actual N placed.
 */
function initBlock(engine, xMin, xMax, yMin, yMax, spacing) {
  let i = 0;
  for (let iy = 0; ; iy++) {
    const py = yMin + spacing * 0.5 + iy * spacing;
    if (py > yMax) break;
    for (let ix = 0; ; ix++) {
      const px = xMin + spacing * 0.5 + ix * spacing;
      if (px > xMax) break;
      if (i >= engine.N) break;
      engine.x[i] = px;
      engine.y[i] = py;
      engine.vx[i] = 0;
      engine.vy[i] = 0;
      i++;
    }
    if (i >= engine.N) break;
  }
  return i;
}

// ------------------------------------------------------------------ //
//  Test 3: Static block stability
// ------------------------------------------------------------------ //

console.log('\n=== Test 3: Static block stability ===');
{
  const h = 0.04;
  const spacing = h * 0.9; // slightly less than h for good density coverage
  const domainW = 1.0;
  const domainH = 1.0;

  // Estimate N for a 0.4x0.4 block
  const blockW = 0.4, blockH = 0.4;
  const approxN = Math.floor(blockW / spacing) * Math.floor(blockH / spacing);
  const N = approxN;

  const c0 = 20;
  const rho0 = 1000;
  const mass = rho0 * spacing * spacing;

  const eng = new Engine({
    N, domainW, domainH,
    h, rho0, gamma: 7, c0,
    alpha: 0.1, beta: 0.0,
    mass,
    gx: 0, gy: -9.81,
    cfl: 0.3,
  });

  initBlock(eng, 0.3, 0.7, 0.3, 0.7, spacing);
  console.log(`  N=${N}, spacing=${spacing.toFixed(4)}, h=${h}, c0=${c0}, mass=${mass.toFixed(4)}`);

  const STEPS = 200;
  let nanEncountered = false;
  let maxX = 0, maxV = 0;

  for (let s = 0; s < STEPS; s++) {
    eng.step(0.002);
    if (hasNaN(eng.x, eng.y, eng.vx, eng.vy, eng.density, eng.pressure)) {
      nanEncountered = true;
      console.error(`  NaN/Inf detected at step ${s}`);
      break;
    }
  }

  for (let i = 0; i < N; i++) {
    const xi = Math.abs(eng.x[i]);
    const vi = Math.sqrt(eng.vx[i] ** 2 + eng.vy[i] ** 2);
    if (xi > maxX) maxX = xi;
    if (vi > maxV) maxV = vi;
  }

  const ke = eng.kineticEnergy();
  console.log(`  After ${STEPS} steps: maxV=${maxV.toFixed(4)}, KE=${ke.toFixed(4)}, nanFound=${nanEncountered}`);

  check('No NaN/Inf in static block', !nanEncountered);
  check('Particles stay in domain', maxX < domainW + 0.01, `maxX=${maxX.toFixed(4)}`);
  check('Static block max speed bounded < 5 m/s', maxV < 5, `maxV=${maxV.toFixed(4)}`);
}

// ------------------------------------------------------------------ //
//  Test 4: Hydrostatic column — settles, KE decays, pressure with depth
// ------------------------------------------------------------------ //

console.log('\n=== Test 4: Hydrostatic column ===');
{
  const h = 0.04;
  const spacing = h * 0.9;
  const domainW = 0.5;
  const domainH = 1.0;

  // Column: full width, bottom half
  const colW = domainW, colH = 0.4;
  const approxN = Math.floor(colW / spacing) * Math.floor(colH / spacing);
  const N = approxN;

  const c0 = 20;
  const rho0 = 1000;
  const mass = rho0 * spacing * spacing;

  const eng = new Engine({
    N, domainW, domainH,
    h, rho0, gamma: 7, c0,
    alpha: 0.5, beta: 0.0, // higher viscosity to settle faster
    mass,
    gx: 0, gy: -9.81,
    cfl: 0.25,
  });

  initBlock(eng, 0, colW, 0, colH, spacing);
  console.log(`  N=${N}, column ${colW}x${colH}, alpha=0.5`);

  // Run for many steps to let it settle
  const SETTLE_STEPS = 800;
  let nanEncountered = false;
  let ke0 = -1;

  for (let s = 0; s < SETTLE_STEPS; s++) {
    eng.step(0.002);
    if (s === 10) ke0 = eng.kineticEnergy();
    if (hasNaN(eng.x, eng.y, eng.vx, eng.vy, eng.density, eng.pressure)) {
      nanEncountered = true;
      console.error(`  NaN/Inf at step ${s}`);
      break;
    }
  }

  const keFinal = eng.kineticEnergy();
  console.log(`  KE at step 10 = ${ke0.toFixed(6)}`);
  console.log(`  KE after ${SETTLE_STEPS} steps = ${keFinal.toFixed(6)}`);

  // Pressure should increase with depth: compare bottom third vs top third
  const yLow = 0.1, yHigh = colH - 0.05;
  let pLow = 0, nLow = 0, pHigh = 0, nHigh = 0;
  for (let i = 0; i < N; i++) {
    if (eng.y[i] < yLow)   { pLow  += eng.pressure[i]; nLow++;  }
    if (eng.y[i] > yHigh)  { pHigh += eng.pressure[i]; nHigh++; }
  }
  pLow  = nLow  > 0 ? pLow  / nLow  : 0;
  pHigh = nHigh > 0 ? pHigh / nHigh : 0;
  console.log(`  avg pressure bottom=${pLow.toFixed(2)}, top=${pHigh.toFixed(2)}`);

  check('No NaN/Inf in hydrostatic column', !nanEncountered);
  check('KE after settling < KE at step 10 (energy decays)', keFinal < ke0,
    `KE0=${ke0.toFixed(4)}, KEf=${keFinal.toFixed(4)}`);
  check('KE final bounded < 100 J', keFinal < 100,
    `KE=${keFinal.toFixed(4)}`);
  check('Pressure increases with depth (bottom > top)', pLow > pHigh,
    `pLow=${pLow.toFixed(1)}, pHigh=${pHigh.toFixed(1)}`);
}

// ------------------------------------------------------------------ //
//  Test 5: Momentum conservation (gravity off)
// ------------------------------------------------------------------ //

console.log('\n=== Test 5: Momentum conservation (gravity off) ===');
{
  const h = 0.04;
  const spacing = h * 0.9;
  const domainW = 0.5;
  const domainH = 0.5;

  const colW = 0.3, colH = 0.3;
  const approxN = Math.floor(colW / spacing) * Math.floor(colH / spacing);
  const N = approxN;

  const c0 = 20;
  const rho0 = 1000;
  const mass = rho0 * spacing * spacing;

  const eng = new Engine({
    N, domainW, domainH,
    h, rho0, gamma: 7, c0,
    alpha: 0.1, beta: 0.0,
    mass,
    gx: 0, gy: 0, // NO gravity
    cfl: 0.3,
  });

  initBlock(eng, 0.1, 0.4, 0.1, 0.4, spacing);

  // Give particles a small random velocity to seed some motion
  const rand = (seed) => {
    // Simple deterministic pseudo-random
    let x = Math.sin(seed * 127.1) * 43758.5453;
    return x - Math.floor(x);
  };
  for (let i = 0; i < N; i++) {
    eng.vx[i] = (rand(i * 2)     - 0.5) * 0.5;
    eng.vy[i] = (rand(i * 2 + 1) - 0.5) * 0.5;
  }

  const [px0, py0] = eng.linearMomentum();
  console.log(`  Initial momentum: (${px0.toFixed(6)}, ${py0.toFixed(6)})`);

  const STEPS = 300;
  let nanEncountered = false;
  let maxDeltaPx = 0, maxDeltaPy = 0;

  for (let s = 0; s < STEPS; s++) {
    eng.step(0.001);
    if (hasNaN(eng.x, eng.y, eng.vx, eng.vy)) {
      nanEncountered = true;
      console.error(`  NaN/Inf at step ${s}`);
      break;
    }
    const [px, py] = eng.linearMomentum();
    const dpx = Math.abs(px - px0);
    const dpy = Math.abs(py - py0);
    if (dpx > maxDeltaPx) maxDeltaPx = dpx;
    if (dpy > maxDeltaPy) maxDeltaPy = dpy;
  }

  const [pxF, pyF] = eng.linearMomentum();
  // Momentum relative to initial total momentum magnitude
  const p0mag = Math.sqrt(px0 * px0 + py0 * py0) + 1e-10;
  const relDrift = Math.max(maxDeltaPx, maxDeltaPy) / (p0mag * STEPS);
  console.log(`  Final momentum: (${pxF.toFixed(6)}, ${pyF.toFixed(6)})`);
  console.log(`  Max |dpx|=${maxDeltaPx.toFixed(6)}, Max |dpy|=${maxDeltaPy.toFixed(6)}`);
  console.log(`  Relative drift per step: ${relDrift.toExponential(3)}`);

  // Due to boundary reflections, momentum won't be perfectly conserved
  // but should stay bounded. Test that drift / (N * mass * c0) is small.
  const pScale = N * mass * c0;
  const relBound = maxDeltaPx / pScale;
  console.log(`  Normalized drift |dpx|/(N*m*c0) = ${relBound.toExponential(3)}`);

  check('No NaN/Inf with gravity off', !nanEncountered);
  check('Momentum bounded (normalized drift < 0.1)', relBound < 0.1,
    `normalized=${relBound.toExponential(3)}`);
}

// ------------------------------------------------------------------ //
//  Test 6: Non-negative pressure (F-02 clamp)
//  Verifies that no particle ever has negative pressure,
//  even at free surfaces where density falls below rho0.
// ------------------------------------------------------------------ //

console.log('\n=== Test 6: Non-negative pressure (F-02 clamp) ===');
{
  const h = 0.04;
  const spacing = h * 0.9;
  const domainW = 0.5;
  const domainH = 1.0;
  const colH = 0.3; // fluid in bottom 30%, large free surface

  const approxN = Math.floor(domainW / spacing) * Math.floor(colH / spacing);
  const N = approxN;
  const c0 = 20;
  const rho0 = 1000;
  const mass = rho0 * spacing * spacing;

  const eng = new Engine({
    N, domainW, domainH,
    h, rho0, gamma: 7, c0,
    alpha: 0.1, beta: 0.0,
    mass,
    gx: 0, gy: -9.81,
    cfl: 0.3,
  });
  initBlock(eng, 0, domainW, 0, colH, spacing);
  console.log(`  N=${N}, free surface at y=${colH}`);

  let minPressure = Infinity;
  let nanFound = false;
  const STEPS = 100;
  for (let s = 0; s < STEPS; s++) {
    eng.step(0.002);
    if (hasNaN(eng.x, eng.y, eng.vx, eng.vy, eng.density, eng.pressure)) {
      nanFound = true;
      break;
    }
    for (let i = 0; i < N; i++) {
      if (eng.pressure[i] < minPressure) minPressure = eng.pressure[i];
    }
  }
  console.log(`  Minimum pressure over ${STEPS} steps: ${minPressure.toFixed(2)} Pa`);

  check('No NaN in free-surface pressure test', !nanFound);
  check('All pressures >= 0 (F-02 clamp active)', minPressure >= 0,
    `minPressure=${minPressure.toFixed(2)}`);
}

// ------------------------------------------------------------------ //
//  Test 7: Shepard density reinitialization corrects truncated support (F-02)
//  Shepard is a zeroth-order renormalization: its job is to restore a constant
//  field where kernel support is incomplete (near walls/edges), while leaving the
//  fully-supported bulk untouched. A uniform lattice at rest isolates exactly this:
//  edge particles are under-counted by raw summation; Shepard renormalizes them.
// ------------------------------------------------------------------ //

console.log('\n=== Test 7: Shepard density reinitialization (F-02) ===');
{
  const h = 0.04;
  const spacing = h * 0.9;
  const domainW = 0.5;
  const domainH = 0.5;
  const c0 = 20;
  const rho0 = 1000;
  const mass = rho0 * spacing * spacing;
  const support = 2 * h;

  const N = Math.floor(domainW / spacing) * Math.floor(domainH / spacing);

  const eng = new Engine({
    N, domainW, domainH,
    h, rho0, gamma: 7, c0,
    alpha: 0.5, beta: 0.0,
    mass,
    gx: 0, gy: 0,
    cfl: 0.3,
  });
  // Uniform lattice at rest, filling the domain up to the edges.
  initBlock(eng, 0, domainW, 0, domainH, spacing);

  // Edge = within one support length of any domain wall (truncated kernel support).
  const isEdge = (i) =>
    eng.x[i] < support || eng.x[i] > domainW - support ||
    eng.y[i] < support || eng.y[i] > domainH - support;

  const meanErr = (pred) => {
    let s = 0, n = 0;
    for (let i = 0; i < N; i++)
      if (pred(i)) { s += Math.abs(eng.density[i] - rho0) / rho0; n++; }
    return n > 0 ? s / n : 0;
  };

  // Raw summation density
  eng._computeDensity();
  const rawEdge = meanErr(isEdge);
  const rawBulk = meanErr((i) => !isEdge(i));

  // Shepard renormalization (reuses the neighbour pass from _computeDensity)
  eng._shepardDensity();
  const shepEdge = meanErr(isEdge);
  const shepBulk = meanErr((i) => !isEdge(i));

  console.log(`  Edge particles:  raw=${(rawEdge * 100).toFixed(1)}%  shepard=${(shepEdge * 100).toFixed(1)}%  (improvement ${(rawEdge / (shepEdge + 1e-12)).toFixed(2)}x)`);
  console.log(`  Bulk particles:  raw=${(rawBulk * 100).toFixed(1)}%  shepard=${(shepBulk * 100).toFixed(1)}%`);

  check('Shepard reduces edge (truncated-support) density error vs raw summation',
    shepEdge < rawEdge,
    `raw=${(rawEdge * 100).toFixed(1)}%, shepard=${(shepEdge * 100).toFixed(1)}%`);
  check('Shepard leaves the fully-supported bulk near rho0 (no harm)',
    shepBulk < 0.05,
    `bulk shepard=${(shepBulk * 100).toFixed(1)}%`);
}

// ------------------------------------------------------------------ //
//  Test 8: Non-default gamma uses correct exponent (F-01 fix)
//  Directly verifies the EOS exponent by setting density above rho0
//  and comparing p(gamma=7) vs p(gamma=5) analytically.
//  ratio=1.05: p7 = B7*(1.05^7-1), p5 = B5*(1.05^5-1)
// ------------------------------------------------------------------ //

console.log('\n=== Test 8: Non-default gamma uses correct exponent (F-01) ===');
{
  const rho0 = 1000;
  const c0 = 20;

  // Engine with gamma=7
  const eng7 = new Engine({ N: 1, domainW: 1, domainH: 1, rho0, gamma: 7, c0 });
  eng7.x[0] = 0.5; eng7.y[0] = 0.5;
  eng7.density[0] = rho0 * 1.05; // 5% compression
  eng7._computePressure();
  const p7 = eng7.pressure[0];

  // Engine with gamma=5
  const eng5 = new Engine({ N: 1, domainW: 1, domainH: 1, rho0, gamma: 5, c0 });
  eng5.x[0] = 0.5; eng5.y[0] = 0.5;
  eng5.density[0] = rho0 * 1.05;
  eng5._computePressure();
  const p5 = eng5.pressure[0];

  // Analytical: B7=rho0*c0^2/7≈57143, B5=rho0*c0^2/5=80000
  // p7 = 57143*(1.05^7-1)≈57143*0.4071≈2326 Pa
  // p5 = 80000*(1.05^5-1)≈80000*0.2763≈2210 Pa  (different, not equal)
  const ratio = 1.05;
  const B7 = rho0 * c0 * c0 / 7;
  const B5 = rho0 * c0 * c0 / 5;
  const expected7 = B7 * (Math.pow(ratio, 7) - 1);
  const expected5 = B5 * (Math.pow(ratio, 5) - 1);

  console.log(`  rho=1.05*rho0: p(gamma=7)=${p7.toFixed(2)} Pa (expected ${expected7.toFixed(2)})`);
  console.log(`  rho=1.05*rho0: p(gamma=5)=${p5.toFixed(2)} Pa (expected ${expected5.toFixed(2)})`);

  check('gamma=7 EOS matches analytical B*(ratio^7-1)',
    Math.abs(p7 - expected7) < 0.1,
    `got=${p7.toFixed(2)}, want=${expected7.toFixed(2)}`);
  check('gamma=5 EOS matches analytical B*(ratio^5-1)',
    Math.abs(p5 - expected5) < 0.1,
    `got=${p5.toFixed(2)}, want=${expected5.toFixed(2)}`);
  check('gamma=7 and gamma=5 pressures differ (gamma respected)',
    Math.abs(p7 - p5) > 1,
    `p7=${p7.toFixed(2)}, p5=${p5.toFixed(2)}, diff=${Math.abs(p7 - p5).toFixed(2)}`);
}

// ------------------------------------------------------------------ //
//  Test 9: Boundary particles increase near-wall fluid density
//  A fluid particle adjacent to a boundary strip must see higher density
//  than the same particle with no boundary particles present.
// ------------------------------------------------------------------ //

console.log('\n=== Test 9: Boundary particles contribute to neighbor density sums ===');
{
  const h = 0.04;
  const dp = h * 0.9;
  const rho0 = 1000;
  const c0 = 20;
  const mass = rho0 * dp * dp;

  // Fluid particle position: just inside the 3-layer boundary zone
  const fx = 3 * dp + dp * 0.5;
  const fy = 0.5;

  // --- Case A: fluid particle alone (no boundary neighbors) ---
  const engA = new Engine({ N: 0, domainW: 1, domainH: 1, h, rho0, gamma: 7, c0, mass });
  engA.addParticle(fx, fy, 0, 0, 0); // fluid only
  engA._computeDensity();
  const rho_no_bnd = engA.density[0];

  // --- Case B: fluid particle + 3-layer boundary strip along left wall ---
  const engB = new Engine({ N: 0, domainW: 1, domainH: 1, h, rho0, gamma: 7, c0, mass });
  // Place boundary particles at x = dp, 2*dp, 3*dp for y near fy
  const support = 2 * h;
  for (let layer = 1; layer <= 3; layer++) {
    const bx = layer * dp;
    for (let k = -5; k <= 5; k++) {
      const by = fy + k * dp;
      if (by >= 0 && by <= 1) engB.addParticle(bx, by, 0, 0, 1);
    }
  }
  engB.addParticle(fx, fy, 0, 0, 0); // fluid particle last
  engB._computeDensity();
  // The fluid particle is the last one added
  const fluidIdx = engB.N - 1;
  const rho_with_bnd = engB.density[fluidIdx];

  console.log(`  rho without boundary: ${rho_no_bnd.toFixed(1)} kg/m³`);
  console.log(`  rho with boundary:    ${rho_with_bnd.toFixed(1)} kg/m³`);

  check('Boundary particles increase near-wall fluid density',
    rho_with_bnd > rho_no_bnd + rho0 * 0.05,
    `no_bnd=${rho_no_bnd.toFixed(1)}, with_bnd=${rho_with_bnd.toFixed(1)}`);
}

// ------------------------------------------------------------------ //
//  Test 10: Non-negative pressure clamp applies to boundary particles
//  A boundary particle forced to sub-rest density must have p >= 0.
// ------------------------------------------------------------------ //

console.log('\n=== Test 10: Non-negative pressure clamp for boundary particles ===');
{
  const rho0 = 1000;
  const c0 = 20;
  const h = 0.04;
  const dp = h * 0.9;
  const mass = rho0 * dp * dp;

  const eng = new Engine({ N: 0, domainW: 1, domainH: 1, h, rho0, gamma: 7, c0, mass });
  eng.addParticle(0.05, 0.5, 0, 0, 1); // one boundary particle
  // Force sub-rest density to trigger the clamp
  eng.density[eng._nBoundary - 1] = rho0 * 0.8;
  eng._computePressure();
  const p = eng.pressure[eng._nBoundary - 1];
  console.log(`  Boundary particle pressure at 0.8*rho0: ${p.toFixed(4)} Pa`);

  check('Boundary particle pressure >= 0 at sub-rest density', p >= 0,
    `p=${p.toFixed(4)}`);
}

// ------------------------------------------------------------------ //
//  Summary
// ------------------------------------------------------------------ //

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passCount} PASS, ${failCount} FAIL`);
if (failCount > 0) {
  console.error('OVERALL: FAIL');
  process.exit(1);
} else {
  console.log('OVERALL: PASS');
  process.exit(0);
}
