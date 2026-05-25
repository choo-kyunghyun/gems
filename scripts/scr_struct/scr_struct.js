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
