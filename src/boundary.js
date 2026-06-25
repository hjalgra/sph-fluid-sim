/**
 * Reflective boundary conditions for a rectangular domain [0,domainW] x [0,domainH].
 *
 * A restitution coefficient < 1 damps the normal velocity component on contact,
 * preventing walls from injecting energy. The particle radius (h/2) defines the
 * effective wall offset so particles don't clip through the boundary.
 *
 * Export: applyBoundary(engine) — called once per integration step after drift.
 */

/** Restitution coefficient (0 = fully inelastic, 1 = fully elastic). */
const RESTITUTION = 0.5;

/**
 * Apply reflective wall boundaries to all particles.
 * Modifies x, y, vx, vy in-place on the engine's SoA arrays.
 *
 * @param {object} eng  Engine instance with N, x, y, vx, vy, h, domainW, domainH
 */
export function applyBoundary(eng) {
  const { N, x, y, vx, vy, domainW, domainH, h, ptype } = eng;
  // Reflect at DBC zone outer edge (3 layers) so tunneled fluid bounces back into the domain;
  // falls back to h/2 for engines without DBC boundary particles
  const r = eng.spacing != null ? eng.spacing * 3 : h * 0.5;

  for (let i = 0; i < N; i++) {
    if (ptype[i] === 1) continue; // boundary particles are fixed; clamp applies to fluid only
    // Left wall
    if (x[i] < r) {
      x[i] = r;
      if (vx[i] < 0) vx[i] = -vx[i] * RESTITUTION;
    }
    // Right wall
    if (x[i] > domainW - r) {
      x[i] = domainW - r;
      if (vx[i] > 0) vx[i] = -vx[i] * RESTITUTION;
    }
    // Bottom wall
    if (y[i] < r) {
      y[i] = r;
      if (vy[i] < 0) vy[i] = -vy[i] * RESTITUTION;
    }
    // Top wall
    if (y[i] > domainH - r) {
      y[i] = domainH - r;
      if (vy[i] > 0) vy[i] = -vy[i] * RESTITUTION;
    }
  }
}
