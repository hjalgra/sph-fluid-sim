/**
 * Uniform linked-list cell grid for O(N) neighbor search.
 *
 * Cell size equals the kernel support radius (2h), so a 3x3 neighborhood
 * of cells covers all particles within that radius.
 *
 * Data structures:
 *   head[cellIdx]  — index of the first particle in a cell (-1 = empty)
 *   next[i]        — index of the next particle in the same cell as i (-1 = end)
 *
 * Usage:
 *   const g = new Grid(domainW, domainH, cellSize);
 *   g.build(x, y, N);
 *   g.forEachNeighbor(xi, yi, (j) => { ... });
 */
export class Grid {
  /**
   * @param {number} domainW  domain width
   * @param {number} domainH  domain height
   * @param {number} cellSize kernel support radius (= 2h)
   */
  constructor(domainW, domainH, cellSize) {
    this.domainW = domainW;
    this.domainH = domainH;
    this.cellSize = cellSize;
    this.nx = Math.ceil(domainW / cellSize);
    this.ny = Math.ceil(domainH / cellSize);
    const nCells = this.nx * this.ny;
    this.head = new Int32Array(nCells).fill(-1);
    this.next = null; // allocated lazily or on build
  }

  /** Rebuild the grid from current positions. O(N). */
  build(x, y, N) {
    const { nx, ny, cellSize } = this;
    const nCells = nx * ny;

    // Reuse or (re)allocate next array
    if (!this.next || this.next.length < N) {
      this.next = new Int32Array(N);
    }

    // Clear head
    this.head.fill(-1);

    for (let i = 0; i < N; i++) {
      const cx = Math.floor(x[i] / cellSize);
      const cy = Math.floor(y[i] / cellSize);
      // Clamp to valid cell range
      const cxi = Math.max(0, Math.min(nx - 1, cx));
      const cyi = Math.max(0, Math.min(ny - 1, cy));
      const cellIdx = cyi * nx + cxi;
      this.next[i] = this.head[cellIdx];
      this.head[cellIdx] = i;
    }
  }

  /**
   * Iterate over all particles in the 3x3 neighborhood of (px, py).
   * Calls cb(j) for each candidate particle j (caller checks actual distance).
   * @param {number} px  query x
   * @param {number} py  query y
   * @param {function} cb callback(j)
   */
  forEachNeighbor(px, py, cb) {
    const { nx, ny, cellSize, head, next } = this;
    const cx = Math.floor(px / cellSize);
    const cy = Math.floor(py / cellSize);

    for (let dcy = -1; dcy <= 1; dcy++) {
      const ccy = cy + dcy;
      if (ccy < 0 || ccy >= ny) continue;
      for (let dcx = -1; dcx <= 1; dcx++) {
        const ccx = cx + dcx;
        if (ccx < 0 || ccx >= nx) continue;
        let j = head[ccy * nx + ccx];
        while (j !== -1) {
          cb(j);
          j = next[j];
        }
      }
    }
  }

  /**
   * Fill `out` array with all candidate particle indices in the 3×3 neighborhood.
   * Returns the count written. `out` must have capacity >= expected neighbor count.
   * Avoids closure/callback overhead for hot inner loops.
   *
   * @param {number} px   query x
   * @param {number} py   query y
   * @param {Int32Array} out  pre-allocated scratch array
   * @returns {number} count of candidates written to out
   */
  getNeighbors(px, py, out) {
    const { nx, ny, cellSize, head, next } = this;
    const cx = Math.floor(px / cellSize);
    const cy = Math.floor(py / cellSize);
    let n = 0;

    for (let dcy = -1; dcy <= 1; dcy++) {
      const ccy = cy + dcy;
      if (ccy < 0 || ccy >= ny) continue;
      for (let dcx = -1; dcx <= 1; dcx++) {
        const ccx = cx + dcx;
        if (ccx < 0 || ccx >= nx) continue;
        let j = head[ccy * nx + ccx];
        while (j !== -1) {
          out[n++] = j;
          j = next[j];
        }
      }
    }
    return n;
  }
}
