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
