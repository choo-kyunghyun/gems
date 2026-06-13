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
};
