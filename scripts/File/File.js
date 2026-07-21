// TODO: exists(fname)
globalThis.File = {
  // pending async requests keyed by buffer_*_async id; obj_game's Async event (Other_72)
  // calls _resolve(id, status) to dispatch each completion to its callback.
  _pending: {},

  find(mask) {
    const files = [];
    let fname = file_find_first(mask, fa_none);
    while (fname !== "") {
      files.push(fname);
      fname = file_find_next();
    }
    file_find_close();
    return files;
  },

  read(fname) {
    const buffer = buffer_load(fname);
    if (buffer === -1) return undefined;
    // buffer_text reads until a NUL, but buffer_load gives an exact-size buffer with no
    // guaranteed terminator — so the read runs past EOF into uninitialized memory and returns
    // garbage, corrupting JSON.parse non-deterministically. Append our own NUL to stop at EOF.
    const size = buffer_get_size(buffer);
    buffer_resize(buffer, size + 1);
    buffer_poke(buffer, size, buffer_u8, 0);
    buffer_seek(buffer, buffer_seek_start, 0);
    const data = buffer_read(buffer, buffer_text);
    buffer_delete(buffer);
    return data;
  },

  write(fname, data) {
    const buffer = buffer_create(0, buffer_grow, 1);
    if (buffer_write(buffer, buffer_text, data) !== 0) {
      buffer_delete(buffer);
      return false;
    }
    buffer_save(buffer, fname);
    buffer_delete(buffer);
    return true;
  },

  // Binary I/O — for tile grids / dense layers / anything large or non-scalar. JSON text
  // on GMRT both faults on nested values and is O(n²) for big inline arrays; a binary buffer
  // sidesteps both. Caller owns the encoding; File only moves bytes.

  /**
   * Load a file into a fresh buffer. Caller OWNS it and MUST buffer_delete() when done.
   * @returns {*} buffer handle, or undefined if the file does not exist
   */
  readBuffer(fname) {
    const buffer = buffer_load(fname);
    if (buffer === -1) return undefined;
    return buffer;
  },

  /**
   * Write a buffer to disk. Saves only the USED bytes via buffer_save_ext — a buffer_grow
   * buffer over-allocates, so a plain buffer_save would pad the file with trailing garbage.
   */
  writeBuffer(fname, buffer) {
    buffer_save_ext(buffer, fname, 0, buffer_get_used_size(buffer));
    return true;
  },

  // Async binary I/O — off-thread so a huge save can't freeze the frame; console vendors
  // (Xbox/PS/Switch) *require* it to pass cert. Completion arrives in obj_game's Async event,
  // routed here via _resolve. NOTE: both auto-prefix a "default/" folder, so saveAsync round-trips
  // through loadAsync — NOT the sync read/readBuffer, which look outside "default/".
  //
  // GMRT 0.20 CAVEAT (runtime bug #15223, open): buffer_save/_ext (and these async variants) fail
  // to create the destination dir; the forced "default/" subfolder trips it, so the write never lands
  // yet buffer_save_async reports status:true (false positive). On desktop use the sync writeBuffer/
  // readBuffer (root files need no new dir). The plumbing (event → _resolve → callback) is verified
  // good, so async should work once #15223 is fixed and on console.

  /**
   * Async save of a buffer's used bytes. Caller still owns the buffer and MUST keep it alive
   * until `callback(ok)` fires (the save reads it off-thread).
   * @returns {*} the async request id
   */
  saveAsync(fname, buffer, callback) {
    const id = buffer_save_async(
      buffer,
      fname,
      0,
      buffer_get_used_size(buffer),
    );
    File._pending[id] = { load: false, buffer: -1, callback };
    return id;
  },

  /**
   * Async load into a fresh buffer. On success `callback(buffer)` OWNS it (must buffer_delete);
   * on failure it gets undefined (internal buffer released first).
   * @returns {*} the async request id
   */
  loadAsync(fname, callback) {
    const buffer = buffer_create(1, buffer_grow, 1);
    const id = buffer_load_async(buffer, fname, 0, -1); // -1 = whole file
    File._pending[id] = { load: true, buffer, callback };
    return id;
  },

  /** dispatch an async completion to its callback (called by obj_game's Async event); unknown ids ignored. */
  _resolve(id, status) {
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
  },
};
