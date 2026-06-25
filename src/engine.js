/**
 * SPH core engine — density, pressure (Tait EOS), pressure force,
 * Monaghan artificial viscosity, gravity, and symplectic Euler integration.
 *
 * State of Art (SoA) Float32Arrays: x, y, vx, vy, density, pressure.
 * All indexed 0..N-1.
 *
 * Physics parameters (defaults chosen for stability at typical spacing):
 *   h       = 0.04 m   smoothing length; support = 2h = 0.08 m
 *   rho0    = 1000     rest density (kg/m^3)
 *   gamma   = 7        Tait exponent (water-like)
 *   c0      = 20       reference sound speed (m/s); B = rho0*c0^2/gamma
 *   alpha   = 0.1      Monaghan viscosity coefficient (linear term)
 *   beta    = 0.0      Monaghan viscosity coefficient (quadratic term)
 *   mass    = rho0 * spacing^2  (one particle per spacing^2 area)
 *
 * Tait EOS: p = B * ((rho/rho0)^gamma - 1),  B = rho0*c0^2/gamma
 *
 * Artificial viscosity (Monaghan 1992):
 *   Pi_ij = (-alpha * mu_ij * cbar_ij) / rhobar_ij   when v_ij . r_ij < 0
 *   mu_ij = h * (v_ij . r_ij) / (|r_ij|^2 + eps*h^2)
 *   cbar  = c0 (global sound speed; valid for weakly-compressible flow),  rhobar = 0.5*(rho_i + rho_j)
 *
 * CFL timestep: dt = CFL * h / (c0 + vmax)
 *
 * Boundary: reflective walls with restitution damping via boundary.js.
 */

import { kernelConstants, W, gradW } from './kernel.js';
import { Grid } from './grid.js';
import { applyBoundary } from './boundary.js';

export class Engine {
  /**
   * @param {object} opts
   * @param {number} opts.N          particle count
   * @param {number} opts.domainW    domain width  (m)
   * @param {number} opts.domainH    domain height (m)
   * @param {number} [opts.h]        smoothing length (default 0.04)
   * @param {number} [opts.rho0]     rest density   (default 1000)
   * @param {number} [opts.gamma]    Tait gamma     (default 7)
   * @param {number} [opts.c0]       sound speed    (default 20)
   * @param {number} [opts.alpha]    viscosity alpha (default 0.1)
   * @param {number} [opts.beta]     viscosity beta  (default 0.0)
   * @param {number} [opts.mass]     particle mass   (default rho0*h^2)
   * @param {number} [opts.gx]       gravity x      (default 0)
   * @param {number} [opts.gy]       gravity y      (default -9.81)
   * @param {number} [opts.cfl]      CFL number     (default 0.3)
   */
  constructor(opts = {}) {
    const N = opts.N ?? 0;
    this.N = N;

    // Domain
    this.domainW = opts.domainW ?? 1.0;
    this.domainH = opts.domainH ?? 1.0;

    // Physics parameters
    this.h      = opts.h     ?? 0.04;
    this.rho0   = opts.rho0  ?? 1000;
    this.gamma  = opts.gamma ?? 7;
    this.c0     = opts.c0    ?? 20;
    this.alpha  = opts.alpha ?? 0.1;
    this.beta   = opts.beta  ?? 0.0;
    this.mass   = opts.mass  ?? (this.rho0 * this.h * this.h);
    this.gx     = opts.gx    ?? 0;
    this.gy     = opts.gy    ?? -9.81;
    this.cfl    = opts.cfl   ?? 0.3;

    // Derived
    this.B = this.rho0 * this.c0 * this.c0 / this.gamma;
    this.kc = kernelConstants(this.h);
    this.support = this.kc.support; // = 2h

    // SoA state arrays — initial capacity = N (may grow via addParticle)
    this._capacity = Math.max(N, 16);
    this.x        = new Float32Array(this._capacity);
    this.y        = new Float32Array(this._capacity);
    this.vx       = new Float32Array(this._capacity);
    this.vy       = new Float32Array(this._capacity);
    this.density  = new Float32Array(this._capacity);
    this.pressure = new Float32Array(this._capacity);
    this.ptype    = new Uint8Array(this._capacity);   // 0 = fluid, 1 = boundary

    // Particle type counters
    this._nFluid    = 0;
    this._nBoundary = 0;

    // Acceleration scratch (not exposed; reused each step)
    this._ax = new Float32Array(this._capacity);
    this._ay = new Float32Array(this._capacity);

    // Reusable gradient scratch — avoids per-pair heap allocation in _computeForces
    this._grad = [0, 0];

    // Neighbor scratch for getNeighbors() — avoids closure overhead in hot loops.
    // 512 accommodates boundary particle layers without overflow.
    this._nbr = new Int32Array(512);

    // Neighbor grid (cell size = support radius)
    this.grid = new Grid(this.domainW, this.domainH, this.support);

    // Step counter for periodic Shepard density reinitialization
    this._stepCount = 0;
  }

