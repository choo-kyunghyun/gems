// Async - Save/Load: completion of buffer_save_async / buffer_load_async (File async I/O).
// async_load carries "id" (the request id File handed out) + "status" (bool ok). Route it
// back so File fires the per-request callback on the main thread.
if (ds_map_exists(async_load, "id")) {
  File._resolve(ds_map_find_value(async_load, "id"), ds_map_find_value(async_load, "status"));
}
