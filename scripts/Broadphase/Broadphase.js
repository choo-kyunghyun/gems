// Uniform-grid broadphase for physics pair queries. Buckets entities by AABB
// center — each entity lives in exactly one cell. pairs() iterates within-cell
// and the 4 right-side adjacent-cell directions so each unordered pair is
// emitted exactly once, no deduplication needed.
//
// GMRT-safe: flat array-of-buckets, index loops throughout, no Map/Set, no
// empty for-initializers. Cell size must exceed entity full-width for
// center-based bucketing to guarantee all overlapping pairs are adjacent cells.
globalThis.Broadphase = class Broadphase {
  /**
   * @param {number} worldWidth
   * @param {number} worldHeight
   * @param {number} cellSize - must be > max entity diameter for correctness
   */
  constructor(worldWidth, worldHeight, cellSize) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(worldWidth / cellSize);
    this.rows = Math.ceil(worldHeight / cellSize);
    const n = this.cols * this.rows;
    this._buckets = [];
    for (let i = 0; i < n; i++) this._buckets.push([]);
  }

  clear() {
    for (let i = 0; i < this._buckets.length; i++) {
      this._buckets[i].length = 0;
    }
  }

  // Insert by AABB center (world coords). Out-of-bounds entities clamp to edge.
  insert(id, cx, cy) {
    const gx = Math.max(0, Math.min(this.cols - 1, Math.floor(cx / this.cellSize)));
    const gy = Math.max(0, Math.min(this.rows - 1, Math.floor(cy / this.cellSize)));
    this._buckets[gy * this.cols + gx].push(id);
  }

  // Calls fn(a, b) for each candidate pair — no duplicates.
  // Covers within-cell and all 8-neighbor cell pairs via 4 right-side directions.
  pairs(fn) {
    const cols = this.cols;
    const rows = this.rows;
    const buckets = this._buckets;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const ci = y * cols + x;
        const ab = buckets[ci];
        const an = ab.length;
        if (an === 0) continue;

        // within-cell
        for (let a = 0; a < an; a++) {
          for (let b = a + 1; b < an; b++) fn(ab[a], ab[b]);
        }

        // right (1, 0)
        if (x + 1 < cols) {
          const bb = buckets[ci + 1];
          const bn = bb.length;
          for (let a = 0; a < an; a++) {
            for (let b = 0; b < bn; b++) fn(ab[a], bb[b]);
          }
        }
        // below (0, 1)
        if (y + 1 < rows) {
          const bb = buckets[ci + cols];
          const bn = bb.length;
          for (let a = 0; a < an; a++) {
            for (let b = 0; b < bn; b++) fn(ab[a], bb[b]);
          }
        }
        // below-right (1, 1)
        if (x + 1 < cols && y + 1 < rows) {
          const bb = buckets[ci + cols + 1];
          const bn = bb.length;
          for (let a = 0; a < an; a++) {
            for (let b = 0; b < bn; b++) fn(ab[a], bb[b]);
          }
        }
        // below-left (-1, 1)
        if (x > 0 && y + 1 < rows) {
          const bb = buckets[ci + cols - 1];
          const bn = bb.length;
          for (let a = 0; a < an; a++) {
            for (let b = 0; b < bn; b++) fn(ab[a], bb[b]);
          }
        }
      }
    }
  }
};
