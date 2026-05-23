function struct_merge(src, dest) {
  const names = struct_get_names(src);
  for (var i = 0; i < array_length(names); i++) {
    const name = names[i];
    let val = src[name];
    if (is_struct(val)) {
      let dest_sub = dest[name];
      if (!is_struct(dest_sub)) {
        dest_sub = {};
        dest[name] = dest_sub;
      }
      struct_merge(val, dest_sub);
    } else {
      dest[name] = variable_clone(val);
    }
  }
}

function struct_import(fname) {
  const buffer = buffer_load(fname);
  if (buffer == -1) return undefined;
  const json = buffer_read(buffer, buffer_text);
  buffer_delete(buffer);
  return json_parse(json);
}

function struct_export(struct, fname) {
  const buffer = buffer_create(0, buffer_grow, 1);
  const data = json_stringify(struct);
  if (buffer_write(buffer, buffer_text, data) != 0) {
    buffer_delete(buffer);
    return false;
  }
  buffer_save(buffer, fname);
  buffer_delete(buffer);
  return true;
}
