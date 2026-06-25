/**
 * Wendland C2 smoothing kernel for 2D SPH.
 *
 * Support radius: 2h (kernel is zero for r >= 2h).
 * 2D normalization constant: alpha = 7 / (4 * PI * h^2)
 *
 * W(r,h)  = alpha * (1 - q/2)^4 * (2q + 1),  q = r/h,  0 <= q < 2
 *         = 0,                                           q >= 2
 *
 * gradW returns the vector gradient: (dW/dx, dW/dy)
 * dW/dr = alpha * (-5q * (1 - q/2)^3) / h
 * dW/dx = (dW/dr) * (dx / r)
 */

const TWO_PI = 2 * Math.PI;

/**
 * Precompute per-h constants so they are not recomputed per particle pair.
 * Returns an object { alpha, invH, support } where support = 2h.
 * @param {number} h  smoothing length
 */
export function kernelConstants(h) {
  const alpha = 7 / (4 * Math.PI * h * h);
  return { alpha, invH: 1 / h, support: 2 * h };
}

/**
 * W(r, kc) — kernel value.
 * @param {number} r   distance between particles
 * @param {object} kc  result of kernelConstants(h)
 */
export function W(r, kc) {
  const q = r * kc.invH;
  if (q >= 2) return 0;
  const t = 1 - 0.5 * q;
  return kc.alpha * t * t * t * t * (2 * q + 1);
}

/**
 * gradW(dx, dy, r, kc, out) — kernel gradient vector written into out[0], out[1].
 * Safe: writes [0,0] when r is near zero.
 * Pass a pre-allocated length-2 array as `out` to avoid heap allocation (hot path).
 * When `out` is omitted a temporary array is allocated and returned (test/debug use).
 *
 * @param {number} dx   xi - xj
 * @param {number} dy   yi - yj
 * @param {number} r    distance (must equal sqrt(dx^2+dy^2))
 * @param {object} kc   result of kernelConstants(h)
 * @param {number[]} [out]  optional length-2 array; if omitted a new array is returned
 * @returns {number[]}  [gx, gy]  (same reference as `out` when provided)
 */
export function gradW(dx, dy, r, kc, out) {
  if (!out) out = [0, 0];
  if (r < 1e-12) { out[0] = 0; out[1] = 0; return out; }
  const q = r * kc.invH;
  if (q >= 2)    { out[0] = 0; out[1] = 0; return out; }
  const t = 1 - 0.5 * q;
  // dW/dr = alpha * (-5 * q * t^3) / h
  const dWdr = kc.alpha * (-5 * q * t * t * t) * kc.invH;
  const invR = 1 / r;
  out[0] = dWdr * dx * invR;
  out[1] = dWdr * dy * invR;
  return out;
}
