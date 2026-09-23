/**
 * Low-poly volume meshes, baked offline so loading does no meshing.
 *
 * File format (little-endian):
 *   header 24 B: "PMSH" + u32 version (1) + u32 vertex count + f32 content w, d, h
 *   vertex 24 B: f32 x, y, z (canvas-centered, up = -z, feet at 0)
 *                + u8 r, g, b, 255 + f32 nx, ny (a packed normal:
 *                nz = -sqrt(1 - nx^2 - ny^2), so no face points down)
 */
globalThis.Poly = {
  _cache: {}, // name -> { content, count } | null (missing or malformed, checked once)

  /**
   * Undefined when the file is missing or malformed; the caller owns the fallback.
   * @returns {{ content: number[], count: number } | undefined}
   */
  load(name) {
    const hit = Poly._cache[name];
    if (hit !== undefined) return hit === null ? undefined : hit;
    let m = null;
    const buf = File.read(`meshes/${name}.mesh`, true);
    if (buf !== undefined) {
      m = Poly._parse(buf, name);
      buffer_delete(buf);
    }
    Poly._cache[name] = m;
    return m === null ? undefined : m;
  },

  /** Null when malformed; a malformed file is an error, a missing one is not. */
  _parse(buf, name) {
    if (
      buffer_get_size(buf) < 24 ||
      buffer_peek(buf, 0, buffer_u8) !== 80 || // "PMSH"
      buffer_peek(buf, 1, buffer_u8) !== 77 ||
      buffer_peek(buf, 2, buffer_u8) !== 83 ||
      buffer_peek(buf, 3, buffer_u8) !== 72
    ) {
      Log.error(`Poly: ${name}.mesh is not a PMSH file`);
      return null;
    }
    const version = buffer_peek(buf, 4, buffer_u32);
    if (version !== 1) {
      Log.error(`Poly: ${name}.mesh is PMSH v${version}, runtime reads v1`);
      return null;
    }
    const count = buffer_peek(buf, 8, buffer_u32);
    if (buffer_get_size(buf) !== 24 + count * 24) {
      Log.error(`Poly: ${name}.mesh body size mismatch (${count} vertices declared)`);
      return null;
    }
    return {
      content: [
        buffer_peek(buf, 12, buffer_f32),
        buffer_peek(buf, 16, buffer_f32),
        buffer_peek(buf, 20, buffer_f32),
      ],
      count: count,
    };
  },

  /**
   * A new vertex buffer the caller owns; -1 when the .mesh is missing or malformed. `format`
   * must declare position_3d + colour + texcoord, in lockstep with the vertex layout above.
   */
  mesh(name, format) {
    const m = Poly.load(name);
    if (m === undefined) return -1;
    const buf = File.read(`meshes/${name}.mesh`, true);
    if (buf === undefined) return -1;
    const body = buffer_create(m.count * 24, buffer_fixed, 1);
    buffer_copy(buf, 24, m.count * 24, body, 0);
    buffer_delete(buf);
    const vb = vertex_create_buffer_from_buffer(body, format);
    buffer_delete(body);
    return vb;
  },
};
