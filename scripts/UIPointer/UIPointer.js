// UIPointer — frame-latched pointer state for the whole UI, a standalone static singleton
// (NOT a UIComponent), like SlotDrag / Toast / UINav.
//
// Why this exists: on GMRT mouse_check_button* are sampled REALTIME, not latched per frame, so
// reading the same query more than once in a frame can return different values each call (it
// made SlotDrag's drop/cancel paths disagree on the release edge — see CLAUDE.md). poll() reads
// each edge ONCE per frame into a static field, and every widget reads those fields instead of
// re-querying. Reading a field (not caching a primitive bool in a local) also sidesteps the
// boolean-local clobber for the input-derived flags. NOTE: that clobber is broader than input —
// non-input booleans still need the instance-field / live-read idiom; this only fixes the
// pointer-derived ones.
//
// Wiring: UIPointer.poll() runs in Step_0 BEFORE UI.update(), so all widgets see the same edges.
globalThis.UIPointer = class UIPointer {
  static pressed = false; // left-button press edge this frame
  static released = false; // left-button release edge this frame
  static down = false; // left button held this frame
  static wheel = 0; // -1 wheel up / +1 wheel down / 0 none this frame

  /** Latch this frame's pointer state once (Step_0, before UI.update). */
  static poll() {
    UIPointer.pressed = mouse_check_button_pressed(mb_left);
    UIPointer.released = mouse_check_button_released(mb_left);
    UIPointer.down = mouse_check_button(mb_left);
    UIPointer.wheel = (mouse_wheel_down() ? 1 : 0) - (mouse_wheel_up() ? 1 : 0);
  }
};
