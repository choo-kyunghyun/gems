// Files on disk, text or bytes through one read/write pair. A bare name lands in the save dir
// (docs/GMRT.md → working_directory), an included file reads by its project path, and there is
// no existence check: a missing file reads as undefined (docs/GMRT.md #15733).
globalThis.File = {
  /** The names matching `mask`. */
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

  /**
   * The file as a string, or with `binary` as a fresh buffer the caller owns (buffer_delete
   * when done); undefined when the file is missing.
   */
  read(fname, binary = false) {
    const buffer = buffer_load(fname);
    if (buffer === -1) return undefined;
    if (binary) return buffer;
    const size = buffer_get_size(buffer); // a NUL past EOF stops buffer_text (docs/GMRT.md)
    buffer_resize(buffer, size + 1);
    buffer_poke(buffer, size, buffer_u8, 0);
    const data = buffer_read(buffer, buffer_text);
    buffer_delete(buffer);
    return data;
  },

  /**
   * Write a string, or with `binary` a buffer's used bytes (the caller keeps the buffer).
   * Answers nothing: buffer_save_ext reports no result, and a read-back is the only check
   * (docs/GMRT.md #15733).
   */
  write(fname, data, binary = false) {
    if (binary) {
      File._save(data, fname);
      return;
    }
    const buffer = buffer_create(0, buffer_grow, 1);
    buffer_write(buffer, buffer_text, data);
    File._save(buffer, fname);
    buffer_delete(buffer);
  },

  _save(buffer, fname) {
    const size = buffer_get_used_size(buffer);
    if (size > 0) {
      buffer_save_ext(buffer, fname, 0, size);
      return;
    }
    const nul = buffer_create(1, buffer_fixed, 1); // a zero-size save writes garbage (docs/GMRT.md)
    buffer_write(nul, buffer_u8, 0);
    buffer_save_ext(nul, fname, 0, 1);
    buffer_delete(nul);
  },
};
