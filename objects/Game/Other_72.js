// async save/load completion: async_load ds_map carries "id" + "status"; route to File._resolve
// (must use ds_map_find_value — the [? ] accessor is GML-only)
if (ds_map_exists(async_load, "id")) {
  File._resolve(ds_map_find_value(async_load, "id"), ds_map_find_value(async_load, "status"));
}
