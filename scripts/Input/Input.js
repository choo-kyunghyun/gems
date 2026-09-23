/**
 * The input manager: the one frame poll over every device, the frame-scoped claims that
 * distribute it, and the registry of named actions with the player profile over them
 * (sensitivity, deadzone, keyboard rebinds).
 *
 * No consumer reads a device built-in; every read goes through this object, so one place
 * decides who gets an input:
 *   1. poll() runs first in the frame: it latches the pointer once (GMRT samples the mouse
 *      live, so a mid-frame re-query can diverge), takes the typed text, clears the frame's
 *      claims, and settles which layer owns each pressed mouse button.
 *   2. Consumers run in a fixed order and that order is the priority: a consumer that takes an
 *      input claims it, and every reader after it sees the device idle. Within one consumer
 *      the order is read, act, then claim.
 *   3. The queries answer minus the claims. `pointer` and `typed` are the raw latched records:
 *      the cursor position is anyone's, but the button edges and the typed text belong to the
 *      UI tree alone, which arbitrates its own z-order.
 *
 * Pointer ownership: the layer a mouse press went to keeps that button until its release.
 *
 * A whole-device claim lasts the frame and is re-asserted by its owner every frame it holds
 * the device, so a stale claim self-heals the moment the owner stops updating.
 */
