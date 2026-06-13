globalThis.LevelSerializer = {
  CURRENT_VERSION: 1,

  /**
   * Load and validate a level file.
   * @param {string} path
   * @param {{ genre?: string }} [opts]
   * @returns {object|null} parsed level data, or null on error
   */
  load(path, opts = {}) {
    const raw = File.read(path);
    if (raw === undefined) {
      Log.error(`LevelSerializer: file not found: ${path}`);
      return null;
    }
    const data = JSON.parse(raw);
    if (opts.genre !== undefined && data.genre !== opts.genre) {
      Log.error(
        `LevelSerializer: genre mismatch (expected "${opts.genre}", got "${data.genre}") in ${path}`,
      );
      return null;
    }
    if (data.version > LevelSerializer.CURRENT_VERSION) {
      Log.error(
        `LevelSerializer: version ${data.version} > current ${LevelSerializer.CURRENT_VERSION} in ${path}`,
      );
      return null;
    }
    if (!Array.isArray(data.layers) || !Array.isArray(data.spawns)) {
      Log.error(
        `LevelSerializer: missing required fields (layers, spawns) in ${path}`,
      );
      return null;
    }
    return data;
  },

  /**
   * Serialize level data to a JSON string. GMRT's native JSON.stringify hard-faults on
   * nested objects/arrays (see SaveData header), and level data is deeply nested (walls
   * rects, spawns with loot arrays, zoneMaps) — so this hand-rolls the encoding, calling
   * native JSON.stringify only on scalar leaves (safe) and building nesting by string
   * concatenation. Array.map / Object.keys are GMRT-safe (cf. Level.export).
   * @param {object} data
   * @returns {string}
   */
  serialize(data) {
    return LevelSerializer._enc(data);
  },

  _enc(v) {
    if (v === null || v === undefined) return "null";
    const t = typeof v;
    // Scalars: native stringify on a string/number/bool is safe and handles escaping.
    if (t === "string") return JSON.stringify(v);
    if (t === "number" || t === "boolean") return String(v);
    if (Array.isArray(v)) {
      let out = "[";
      for (let i = 0; i < v.length; i++) {
        if (i > 0) out += ",";
        out += LevelSerializer._enc(v[i]);
      }
      return out + "]";
    }
    // Plain object.
    const keys = Object.keys(v);
    let out = "{";
    for (let i = 0; i < keys.length; i++) {
      if (i > 0) out += ",";
      out += JSON.stringify(keys[i]) + ":" + LevelSerializer._enc(v[keys[i]]);
    }
    return out + "}";
  },

  /**
   * Write level data to a file as JSON (via the manual serializer above).
   * @param {string} path
   * @param {object} data
   * @returns {boolean}
   */
  save(path, data) {
    return File.write(path, LevelSerializer.serialize(data));
  },
};
