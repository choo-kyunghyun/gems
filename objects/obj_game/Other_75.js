// async system event (gamepad connect/disconnect); async_load ds_map carries "event_type" +
// "pad_index". only fires because the project already calls gamepad_* (UINav/etc.) at runtime.
if (ds_map_exists(async_load, "event_type")) {
  const eventType = ds_map_find_value(async_load, "event_type");
  if (eventType === "gamepad discovered" || eventType === "gamepad lost") {
    const pad = ds_map_find_value(async_load, "pad_index");
    const verb = eventType === "gamepad discovered" ? "connected" : "disconnected";
    Log.info("gamepad " + verb + " — slot " + pad);
  }
}