globalThis.Input = {
  /**
   * Mouse-look multiplier over a consumer's own base radians-per-pixel; 1.0 is that base.
   * Never Time-scaled — a mouse delta is a distance already, not a rate.
   */
  sensitivity: 2.5,
  /**
   * Gamepad stick deadzone, 0-1, applied in hardware. Axis values renormalize above it, so a
   * consumer's own threshold stacks on top of this instead of replacing it.
   */
  deadzone: 0,
  actions: {},
  /**
   * Action key → keycode, applied over an action's default keyboard button as it registers, so
   * a rebind outlives the scene that bound the keymap. Edited through rebind()/restore() only.
   */
  rebinds: {},
  _defaults: {}, // action key → the keycode it registered with (0 = none)

  /**
   * The frame's latched pointer, GUI-space. `roomX`/`roomY` are right under a flat camera only;
   * `winX`/`winY` are window pixels; a button's `owner` is "" / "ui" / "world". The UI tree's
   * view of the pointer; every other consumer reads the pointer* queries.
   */
  pointer: {
    x: 0,
    y: 0,
    moved: false,
    wheel: 0,
    roomX: 0,
    roomY: 0,
    winX: 0,
    winY: 0,
    left: { pressed: false, released: false, down: false, owner: "" },
    right: { pressed: false, released: false, down: false, owner: "" },
    middle: { pressed: false, released: false, down: false, owner: "" },
  },
  /** The text typed this frame, latched then cleared. */
  typed: "",

  _pointerClaimed: false,
  _keysClaimed: false,
  _padClaimed: false,
  _consumedKeys: [],
  _consumedPad: [],

  /**
   * Latch this frame's devices and clear the previous frame's claims; runs before any consumer
   * reads. Each press's owner settles from the claim that stood when it landed, before that
   * claim is cleared.
   */
  poll() {
    const p = Input.pointer;
    Input._settle(p.left);
    Input._settle(p.right);
    Input._settle(p.middle);
    Input._pointerClaimed = false;
    Input._keysClaimed = false;
    Input._padClaimed = false;
    Input._consumedKeys.length = 0;
    Input._consumedPad.length = 0;

    const x = device_mouse_x_to_gui(0);
    const y = device_mouse_y_to_gui(0);
    p.moved = x !== p.x || y !== p.y;
    p.x = x;
    p.y = y;
    p.roomX = mouse_x;
    p.roomY = mouse_y;
    p.winX = window_mouse_get_x();
    p.winY = window_mouse_get_y();
    p.wheel = (mouse_wheel_down() ? 1 : 0) - (mouse_wheel_up() ? 1 : 0);
    Input._latch(p.left, mb_left);
    Input._latch(p.right, mb_right);
    Input._latch(p.middle, mb_middle);

    Input.typed = keyboard_string;
    keyboard_string = "";
  },

  _latch(b, mb) {
    b.pressed = mouse_check_button_pressed(mb);
    b.released = mouse_check_button_released(mb);
    b.down = mouse_check_button(mb);
  },

  _settle(b) {
    if (b.pressed) b.owner = Input._pointerClaimed ? "ui" : "world";
    if (b.released) b.owner = "";
  },

  /** Claims hold for this frame only; the owner re-asserts them every frame it holds the device. */
  claimPointer() {
    Input._pointerClaimed = true;
  },

  claimKeys() {
    Input._keysClaimed = true;
  },

  claimPad() {
    Input._padClaimed = true;
  },

  /**
   * A consumer acted on this key's press; later readers see it idle. A frame-scoped record,
   * since keyboard_clear cannot consume a press (docs/GMRT.md).
   */
  consumeKey(code) {
    Input._consumedKeys.push(code);
  },

  /** A consumer acted on this gamepad button's press (device 0); later readers see it idle. */
  consumePad(button) {
    Input._consumedPad.push(button);
  },

  _button(mb) {
    if (mb === mb_left) return Input.pointer.left;
    if (mb === mb_right) return Input.pointer.right;
    return Input.pointer.middle;
  },

  /** a held button answers to its owner; an unowned one to whoever has not been claimed over */
  _pointerFree(b) {
    if (b.owner === "world") return true;
    if (b.owner === "ui") return false;
    return !Input._pointerClaimed;
  },

  pointerPressed(mb) {
    const b = Input._button(mb);
    return b.pressed ? Input._pointerFree(b) : false;
  },

  pointerReleased(mb) {
    const b = Input._button(mb);
    return b.released ? Input._pointerFree(b) : false;
  },

  pointerDown(mb) {
    const b = Input._button(mb);
    return b.down ? Input._pointerFree(b) : false;
  },

  /** -1 up / +1 down; 0 while the pointer is claimed. */
  wheel() {
    return Input._pointerClaimed ? 0 : Input.pointer.wheel;
  },

  keyPressed(code) {
    if (Input._keysClaimed) return false;
    if (Input._consumedKeys.indexOf(code) !== -1) return false;
    return keyboard_check_pressed(code);
  },

  keyReleased(code) {
    return Input._keysClaimed ? false : keyboard_check_released(code);
  },

  keyDown(code) {
    return Input._keysClaimed ? false : keyboard_check(code);
  },

  padPressed(button, device = 0) {
    if (Input._padClaimed) return false;
    if (Input._consumedPad.indexOf(button) !== -1) return false;
    return gamepad_button_check_pressed(device, button);
  },

  padReleased(button, device = 0) {
    return Input._padClaimed
      ? false
      : gamepad_button_check_released(device, button);
  },

  padDown(button, device = 0) {
    return Input._padClaimed ? false : gamepad_button_check(device, button);
  },

  /** Hardware-deadzoned stick axis; 0 while the pad is claimed. */
  padAxis(axis, device = 0) {
    return Input._padClaimed ? 0 : gamepad_axis_value(device, axis);
  },

  padValue(button, device = 0) {
    return Input._padClaimed ? 0 : gamepad_button_value(device, button);
  },

  /** Any press this frame regardless of claims: for a "press anything" prompt, never gameplay. */
  anyPressed() {
    return (
      keyboard_check_pressed(vk_anykey) ||
      Input.pointer.left.pressed ||
      Input.pointer.right.pressed ||
      gamepad_button_check_pressed(0, gp_face1) ||
      gamepad_button_check_pressed(0, gp_face2)
    );
  },

  destroy() {
    Input.actions = {};
    Input._defaults = {};
  },

  /** Apply a saved export() profile; its rebinds replace the current set. */
  import(data) {
    Input.sensitivity = data.sensitivity;
    Input.deadzone = data.deadzone;
    Input.applyDeadzone();
    Input.restoreAll();
    const keys = Object.keys(data.rebinds);
    for (let i = 0; i < keys.length; i++)
      Input.rebind(keys[i], data.rebinds[keys[i]]);
  },

  export() {
    return {
      sensitivity: Input.sensitivity,
      deadzone: Input.deadzone,
      rebinds: Object.assign({}, Input.rebinds),
    };
  },

  /**
   * Push the deadzone to the gamepad hardware; an omitted `device` means every slot. The value
   * is per slot and does not survive a reconnect, so it must be re-pushed whenever a pad is
   * discovered. A set past gamepad_get_device_count() is silently dropped, so never assume a
   * fixed slot map.
   */
  applyDeadzone(device) {
    if (device !== undefined) {
      gamepad_set_axis_deadzone(device, Input.deadzone);
      return;
    }
    const slots = gamepad_get_device_count();
    for (let i = 0; i < slots; i++)
      gamepad_set_axis_deadzone(i, Input.deadzone);
  },

  get(key) {
    return Input.actions[key];
  },

  /** Register an action; a rebind recorded for `key` lands on it as it registers. */
  register(key, action) {
    Input.actions[key] = action;
    const i = action.keyIndex();
    Input._defaults[key] = i === -1 ? 0 : action.buttons[i].button;
    if (key in Input.rebinds) Input._setKey(action, Input.rebinds[key]);
    return Input;
  },

  unregister(key) {
    delete Input.actions[key];
    delete Input._defaults[key];
  },

  /**
   * Rebind an action's keyboard key, recorded so it survives re-registration and persists; the
   * default keycode clears the record. An unregistered key applies when its action registers.
   */
  rebind(key, code) {
    if (code === Input._defaults[key]) delete Input.rebinds[key];
    else Input.rebinds[key] = code;
    const action = Input.actions[key];
    if (action !== undefined) Input._setKey(action, code);
  },

  restore(key) {
    if (!(key in Input.rebinds)) return;
    delete Input.rebinds[key];
    const action = Input.actions[key];
    if (action !== undefined) Input._setKey(action, Input._defaults[key]);
  },

  restoreAll() {
    const keys = Object.keys(Input.rebinds);
    for (let i = 0; i < keys.length; i++) Input.restore(keys[i]);
  },

  /**
   * An action without a keyboard button gains one at the front, the label slot, keeping its
   * other buttons as alternates; code 0 removes it.
   */
  _setKey(action, code) {
    const i = action.keyIndex();
    if (code === 0) {
      if (i !== -1) action.buttons.splice(i, 1);
    } else if (i !== -1) {
      action.buttons[i] = new InputButton(INPUT_SOURCE.KEYBOARD, code);
    } else {
      action.buttons.splice(
        0,
        0,
        new InputButton(INPUT_SOURCE.KEYBOARD, code),
      );
    }
  },

  /** `spec`: key → [source, button, contexts?]; omitted contexts means everywhere. */
  bindAll(spec) {
    for (const key in spec) {
      const b = spec[key];
      const action = new InputAction().bindButton(b[0], b[1]);
      if (b[2] !== undefined) action.inContext(b[2]);
      Input.register(key, action);
    }
    return Input;
  },

  unbindAll(keys) {
    for (let i = 0; i < keys.length; i++) Input.unregister(keys[i]);
  },
};
