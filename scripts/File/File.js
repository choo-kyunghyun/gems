// TODO: static exists(fname)
globalThis.File = class File {
  // Pending async Save/Load requests, keyed by the id buffer_*_async returns.
  // obj_game's Async Save/Load event (Other_72) calls File._resolve(id, status)
  // to dispatch each completion back to its callback on the main thread.
  static _pending = {};

  static find(mask) {
    const files = [];
    let fname = file_find_first(mask, fa_none);
    while (fname !== "") {
      files.push(fname);
      fname = file_find_next();
    }
    file_find_close();
    return files;
  }

  static read(fname) {
    const buffer = buffer_load(fname);
    if (buffer === -1) return undefined;
    // buffer_text reads until a NUL terminator. buffer_load gives an exact-size buffer with
    // no guaranteed NUL, so on a file that isn't NUL-terminated (e.g. one written by
    // File.write, or any without a trailing terminator) the read runs past the content into
    // uninitialized memory and returns the text plus garbage — which corrupts JSON.parse
    // non-deterministically. Append our own NUL so the read stops exactly at end-of-file.
    const size = buffer_get_size(buffer);
    buffer_resize(buffer, size + 1);
    buffer_poke(buffer, size, buffer_u8, 0);
    buffer_seek(buffer, buffer_seek_start, 0);
    const data = buffer_read(buffer, buffer_text);
    buffer_delete(buffer);
    return data;
  }

  static write(fname, data) {
    const buffer = buffer_create(0, buffer_grow, 1);
    if (buffer_write(buffer, buffer_text, data) !== 0) {
      buffer_delete(buffer);
      return false;
    }
    buffer_save(buffer, fname);
    buffer_delete(buffer);
    return true;
  }

  // ── Binary I/O ──────────────────────────────────────────────────────────────
  // For data that should not go through text/JSON: tile grids, dense per-cell
  // layers, anything large or non-scalar. JSON text on GMRT both hard-faults on
  // nested values and has an O(n²) serialize cost for big inline arrays — a
  // contract-based binary buffer sidesteps both (and round-trips an order of
  // magnitude faster). The caller owns the read/write encoding; File only moves
  // the bytes to and from disk.

  /**
   * Load a file into a fresh buffer for binary reading. The caller OWNS the
   * returned buffer and MUST buffer_delete() it when done.
   * @param {string} fname
   * @returns {*} buffer handle, or undefined if the file does not exist
   */
  static readBuffer(fname) {
    const buffer = buffer_load(fname);
    if (buffer === -1) return undefined;
    return buffer;
  }

  /**
   * Write a buffer to disk. Saves only the bytes actually written, not the
   * buffer's allocated capacity — a buffer_grow buffer over-allocates, so a
   * plain buffer_save would pad the file (and the buffer_load that reads it
   * back) with trailing garbage. buffer_save_ext with the used size avoids that.
   * @param {string} fname
   * @param {*} buffer  a buffer handle the caller wrote into
   * @returns {boolean}
   */
  static writeBuffer(fname, buffer) {
    buffer_save_ext(buffer, fname, 0, buffer_get_used_size(buffer));
    return true;
  }

  // ── Async binary I/O ────────────────────────────────────────────────────────
  // buffer_save_async / buffer_load_async stream to disk off the main thread, so
  // a huge save can't freeze the frame — and the console vendors (Xbox/PS/Switch)
  // *require* async I/O to pass cert. Completion arrives later in obj_game's Async
  // Save/Load event, which routes it here via _resolve so the per-request callback
  // fires. NOTE: both functions auto-prefix a "default/" folder, so a file written
  // with saveAsync round-trips through loadAsync — NOT the sync read/readBuffer,
  // which look outside "default/".
  //
  // GMRT 0.20 CAVEAT — a known open runtime bug, not our code: GMRT's buffer_save /
  // buffer_save_ext (and these async variants) fail to create the destination
  // directory ("Failed to create directories ... The system cannot find the path
  // specified"; YoYo bug #15223). The async functions force a "default/" subfolder,
  // which trips exactly that, so the write never lands — yet buffer_save_async still
  // reports status:true (a false positive). On desktop GMRT use the sync writeBuffer/
  // readBuffer instead (root-level files need no new directory, so they're unaffected).
  // The plumbing here (event → _resolve → callback) is verified good, so these should
  // work once #15223 is fixed and on console (where async I/O is cert-required).

  /**
   * Asynchronously save a buffer's used bytes to disk. The caller still owns the
   * buffer and MUST keep it alive until `callback` fires (the save reads it off
   * the main thread); it may buffer_delete it afterwards.
   * @param {string} fname
   * @param {*} buffer  a buffer handle the caller wrote into
   * @param {(ok: boolean) => void} [callback]  fired with the save status
   * @returns {*} the async request id
   */
  static saveAsync(fname, buffer, callback) {
    const id = buffer_save_async(buffer, fname, 0, buffer_get_used_size(buffer));
    File._pending[id] = { load: false, buffer: -1, callback };
    return id;
  }

  /**
   * Asynchronously load a file into a fresh buffer. On success `callback` gets
   * the buffer and OWNS it (must buffer_delete when done); on failure it gets
   * undefined (the internal buffer is released first).
   * @param {string} fname
   * @param {(buffer: *|undefined) => void} callback
   * @returns {*} the async request id
   */
  static loadAsync(fname, callback) {
    const buffer = buffer_create(1, buffer_grow, 1);
    const id = buffer_load_async(buffer, fname, 0, -1); // -1 = whole file
    File._pending[id] = { load: true, buffer, callback };
    return id;
  }

  /**
   * Dispatch an Async Save/Load completion to its registered callback — called by
   * obj_game's Async Save/Load event with async_load's "id" + "status". Unknown
   * ids are ignored.
   * @param {*} id          the request id from saveAsync/loadAsync
   * @param {boolean} status  true if the operation succeeded
   */
  static _resolve(id, status) {
    const req = File._pending[id];
    if (req === undefined) return;
    delete File._pending[id];
    if (req.load) {
      if (status) {
        req.callback(req.buffer); // hand buffer ownership to the caller
      } else {
        buffer_delete(req.buffer);
        req.callback(undefined);
      }
    } else if (req.callback !== undefined) {
      req.callback(status);
    }
  }
};
