/**
 * Owner of the VOLUME mesh format contract (the art projection contract is RenderBillboard's).
 * `load` parses `meshes/<name>.vox` (an included file, committed as-is — the editable source IS
 * the shipped asset) into a cached VoxModel; `mesh` greedy-meshes one into a vertex buffer for
 * RenderMesh. First model per file only (a multi-model file warns and uses the first).
 *
 * Emitted vertex stream (24 B/vertex, pr_trianglelist) — a LOCKSTEP pair with the consumer's
 * declared format (RenderMesh._format; RenderWalls emits the same layout for wall quads):
 * position 3×f32 | colour RGBA u8 | texcoord 2×f32. The colour is the raw palette ALBEDO
 * (the palette is the texture; no bitmap assets), UNSHADED — shMeshlit lights it live. The
 * texcoord carries the PACKED FACE NORMAL (u = nx, v = ny; the shader derives
 * nz = -sqrt(max(0, 1 - u² - v²)) — valid because no BOTTOM face is ever emitted, so nz ≤ 0
 * in the up-is-negative-z convention).
 *
 * Coordinate map (MagicaVoxel is z-up): game x = vox x, game y = vox y (+y = south/front),
 * game z = -vox z (up = -z, the RenderBillboard convention). 1 voxel = 1 world px; the mesh is
 * centered on the footprint (Position = footprint center), feet at z = 0.
 *
 * TOP + all FOUR side orientations are emitted, so a runtime `Mesh.yaw` shows a solid model
 * from any facing (shMeshlit rotates the packed normals by mat3(world)):
 *   TOP (air above, packed (0,0)) · SOUTH (air +y, (0,1)) · NORTH (air -y, (0,-1))
 *   EAST (air +x, (1,0)) · WEST (air -x, (-1,0))
 * BOTTOM faces never (nz > 0 is unrepresentable in the packing; only visible past a ~90° tip).
 *
 * Exposed faces are GREEDY-MESHED per orientation plane: coplanar same-color faces merge into
 * one quad (flat vertex color + constant normal — identical render at a fraction of the vertex
 * count). Plane iteration and the in-plane row-major scan are ordered, so output is
 * deterministic for a given .vox.
 *
 * `content` (tight non-empty voxel extent) replaces the old baked meshes.json manifest —
 * ColonySpawn.footprint derives mesh-prop colliders from it.
 */
globalThis.Vox = {
  _cache: {}, // name -> VoxModel | null (null = missing/malformed, checked once per run)

  /**
   * @typedef {Object} VoxModel
   * @property {number[]} size    .vox canvas [sx, sy, sz] (voxels = world px)
   * @property {number[]} content tight non-empty voxel extent [w, h, d]
   * @property {number[]} grid    dense canvas, x + sx*(y + sy*z) -> 1-based palette index (0 = empty)
   * @property {number[]} palR    palette red 0-255, indexed by palette index - 1
   * @property {number[]} palG    palette green 0-255
   * @property {number[]} palB    palette blue 0-255
   */

  /**
   * Cached parse of meshes/<name>.vox; undefined when the file is missing (the caller owns the
   * miss report — RenderMesh warns once per model) or malformed (logged here once).
   */
  load(name) {
    const hit = Vox._cache[name];
    if (hit !== undefined) return hit === null ? undefined : hit;
    let m = null;
    const buf = buffer_load(`meshes/${name}.vox`);
    if (buffer_exists(buf)) {
      m = Vox._parse(buf, name);
      buffer_delete(buf);
    }
    Vox._cache[name] = m;
    return m === null ? undefined : m;
  },

  /**
   * Greedy-mesh a model into a NEW vertex buffer (caller owns it: freeze/delete);
   * -1 when the .vox is missing or malformed. `format` is the lockstep layout above.
   */
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
   * Linear chunk walk (children sit directly after a parent's content, so one forward scan
   * visits every chunk): first SIZE + XYZI pair + the RGBA palette. Malformed -> null + one
   * Log.error (a bad committed asset must fail loudly, not draw nothing silently).
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
    let off = 8; // past "VOX " + version; MAIN's n = 0, so the scan steps into its children
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

  /**
   * Merge a plane's cells into maximal same-color rects: row-major scan (v outer), extend
   * along +u first, then grow +v while the whole run matches; consumed cells are zeroed
   * (`cells` is CONSUMED). Deterministic for a given cell set. emit: (u0, v0, w, h, colorIndex).
   */
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

  /**
   * Emit the model's exposed faces as a raw 24 B/vertex stream in a NEW fixed buffer (caller
   * deletes). Orientation blocks run TOP, SOUTH, NORTH, EAST, WEST; planes ascend — the same
   * order as the retired vox2vbuf.py bake, so output is byte-identical to the old .vbuf.
   */
  _verts(m) {
    const sx = m.size[0];
    const sy = m.size[1];
    const sz = m.size[2];
    const grid = m.grid;
    const ox = sx / 2;
    const oy = sy / 2;
    const verts = []; // x, y, z, r, g, b, nu, nv per vertex

    /** Quad corners in consistent order (cull is off in-engine); c is a 1-based palette index. */
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

    // TOP: plane per z, cells keyed (x, y), exposed when the voxel above is air
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
    // SOUTH: plane per y, cells keyed (x, z), face lies at y+1
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
    // NORTH: plane per y, cells keyed (x, z), face lies at y
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
    // EAST: plane per x, cells keyed (y, z), face lies at x+1
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
    // WEST: plane per x, cells keyed (y, z), face lies at x
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
