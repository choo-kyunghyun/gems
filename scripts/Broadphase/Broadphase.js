/**
 * Uniform-grid broadphase for O(n) physics pair queries: buckets each entity
 * into ONE cell by its AABB center, and `pairs()` sweeps within-cell plus the
 * forward half of the 8-neighborhood (right, below, below-right, below-left)
 * so every unordered pair fires exactly once, no dedup. Correctness rests on
 * `cellSize` exceeding the largest entity's full width or height: two
 * overlapping AABBs then always share a cell or sit in adjacent cells, so the
 * sweep can't miss the pair.
 *
 * Opt a symmetric-pair system in by assigning an instance to the store's
 * `broadphase` field — `SeparationSystem` rebuilds + sweeps it per tick, else
 * falls back to O(n²) (`ColonyMap._buildSpatial` wires one). Body-vs-static
 * queries are asymmetric and keep their own grid in `SolidSystem`.
 */
globalThis.Broadphase = class Broadphase {
  constructor(worldWidth, worldHeight, cellSize) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(worldWidth / cellSize);
    this.rows = Math.ceil(worldHeight / cellSize);
    const n = this.cols * this.rows;
    this._buckets = [];
    for (let i = 0; i < n; i++) this._buckets.push([]);
    this._rect = AABB.rect(); // reused by rebuild — one bucketing pass per tick per sweeper
  }

  clear() {
    for (let i = 0; i < this._buckets.length; i++) {
      this._buckets[i].length = 0;
    }
  }

  insert(id, cx, cy) {
    const gx = Math.max(
      0,
      Math.min(this.cols - 1, Math.floor(cx / this.cellSize)),
    );
    const gy = Math.max(
      0,
      Math.min(this.rows - 1, Math.floor(cy / this.cellSize)),
    );
    this._buckets[gy * this.cols + gx].push(id);
  }

  rebuild(entities, ids) {
    this.clear();
    const r = this._rect;
    for (let i = 0; i < ids.length; i++) {
      AABB.ofInto(entities, ids[i], r);
      this.insert(ids[i], r.cx, r.cy);
    }
  }

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

        for (let a = 0; a < an; a++) {
          for (let b = a + 1; b < an; b++) fn(ab[a], ab[b]);
        }

        if (x + 1 < cols) {
          const bb = buckets[ci + 1];
          const bn = bb.length;
          for (let a = 0; a < an; a++) {
            for (let b = 0; b < bn; b++) fn(ab[a], bb[b]);
          }
        }
        if (y + 1 < rows) {
          const bb = buckets[ci + cols];
          const bn = bb.length;
          for (let a = 0; a < an; a++) {
            for (let b = 0; b < bn; b++) fn(ab[a], bb[b]);
          }
        }
        if (x + 1 < cols && y + 1 < rows) {
          const bb = buckets[ci + cols + 1];
          const bn = bb.length;
          for (let a = 0; a < an; a++) {
            for (let b = 0; b < bn; b++) fn(ab[a], bb[b]);
          }
        }
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
