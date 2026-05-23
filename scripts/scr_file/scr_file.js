function file_find(mask) {
  const files = [];
  let fname = file_find_first(mask, fa_none);
  while (fname != "") {
    files.push(fname);
    fname = file_find_next();
  }
  file_find_close();
  return files;
}
