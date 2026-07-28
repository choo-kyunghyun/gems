globalThis.LevelSerializer = {
  CURRENT_VERSION: 1,

  /**
   * Load and validate a level file.
   * @param {string} path
   * @param {{ genre?: string }} [opts]
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
   * Serialize to the hand-editable, diff-friendly form — Json.encode's `pretty` mode owns the
   * layout (and the native nested-stringify workaround behind it).
   * @param {object} data
   * @returns {string|undefined} undefined if the codec aborted
   */
  serialize(data) {
    return Json.encode(data, { pretty: true });
  },

  /** @param {string} path @param {object} data @returns {boolean} */
  save(path, data) {
    const text = LevelSerializer.serialize(data);
    if (text === undefined) return false; // codec already Log.error'd — never write a truncated level
    return File.write(path, text);
  },
};
