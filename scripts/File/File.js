// Files on disk, as text or as bytes. A bare name lands in the save dir
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

  /** The file's text; undefined when the file is missing. */
  read(fname) {
    const buffer = File.readBytes(fname);
    if (buffer === undefined) return undefined;
    const size = buffer_get_size(buffer); // a NUL past EOF stops buffer_text (docs/GMRT.md)
    buffer_resize(buffer, size + 1);
    buffer_poke(buffer, size, buffer_u8, 0);
    const data = buffer_read(buffer, buffer_text);
    buffer_delete(buffer);
    return data;
  },

  /** A fresh buffer the caller owns; undefined when the file is missing. */
  readBytes(fname) {
    const buffer = buffer_load(fname);
    return buffer === -1 ? undefined : buffer;
  },

  /** Returns nothing: a read-back is the only check (docs/GMRT.md #15733). */
  write(fname, text) {
    const buffer = buffer_create(0, buffer_grow, 1);
    buffer_write(buffer, buffer_text, text);
    File._save(buffer, fname);
    buffer_delete(buffer);
  },

  /** A buffer's used bytes; the caller keeps the buffer. Unchecked, as `write`. */
  writeBytes(fname, buffer) {
    File._save(buffer, fname);
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
