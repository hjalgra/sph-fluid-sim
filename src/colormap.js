/**
 * Perceptual colormaps — builds a pre-baked RGBA lookup table via
 * piecewise-linear interpolation through palette key colours.
 */

// Named palettes: each entry is [t, [r, g, b]] with t in [0,1], RGB in 0-255.
const PALETTES = {
  viridis: [
    [0.000, [68,   1,  84]],
    [0.133, [71,  44, 122]],
    [0.267, [59,  81, 139]],
    [0.400, [44, 113, 142]],
    [0.533, [33, 145, 140]],
    [0.667, [57, 171, 109]],
    [0.800, [120, 209,  63]],
    [1.000, [253, 231,  37]],
  ],
  inferno: [
    [0.00, [  0,   0,   4]],
    [0.15, [ 40,  11,  84]],
    [0.30, [101,  21, 110]],
    [0.45, [159,  42,  99]],
    [0.60, [212,  72,  66]],
    [0.75, [245, 125,  21]],
    [0.90, [250, 193,  39]],
    [1.00, [252, 255, 164]],
  ],
  turbo: [
    [0.00, [ 48,  18,  59]],
    [0.20, [ 33, 144, 231]],
    [0.40, [ 68, 209, 153]],
    [0.55, [124, 224, 107]],
    [0.70, [253, 205,  57]],
    [0.85, [244, 114,  33]],
    [1.00, [165,  14,   1]],
  ],
  coolwarm: [
    [0.00, [ 59,  76, 192]],
    [0.25, [144, 178, 254]],
    [0.50, [221, 221, 221]],
    [0.75, [246, 148, 120]],
    [1.00, [180,   4,  38]],
  ],
};

/**
 * Build a pre-baked Uint8ClampedArray lookup table of length n*4 (RGBA).
 *
 * @param {string} [name='viridis'] — palette name (viridis|inferno|turbo|coolwarm)
 * @param {number} [n=256]
 * @returns {Uint8ClampedArray}
 */
export function buildLUT(name = 'viridis', n = 256) {
  const anchors = PALETTES[name] || PALETTES.viridis;
  const lut = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const tc = Math.max(0, Math.min(1, i / (n - 1)));
    let lo = anchors[0], hi = anchors[anchors.length - 1];
    for (let k = 0; k < anchors.length - 1; k++) {
      if (tc <= anchors[k + 1][0]) { lo = anchors[k]; hi = anchors[k + 1]; break; }
    }
    const span = hi[0] - lo[0];
    const f    = span > 0 ? (tc - lo[0]) / span : 0;
    lut[i * 4]     = Math.round(lo[1][0] + f * (hi[1][0] - lo[1][0]));
    lut[i * 4 + 1] = Math.round(lo[1][1] + f * (hi[1][1] - lo[1][1]));
    lut[i * 4 + 2] = Math.round(lo[1][2] + f * (hi[1][2] - lo[1][2]));
    lut[i * 4 + 3] = 255;
  }
  return lut;
}

/**
 * Build a CSS linear-gradient string from a LUT (for gradient-filled UI swatches).
 *
 * @param {Uint8ClampedArray} lut
 * @returns {string}
 */
export function lutToGradient(lut) {
  // Sample 8 evenly-spaced stops for a compact CSS string
  const stops = 8;
  const parts = [];
  for (let i = 0; i < stops; i++) {
    const t  = i / (stops - 1);
    const li = Math.round(t * 255) * 4;
    parts.push(`rgb(${lut[li]},${lut[li+1]},${lut[li+2]}) ${(t * 100).toFixed(1)}%`);
  }
  return `linear-gradient(to right, ${parts.join(', ')})`;
}
