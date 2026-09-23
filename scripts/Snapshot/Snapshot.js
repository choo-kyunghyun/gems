/**
 * A save is built by an ordered list of passes, each owning one aspect of the world; the same
 * pass captures and restores its slice, so the two directions can never drift. A scene inserts
 * exactly the passes its content needs, so levels with different component sets share one save.
 *
 * A pass is `{ id, capture(ctx), restore(ctx) }`; a bare fn is a capture-only pass.
 *
 * The bundle is hybrid: variable-shape data goes into a JSON manifest, dense fixed-shape data into
 * named binary blobs. This builds and consumes the bundle in memory only; the disk side is the
 * caller's. The ctx handed to each pass:
 *   ctx.mode      "capture" | "restore"
 *   ctx.scene     the live scene
 *   ctx.manifest  the JSON tree
 *   ctx.putBlob(name, buffer)  capture: buffer ownership moves to the bundle
 *   ctx.getBlob(name)          restore: the loaded buffer, or undefined; the caller still owns it
 *   ctx.takeBlob(name)         restore: ownership moves to the pass, for a blob applied after the
 *                              restore itself; the caller frees only what was never taken
 */
globalThis.Snapshot = class Snapshot {
  constructor() {
    this.passes = [];
  }

  _wrap(pass) {
    if (typeof pass === "function")
      return { id: "", capture: pass, restore: () => {} };
    return pass;
  }

  /** Order is the capture and restore order. */
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
   * Returns `{ manifest, blobs }`: a JSON-encodable tree and an array of { name, buffer } the
   * caller owns and frees.
   */
  capture(scene) {
    const manifest = {};
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
   * `manifest` is the parsed, ref-revived manifest; `blobs` maps name -> buffer, owned by the
   * caller. A taken name is deleted from `blobs`, so the caller's sweep afterwards frees only
   * what no pass claimed. Passes rebuild scene state in place.
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
