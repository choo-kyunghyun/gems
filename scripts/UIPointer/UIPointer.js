// UIPointer — frame-latched pointer state for the whole UI. Static singleton, not a UIComponent.
//
// GMRT: mouse_check_button* are sampled REALTIME, not latched per frame, so re-querying the
// same edge in a frame can diverge (broke SlotDrag's drop/cancel on the release edge — see
// CLAUDE.md). poll() reads each edge ONCE into a static field; widgets read those fields, which
// also sidesteps the boolean-local clobber for pointer-derived flags. (That clobber is broader
// than input — non-pointer bools still need the instance-field/live-read idiom.)
//
// Wiring: poll() in Step_0 BEFORE UI.update(), so all widgets see the same edges.
globalThis.UIPointer = class UIPointer {
  static pressed = false; // left press edge this frame
  static released = false; // left release edge this frame
  static down = false; // left held this frame
  static wheel = 0; // -1 up / +1 down / 0 none

  /** Latch this frame's pointer state once (Step_0, before UI.update). */
  static poll() {
    UIPointer.pressed = mouse_check_button_pressed(mb_left);
    UIPointer.released = mouse_check_button_released(mb_left);
    UIPointer.down = mouse_check_button(mb_left);
    UIPointer.wheel = (mouse_wheel_down() ? 1 : 0) - (mouse_wheel_up() ? 1 : 0);
  }
};
