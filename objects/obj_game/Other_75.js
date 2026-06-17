// Async - System: OS-level callbacks (gamepad connect/disconnect, etc.).
// async_load carries "event_type"; for gamepads it's "gamepad discovered"/"gamepad lost"
// plus "pad_index" (the slot, 0-3 XInput / 4-11 DirectInput). The event only fires while
// the gamepad subsystem is live — the project already calls gamepad_* (UINav/UITable/
// SystemMenu/Dialogue), so plugging/unplugging a controller is reported here.
if (ds_map_exists(async_load, "event_type")) {
  const eventType = ds_map_find_value(async_load, "event_type");
  if (eventType === "gamepad discovered" || eventType === "gamepad lost") {
    const pad = ds_map_find_value(async_load, "pad_index");
    const verb = eventType === "gamepad discovered" ? "connected" : "disconnected";
    Log.info("gamepad " + verb + " — slot " + pad);
  }
}
