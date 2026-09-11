globalThis.File = {
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
   * Returns the buffer handle, or undefined if the file does not exist.
   */
  readBuffer(fname) {
    const buffer = buffer_load(fname);
    if (buffer === -1) return undefined;
    return buffer;
  },

  /**
   * Write a buffer to disk. Saves only the USED bytes via buffer_save_ext — a buffer_grow
   * buffer over-allocates, so a plain buffer_save would pad the file with trailing garbage.
   * Answers nothing: buffer_save_ext reports no result, and file_exists is no check (docs/GMRT.md).
   */
  writeBuffer(fname, buffer) {
    buffer_save_ext(buffer, fname, 0, buffer_get_used_size(buffer));
  },
};
