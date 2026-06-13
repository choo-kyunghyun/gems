// TODO: Async save/load
// TODO: static exists(fname)
globalThis.File = class File {
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
};
