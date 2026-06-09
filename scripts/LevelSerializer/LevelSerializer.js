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
      Log.error(`LevelSerializer: missing required fields (layers, spawns) in ${path}`);
      return null;
    }
    return data;
  },

  /**
   * Write level data to a file as JSON.
   * @param {string} path
   * @param {object} data
   * @returns {boolean}
   */
  save(path, data) {
    return File.write(path, JSON.stringify(data, null, 2));
  },
};
