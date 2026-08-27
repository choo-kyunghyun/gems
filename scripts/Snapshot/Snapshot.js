/**
 * A save is built by an ordered list of PASSES, each owning one aspect of the world (metadata,
 * world-sim, per-map entities, tile grids, …); the same pass captures AND restores its
 * slice, so the two directions can never drift. Composition, not a monolith — a scene inserts exactly
 * the passes its content needs, which is why different levels can carry different component/system
 * sets in one save.
 *
 * A pass is `{ id, capture(ctx), restore(ctx) }` (a bare fn is wrapped as a capture-only pass).
 * insert/remove mirror Renderer/LevelGen.
 *
 * THE BUNDLE is HYBRID by design: passes write structured, variable-shape data (metadata, the per-map
 * component set — self-describing, differs per level) into a JSON manifest, and dense fixed-shape data
 * (tile grids) into named binary blobs. SaveGame owns the disk side (manifest.json +
 * <name>.bin under saves/<slot>/); Snapshot only builds/consumes the bundle in memory, so it stays
 * engine-generic. The ctx handed to each pass:
 *   ctx.mode      "capture" | "restore"
 *   ctx.scene     the live scene (read live state on capture; write it on restore)
 *   ctx.manifest  the JSON tree — write on capture, read on restore
 *   ctx.putBlob(name, buffer)  capture: hand a binary blob to the bundle (buffer ownership moves to the bundle)
 *   ctx.getBlob(name)          restore: the loaded buffer for `name`, or undefined (the caller still owns it)
 *   ctx.takeBlob(name)         restore: the same buffer, OWNERSHIP MOVED to the pass — for a blob applied
 *                              later than the restore itself (a parked map's grid, unpacked on first visit);
 *                              the caller frees only what was never taken
 */
globalThis.Snapshot = class Snapshot {
  static VERSION = 2; // bump when the manifest/blob layout changes incompatibly

  constructor() {
    this.passes = [];
  }

  /**
   * Wrap a bare fn as a capture-only pass; pass an object through. Mirrors Renderer/LevelGen.
   */
  _wrap(pass) {
    if (typeof pass === "function")
      return { id: "", capture: pass, restore: () => {} };
    return pass;
  }

  /** Insert a pass (append by default; order IS the capture/restore order). */
  insert(pass, index = this.passes.length) {
    this.passes.splice(index, 0, this._wrap(pass));
    return this;
  }

  remove(pass) {
    const i = this.passes.indexOf(pass);
    if (i >= 0) this.passes.splice(i, 1);
    return this;
  }

  /**
   * CAPTURE: run each pass in order, accumulating the hybrid bundle. Returns
   * `{ manifest, blobs }` — manifest a JSON-encodable tree, blobs an array of { name, buffer }
   * the caller owns (SaveGame writes them, then buffer_deletes).
   */
  capture(scene) {
    const manifest = { version: Snapshot.VERSION };
    const blobs = [];
    const ctx = {
      mode: "capture",
      scene,
      manifest,
      putBlob: (name, buffer) => {
        blobs.push({ name, buffer });
      },
      getBlob: (_name) => undefined,
      takeBlob: (_name) => undefined,
    };
    for (let i = 0; i < this.passes.length; i++) this.passes[i].capture(ctx);
    return { manifest, blobs };
  }

  /**
   * RESTORE: run each pass in order against a loaded bundle. `manifest` is the parsed JSON
   * manifest (already ref-revived by Json.decode); `blobs` maps name -> buffer (owned by the
   * caller; a pass reads through getBlob, or takes ownership through takeBlob — a taken name is
   * deleted from `blobs`, so the caller's sweep afterwards frees only what no pass claimed).
   * Passes reconstruct scene state in place.
   */
  restore(scene, manifest, blobs) {
    const ctx = {
      mode: "restore",
      scene,
      manifest,
      putBlob: (_name, _buffer) => {},
      getBlob: (name) => blobs[name],
      takeBlob: (name) => {
        const b = blobs[name];
        delete blobs[name];
        return b;
      },
    };
    for (let i = 0; i < this.passes.length; i++) this.passes[i].restore(ctx);
  }
};