  // ------------------------------------------------------------------ //
  //  Public setters for live parameter adjustment
  // ------------------------------------------------------------------ //

  setGravity(gx, gy) { this.gx = gx; this.gy = gy; }
  setViscosity(alpha, beta = 0) { this.alpha = alpha; this.beta = beta; }

  // ------------------------------------------------------------------ //
  //  Core physics passes
  // ------------------------------------------------------------------ //

  /** Rebuild neighbor grid then compute density via kernel summation. */
  _computeDensity() {
    const { N, x, y, mass, density, kc, grid, _nbr } = this;
    grid.build(x, y, N);
    for (let i = 0; i < N; i++) {
      const xi = x[i], yi = y[i];
      const nCount = grid.getNeighbors(xi, yi, _nbr);
      let rho = 0;
      for (let k = 0; k < nCount; k++) {
        const j = _nbr[k];
        const dx = xi - x[j];
        const dy = yi - y[j];
        const r = Math.sqrt(dx * dx + dy * dy);
        rho += mass * W(r, kc);
      }
      density[i] = Math.max(rho, this.rho0 * 0.5); // clamp to avoid p < -B
    }
  }

  /**
   * Shepard density reinitialization (zeroth-order renormalization).
   * Corrects density deficiency at free surfaces and walls.
   * Reuses the neighbor grid built by _computeDensity in the same step.
   * rho_i = (sum_j m_j W_ij) / (sum_j (m_j/rho_j) W_ij)
   */
  _shepardDensity() {
    const { N, x, y, mass, density, kc, grid, _nbr, rho0, ptype } = this;
    for (let i = 0; i < N; i++) {
      if (ptype[i] === 1) continue; // boundary particles skip Shepard correction
      const xi = x[i], yi = y[i];
      const nCount = grid.getNeighbors(xi, yi, _nbr);
      let num = 0, den = 0;
      for (let k = 0; k < nCount; k++) {
        const j = _nbr[k];
        const dx = xi - x[j];
        const dy = yi - y[j];
        const r = Math.sqrt(dx * dx + dy * dy);
        const Wij = W(r, kc);
        num += mass * Wij;
        den += (mass / density[j]) * Wij;
      }
      // Safety: only apply when the denominator is well-conditioned
      if (den > 1e-10) {
        density[i] = Math.max(num / den, rho0 * 0.5);
      }
    }
  }

  /** Tait equation of state: p = B*((rho/rho0)^gamma - 1), clamped to non-negative. */
  _computePressure() {
    const { N, density, pressure, rho0, gamma, B } = this;
    for (let i = 0; i < N; i++) {
      const ratio = density[i] / rho0;
      let rg;
      if (gamma === 7) {
        // Fast integer path for the common gamma=7 case
        const r2 = ratio * ratio;
        const r4 = r2 * r2;
        rg = r4 * r2 * ratio;
      } else {
        rg = Math.pow(ratio, gamma);
      }
      // Clamp to zero: prevents tensile instability at free surfaces and walls
      pressure[i] = Math.max(0, B * (rg - 1));
    }
  }

