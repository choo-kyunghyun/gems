globalThis.LevelSerializer = {
  CURRENT_VERSION: 1,

  /**
   * Load and validate a level file.
   * @param {string} path @param {{ genre?: string }} [opts]
   * @returns {object|null} parsed data, or null on error
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
   * Serialize to indented JSON. Native JSON.stringify faults on nested objects/arrays
   * (#15565), so hand-roll the encoding, calling native stringify only on scalar leaves.
   * 2-space indent (scalar arrays inline) keeps level files diff-friendly + hand-editable.
   * @param {object} data @returns {string}
   */
  serialize(data) {
    return LevelSerializer._enc(data, "");
  },

  _enc(v, indent) {
    if (v === null || v === undefined) return "null";
    const t = typeof v;
    // native stringify on a scalar is safe + handles escaping
    if (t === "string") return JSON.stringify(v);
    if (t === "number" || t === "boolean") return String(v);

    const ni = indent + "  ";
    if (Array.isArray(v)) {
      if (v.length === 0) return "[]";
      // pure-scalar arrays (e.g. [x,y,w,h]) stay inline; object/array elements go multi-line
      let scalar = true;
      for (let i = 0; i < v.length; i++) {
        const e = v[i];
        if (e !== null && typeof e === "object") {
          scalar = false;
          break;
        }
      }
      if (scalar) {
        let out = "[";
        for (let i = 0; i < v.length; i++) {
          if (i > 0) out += ", ";
          out += LevelSerializer._enc(v[i], ni);
        }
        return out + "]";
      }
      let out = "[\n";
      for (let i = 0; i < v.length; i++) {
        if (i > 0) out += ",\n";
        out += ni + LevelSerializer._enc(v[i], ni);
      }
      return out + "\n" + indent + "]";
    }

    // plain object — one key per line
    const keys = Object.keys(v);
    if (keys.length === 0) return "{}";
    let out = "{\n";
    for (let i = 0; i < keys.length; i++) {
      if (i > 0) out += ",\n";
      out +=
        ni +
        JSON.stringify(keys[i]) +
        ": " +
        LevelSerializer._enc(v[keys[i]], ni);
    }
    return out + "\n" + indent + "}";
  },

  /** @param {string} path @param {object} data @returns {boolean} */
  save(path, data) {
    return File.write(path, LevelSerializer.serialize(data));
  },
};
