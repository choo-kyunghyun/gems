/**
 * Owner of the volume mesh format: parses `meshes/<name>.vox` into a cached VoxModel and
 * greedy-meshes it into a vertex buffer. Only a file's first model is used.
 *
 * Vertex stream (24 B/vertex, triangle list), in lockstep with the format the caller declares:
 * position 3×f32 | colour RGBA u8 | texcoord 2×f32. The colour is the unshaded palette albedo;
 * the texcoord packs the face normal's x/y, with z recovered as -sqrt(max(0, 1 - u² - v²)) —
 * sound only because bottom faces are never emitted, so nz ≤ 0.
 *
 * Coordinates: .vox is z-up, the game is up = -z, so game z = -vox z. 1 voxel = 1 world px; the
 * mesh is centered on its footprint with its feet at z = 0. The top and all four sides are
 * emitted, so a yawed model stays solid from any facing. Output is deterministic for a given file.
 */
globalThis.Vox = {
  _cache: {}, // name -> VoxModel | null (missing or malformed, checked once per run)

  /**
   * @typedef {Object} VoxModel
   * @property {number[]} size    .vox canvas [sx, sy, sz] (voxels = world px)
   * @property {number[]} content tight non-empty voxel extent [w, h, d]
   * @property {number[]} grid    dense canvas, x + sx*(y + sy*z) -> 1-based palette index (0 = empty)
   * @property {number[]} palR    palette red 0-255, indexed by palette index - 1
   * @property {number[]} palG
   * @property {number[]} palB
   */

  /**
   * Undefined when the file is missing (the caller reports the miss) or malformed (logged here
   * once).
   */
  load(name) {
    const hit = Vox._cache[name];
    if (hit !== undefined) return hit === null ? undefined : hit;
    let m = null;
    const buf = File.readBytes(`meshes/${name}.vox`);
    if (buf !== undefined) {
      m = Vox._parse(buf, name);
      buffer_delete(buf);
    }
    Vox._cache[name] = m;
    return m === null ? undefined : m;
  },

  /** A new vertex buffer the caller owns; -1 when the .vox is missing or malformed. */
  mesh(name, format) {
    const m = Vox.load(name);
    if (m === undefined) return -1;
    const buf = Vox._verts(m);
    const vb = vertex_create_buffer_from_buffer(buf, format);
    buffer_delete(buf);
    return vb;
  },

  _fourcc(buf, off) {
    return (
      String.fromCharCode(buffer_peek(buf, off, buffer_u8)) +
      String.fromCharCode(buffer_peek(buf, off + 1, buffer_u8)) +
      String.fromCharCode(buffer_peek(buf, off + 2, buffer_u8)) +
      String.fromCharCode(buffer_peek(buf, off + 3, buffer_u8))
    );
  },

  /**
   * Children sit directly after a parent's content, so one forward scan visits every chunk.
   * A malformed file logs an error and returns null: a bad asset fails loudly, not silently.
   */
  _parse(buf, name) {
    const len = buffer_get_size(buf);
    if (len < 20 || Vox._fourcc(buf, 0) !== "VOX ") {
      Log.error(`Vox: ${name}.vox is not a .vox file`);
      return null;
    }
    let size = null;
    let grid = null;
    let palR = null;
    let palG = null;
    let palB = null;
    let sizesSeen = 0;
    let minX = 0;
    let minY = 0;
    let minZ = 0;
    let maxX = 0;
    let maxY = 0;
    let maxZ = 0;
    let count = 0;
    let off = 8; // MAIN's content size is 0, so the scan steps into its children
    while (off + 12 <= len) {
      const id = Vox._fourcc(buf, off);
      const n = buffer_peek(buf, off + 4, buffer_s32);
      const body = off + 12;
      if (id === "SIZE") {
        sizesSeen++;
        if (size === null)
          size = [
            buffer_peek(buf, body, buffer_s32),
            buffer_peek(buf, body + 4, buffer_s32),
            buffer_peek(buf, body + 8, buffer_s32),
          ];
      } else if (id === "XYZI" && grid === null && size !== null) {
        const sx = size[0];
        const sy = size[1];
        count = buffer_peek(buf, body, buffer_s32);
        grid = new Array(sx * sy * size[2]).fill(0);
        for (let i = 0; i < count; i++) {
          const o = body + 4 + i * 4;
          const x = buffer_peek(buf, o, buffer_u8);
          const y = buffer_peek(buf, o + 1, buffer_u8);
          const z = buffer_peek(buf, o + 2, buffer_u8);
          grid[x + sx * (y + sy * z)] = buffer_peek(buf, o + 3, buffer_u8);
          if (i === 0) {
            minX = x;
            maxX = x;
            minY = y;
            maxY = y;
            minZ = z;
            maxZ = z;
          } else {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
          }
        }
      } else if (id === "RGBA") {
        palR = new Array(256);
        palG = new Array(256);
        palB = new Array(256);
        for (let i = 0; i < 256; i++) {
          palR[i] = buffer_peek(buf, body + i * 4, buffer_u8);
          palG[i] = buffer_peek(buf, body + i * 4 + 1, buffer_u8);
          palB[i] = buffer_peek(buf, body + i * 4 + 2, buffer_u8);
        }
      }
      off = body + n;
    }
    if (size === null || grid === null || count === 0) {
      Log.error(`Vox: ${name}.vox has no SIZE/XYZI model`);
      return null;
    }
    if (palR === null) {
      Log.error(`Vox: ${name}.vox has no RGBA palette (re-save from MagicaVoxel)`);
      return null;
    }
    if (sizesSeen > 1)
      Log.warn(`Vox: ${name}.vox holds ${sizesSeen} models — using the FIRST only`);
    return {
      size,
      content: [maxX - minX + 1, maxY - minY + 1, maxZ - minZ + 1],
      grid,
      palR,
      palG,
      palB,
    };
  },

  /** Merges a plane's cells into maximal same-color rects; `cells` is consumed. */
  _rects(cells, U, V, emit) {
    for (let v = 0; v < V; v++) {
      for (let u = 0; u < U; u++) {
        const c = cells[u + U * v];
        if (c === 0) continue;
        let w = 1;
        while (u + w < U && cells[u + w + U * v] === c) w++;
        let h = 1;
        while (v + h < V) {
          let ok = true;
          for (let i = 0; i < w; i++) {
            if (cells[u + i + U * (v + h)] !== c) {
              ok = false;
              break;
            }
          }
          if (!ok) break;
          h++;
        }
        for (let j = 0; j < h; j++) {
          for (let i = 0; i < w; i++) cells[u + i + U * (v + j)] = 0;
        }
        emit(u, v, w, h, c);
      }
    }
  },

  /** The exposed faces as a raw vertex stream in a new buffer the caller deletes. */
  _verts(m) {
    const sx = m.size[0];
    const sy = m.size[1];
    const sz = m.size[2];
    const grid = m.grid;
    const ox = sx / 2;
    const oy = sy / 2;
    const verts = []; // x, y, z, r, g, b, nu, nv per vertex

    /** `c` is a 1-based palette index. */
    const quad = (p1, p2, p3, p4, c, nu, nv) => {
      const r = m.palR[c - 1];
      const g = m.palG[c - 1];
      const b = m.palB[c - 1];
      const ps = [p1, p2, p3, p1, p3, p4];
      for (let i = 0; i < 6; i++) {
        const p = ps[i];
        verts.push(p[0], p[1], p[2], r, g, b, nu, nv);
      }
    };

    // TOP
    for (let z = 0; z < sz; z++) {
      const cells = new Array(sx * sy).fill(0);
      for (let y = 0; y < sy; y++) {
        for (let x = 0; x < sx; x++) {
          const c = grid[x + sx * (y + sy * z)];
          if (c !== 0 && (z + 1 === sz || grid[x + sx * (y + sy * (z + 1))] === 0))
            cells[x + sx * y] = c;
        }
      }
      Vox._rects(cells, sx, sy, (x0, y0, w, h, c) => {
        const gx = x0 - ox;
        const gy = y0 - oy;
        const hh = -(z + 1);
        quad([gx, gy, hh], [gx + w, gy, hh], [gx + w, gy + h, hh], [gx, gy + h, hh], c, 0, 0);
      });
    }
    // SOUTH
    for (let y = 0; y < sy; y++) {
      const cells = new Array(sx * sz).fill(0);
      for (let z = 0; z < sz; z++) {
        for (let x = 0; x < sx; x++) {
          const c = grid[x + sx * (y + sy * z)];
          if (c !== 0 && (y + 1 === sy || grid[x + sx * (y + 1 + sy * z)] === 0))
            cells[x + sx * z] = c;
        }
      }
      Vox._rects(cells, sx, sz, (x0, z0, w, h, c) => {
        const gx = x0 - ox;
        const gy = y + 1 - oy;
        const zt = 0 - z0; // 0 - z0, not -z0: IEEE -0 at the ground edge breaks byte determinism
        quad([gx, gy, -(z0 + h)], [gx + w, gy, -(z0 + h)], [gx + w, gy, zt], [gx, gy, zt], c, 0, 1);
      });
    }
    // NORTH
    for (let y = 0; y < sy; y++) {
      const cells = new Array(sx * sz).fill(0);
      for (let z = 0; z < sz; z++) {
        for (let x = 0; x < sx; x++) {
          const c = grid[x + sx * (y + sy * z)];
          if (c !== 0 && (y === 0 || grid[x + sx * (y - 1 + sy * z)] === 0))
            cells[x + sx * z] = c;
        }
      }
      Vox._rects(cells, sx, sz, (x0, z0, w, h, c) => {
        const gx = x0 - ox;
        const gy = y - oy;
        const zt = 0 - z0; // see SOUTH
        quad([gx + w, gy, -(z0 + h)], [gx, gy, -(z0 + h)], [gx, gy, zt], [gx + w, gy, zt], c, 0, -1);
      });
    }
    // EAST
    for (let x = 0; x < sx; x++) {
      const cells = new Array(sy * sz).fill(0);
      for (let z = 0; z < sz; z++) {
        for (let y = 0; y < sy; y++) {
          const c = grid[x + sx * (y + sy * z)];
          if (c !== 0 && (x + 1 === sx || grid[x + 1 + sx * (y + sy * z)] === 0))
            cells[y + sy * z] = c;
        }
      }
      Vox._rects(cells, sy, sz, (y0, z0, w, h, c) => {
        const gx = x + 1 - ox;
        const gy = y0 - oy;
        const zt = 0 - z0; // see SOUTH
        quad([gx, gy + w, -(z0 + h)], [gx, gy, -(z0 + h)], [gx, gy, zt], [gx, gy + w, zt], c, 1, 0);
      });
    }
    // WEST
    for (let x = 0; x < sx; x++) {
      const cells = new Array(sy * sz).fill(0);
      for (let z = 0; z < sz; z++) {
        for (let y = 0; y < sy; y++) {
          const c = grid[x + sx * (y + sy * z)];
          if (c !== 0 && (x === 0 || grid[x - 1 + sx * (y + sy * z)] === 0))
            cells[y + sy * z] = c;
        }
      }
      Vox._rects(cells, sy, sz, (y0, z0, w, h, c) => {
        const gx = x - ox;
        const gy = y0 - oy;
        const zt = 0 - z0; // see SOUTH
        quad([gx, gy, -(z0 + h)], [gx, gy + w, -(z0 + h)], [gx, gy + w, zt], [gx, gy, zt], c, -1, 0);
      });
    }

    const n = verts.length / 8;
    const buf = buffer_create(n * 24, buffer_fixed, 1);
    for (let i = 0; i < verts.length; i += 8) {
      buffer_write(buf, buffer_f32, verts[i]);
      buffer_write(buf, buffer_f32, verts[i + 1]);
      buffer_write(buf, buffer_f32, verts[i + 2]);
      buffer_write(buf, buffer_u8, verts[i + 3]);
      buffer_write(buf, buffer_u8, verts[i + 4]);
      buffer_write(buf, buffer_u8, verts[i + 5]);
      buffer_write(buf, buffer_u8, 255);
      buffer_write(buf, buffer_f32, verts[i + 6]);
      buffer_write(buf, buffer_f32, verts[i + 7]);
    }
    return buf;
  },
};