  /**
   * Compute pressure forces (symmetrized Monaghan form) and
   * Monaghan artificial viscosity. Store in _ax, _ay.
   */
  _computeForces() {
    const {
      N, x, y, vx, vy, density, pressure, mass, kc, grid,
      alpha, beta, c0, h, _ax, _ay, gx, gy, ptype,
    } = this;

    _ax.fill(0);
    _ay.fill(0);

    const eps = 0.01; // for mu_ij denominator
    const support2 = this.support * this.support;
    const grad = this._grad; // reused scratch — no per-pair allocation
    const nbr  = this._nbr;

    for (let i = 0; i < N; i++) {
      if (ptype[i] === 1) continue; // boundary particles have no acceleration
      const xi = x[i], yi = y[i];
      const vxi = vx[i], vyi = vy[i];
      const rhoi = density[i];
      const pi = pressure[i];

      let fxi = 0, fyi = 0;

      const nCount = grid.getNeighbors(xi, yi, nbr);
      for (let k = 0; k < nCount; k++) {
        const j = nbr[k];
        if (j === i) continue;
        const dx = xi - x[j];
        const dy = yi - y[j];
        const r2 = dx * dx + dy * dy;
        if (r2 >= support2) continue;
        const r = Math.sqrt(r2);

        gradW(dx, dy, r, kc, grad);

        const rhoj = density[j];
        const pj   = pressure[j];

        // Symmetrized pressure term
        const pressureTerm = pi / (rhoi * rhoi) + pj / (rhoj * rhoj);

        // Monaghan artificial viscosity
        const dvx = vxi - vx[j];
        const dvy = vyi - vy[j];
        const vdotr = dvx * dx + dvy * dy;
        let visc = 0;
        if (vdotr < 0) {
          const mu = h * vdotr / (r2 + eps * h * h);
          const rhobar = 0.5 * (rhoi + rhoj);
          visc = (-alpha * c0 * mu + beta * mu * mu) / rhobar;
        }

        const coeff = -mass * (pressureTerm + visc);
        fxi += coeff * grad[0];
        fyi += coeff * grad[1];
      }

      _ax[i] = fxi + gx;
      _ay[i] = fyi + gy;
    }
  }

  /** Symplectic Euler (velocity-Störmer-Verlet kick-drift). */
  _integrate(dt) {
    const { N, x, y, vx, vy, _ax, _ay, ptype } = this;
    // Speed cap: 2*c0 prevents runaway velocities from overwhelming DBC ghost layers
    const vMax = 2 * this.c0;
    const vMax2 = vMax * vMax;
    for (let i = 0; i < N; i++) {
      if (ptype[i] === 1) continue; // boundary particles are fixed
      // Kick
      vx[i] += _ax[i] * dt;
      vy[i] += _ay[i] * dt;
      // Clamp fluid speed to 2*c0 so excessive velocity cannot tunnel through ghost layers
      const speed2 = vx[i] * vx[i] + vy[i] * vy[i];
      if (speed2 > vMax2) {
        const scale = vMax / Math.sqrt(speed2);
        vx[i] *= scale;
        vy[i] *= scale;
      }
      // Drift
      x[i] += vx[i] * dt;
      y[i] += vy[i] * dt;
    }
    applyBoundary(this);
  }

