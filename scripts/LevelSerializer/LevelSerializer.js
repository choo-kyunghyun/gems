/**
 * Level FILE i/o. A file is a LevelData (its content channels, in grid coords) plus the level-scope
 * keys LevelData has no opinion on: `version`/`genre` for the load guards and `meta` for spawn
 * entries, climate, settlements and the generator seed.
 */
globalThis.LevelSerializer = {
  CURRENT_VERSION: 1,

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
    if (!Array.isArray(data.spawns)) {
      Log.error(`LevelSerializer: missing required field (spawns) in ${path}`);
      return null;
    }
    // optional, but a non-array would fail deep inside the painter instead of here
    if (data.tiles !== undefined && !Array.isArray(data.tiles)) {
      Log.error(`LevelSerializer: tiles is not an array in ${path}`);
      return null;
    }
    return data;
  },

  /**
   * Hand-editable, diff-friendly form — Json.encode's `pretty` mode owns the layout (and the
   * native nested-stringify workaround behind it). Returns undefined if the codec aborted.
   */
  serialize(data) {
    return Json.encode(data, { pretty: true });
  },

  save(path, data) {
    const text = LevelSerializer.serialize(data);
    if (text === undefined) return false; // codec already Log.error'd — never write a truncated level
    return File.write(path, text);
  },
};