  /** CFL-limited timestep. Returns dt <= maxDt. */
  _cflDt(maxDt) {
    const { N, vx, vy, _ax, _ay, h, c0, cfl, ptype } = this;
    // vx/vy are post-kick from the previous step (one-step lag), absorbed by the cfl safety factor
    let vmax2 = 0;
    let amax = 0;
    for (let i = 0; i < N; i++) {
      if (ptype[i] === 1) continue; // boundary particles have zero velocity and acceleration
      const v2 = vx[i] * vx[i] + vy[i] * vy[i];
      if (v2 > vmax2) vmax2 = v2;
      const a = Math.sqrt(_ax[i] * _ax[i] + _ay[i] * _ay[i]);
      if (a > amax) amax = a;
    }
    const vmax = Math.sqrt(vmax2);
    // CFL: dt_v = h / (c0 + vmax)
    const dtV = cfl * h / (c0 + vmax + 1e-10);
    // Force CFL: dt_f = cfl * sqrt(h / amax)
    const dtF = amax > 1e-10 ? cfl * Math.sqrt(h / amax) : maxDt;
    return Math.min(maxDt, dtV, dtF);
  }

  /**
   * Advance simulation by up to maxDt seconds (may use a smaller CFL-limited step).
   * Returns the actual dt used.
   * @param {number} maxDt  maximum timestep (seconds)
   * @returns {number} actual dt used
   */
  step(maxDt = 0.005) {
    this._stepCount++;
    this._computeDensity();
    // Periodic Shepard density reinitialization: every 30 steps, correct surface/wall density
    if (this._stepCount % 30 === 0) this._shepardDensity();
    this._computePressure();
    this._computeForces();
    const dt = this._cflDt(maxDt);
    this._integrate(dt);
    return dt;
  }

  /**
   * Compute current kinetic energy (useful for validation).
   * @returns {number}
   */
  kineticEnergy() {
    const { N, vx, vy, mass, ptype } = this;
    let ke = 0;
    for (let i = 0; i < N; i++) {
      if (ptype[i] === 1) continue;
      ke += vx[i] * vx[i] + vy[i] * vy[i];
    }
    return 0.5 * mass * ke;
  }

  /**
   * Compute total linear momentum [px, py] (useful for validation).
   * @returns {[number, number]}
   */
  linearMomentum() {
    const { N, vx, vy, mass, ptype } = this;
    let px = 0, py = 0;
    for (let i = 0; i < N; i++) {
      if (ptype[i] === 1) continue;
      px += vx[i]; py += vy[i];
    }
    return [mass * px, mass * py];
  }

  /**
   * Add a single particle at (x, y) with optional velocity and type.
   * Grows all SoA arrays by doubling capacity when needed.
   * Returns true on success, false if MAX_PARTICLES would be exceeded
   * (caller must enforce the cap before calling).
   *
   * @param {number} x      world x (m)
   * @param {number} y      world y (m)
   * @param {number} [vx=0]
   * @param {number} [vy=0]
   * @param {number} [type=0]  0 = fluid, 1 = boundary
   * @returns {boolean}
   */
  addParticle(x, y, vx = 0, vy = 0, type = 0) {
    const i = this.N;

    // Grow arrays if at capacity
    if (i >= this._capacity) {
      const newCap = Math.max(this._capacity * 2, 64);
      const floatKeys = ['x', 'y', 'vx', 'vy', 'density', 'pressure', '_ax', '_ay'];
      for (const k of floatKeys) {
        const next = new Float32Array(newCap);
        next.set(this[k]);
        this[k] = next;
      }
      const nextPtype = new Uint8Array(newCap);
      nextPtype.set(this.ptype);
      this.ptype = nextPtype;
      this._capacity = newCap;
    }

    this.x[i]        = x;
    this.y[i]        = y;
    this.vx[i]       = vx;
    this.vy[i]       = vy;
    this.density[i]  = this.rho0;
    this.pressure[i] = 0;
    this._ax[i]      = 0;
    this._ay[i]      = 0;
    this.ptype[i]    = type;
    if (type === 1) this._nBoundary++;
    else            this._nFluid++;
    this.N++;
    return true;
  }
}
