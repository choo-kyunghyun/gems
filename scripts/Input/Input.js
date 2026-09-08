/**
 * THE input manager: the one frame poll over every device, the frame-scoped claims that
 * distribute it, and the registry of named InputActions with the player profile over them
 * (sensitivity, deadzone, the keyboard rebinds — what InputPreset persists).
 *
 * THE DISTRIBUTION CONTRACT — no consumer reads a device built-in (`mouse_*`, `keyboard_*`,
 * `gamepad_*`, `device_mouse_*`, `window_mouse_get_*`); every read goes through this object,
 * so one place decides who gets an input:
 *   1. poll() runs first in the frame (Game Step_0): it latches the pointer once (GMRT samples
 *      the mouse LIVE, so a re-query mid-frame can diverge — the poll-once rule), takes the
 *      typed text, clears the frame's claims, and settles which layer owns each pressed mouse
 *      button.
 *   2. Consumers run in the app's fixed order — the UI tree, SlotDrag, GameOverlay, UINav,
 *      Dialogue, then the scene — and that order IS the priority: a consumer that takes an
 *      input CLAIMS it (claimPointer/claimKeys/claimPad for a whole device, consumeKey/
 *      consumePad for one button) and every reader after it sees the device idle. Inside one
 *      consumer the order is read, act, then claim — a claim never precedes its owner's reads.
 *   3. The queries (keyPressed/pointerPressed/padPressed/wheel/…, and through them the
 *      InputButton/InputAxis bindings an InputAction reads) answer minus the claims. `pointer`
 *      and `typed` are the raw latched records: the cursor position (`x`/`y`/`moved`, the room
 *      and window mirrors) is anyone's — a position is not contended — but the button edges
 *      and the typed text are the UI tree's ONLY: the tree arbitrates its own z-order (UIElement
 *      `block`) and claims at the end of UI.update; nothing after the tree reads an edge raw.
 *
 * Pointer ownership: the layer a mouse press went to keeps that button until its release — a
 * press over a widget stays the UI's while dragged off it, a press on the world stays the
 * world's while dragged over the HUD. Settled in poll() from the previous frame's claim, read
 * through _pointerFree.
 *
 * A whole-device claim lasts the frame and is re-asserted by its owner every frame it holds
 * the device (a focused UIInput, a live UINav), so a stale claim self-heals the moment the
 * owner stops updating. InputContext is the orthogonal scene-level gate (play/build/window)
 * over actions.
 */
globalThis.Input = {
  /**
   * Mouse-look multiplier over a consumer's own base radians-per-pixel (CameraFly's `sens`),
   * so 1.0 is that base and the shipped 2.5 is the tuned default. Read live, per frame.
   * Unitless and never Time-scaled — a mouse delta is a distance already, not a rate.
   */
  sensitivity: 2.5,
  /**
   * Gamepad stick deadzone, 0-1, pushed to the hardware by applyDeadzone().
   * gamepad_axis_value RENORMALIZES above it (at deadzone 0.2, raw 0.5 reads 0.375), so a consumer
   * threshold (PlayerSystem's STICK_DEADZONE, UINav's stick edges) stacks on top of this
   * instead of replacing it — raising both compounds.
   */
  deadzone: 0,
  actions: {},
  /**
   * The keyboard rebinds, action key → keycode: applied over an action's default keyboard button
   * as it registers, so a rebind outlives the scene binding the keymap and reaches an action
   * registered after it was made. Edited through rebind()/restore(), never directly.
   */
  rebinds: {},
  _defaults: {}, // action key → the keyboard keycode it registered with (0 = none); restore() returns to it

  /**
   * The frame's latched pointer, GUI-space: `x`/`y` (+ `moved` since the previous frame),
   * `wheel` (-1 up / +1 down / 0), `roomX`/`roomY` (mouse_x/mouse_y — right under a flat
   * camera only, see Camera.cursorWorld), `winX`/`winY` (window pixels, for a cursor-warping
   * look), and per button (`left`/`right`/`middle`) the `pressed`/`released`/`down` edges plus
   * `owner` ("" / "ui" / "world", the ownership contract). The UI tree's view of the pointer;
   * every other consumer reads the pointer* queries.
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
  /** The text typed this frame (keyboard_string, latched then cleared) — the focused UIInput's stream. */
  typed: "",

  _pointerClaimed: false, // a UI layer holds the pointer this frame (hover/held widget, a modal)
  _keysClaimed: false, // a UI layer holds the keyboard this frame (a focused text field)
  _padClaimed: false, // a UI layer holds the gamepad this frame (live menu nav)
  _consumedKeys: [], // keycodes a consumer acted on this frame (consumeKey)
  _consumedPad: [], // gamepad buttons a consumer acted on this frame (consumePad)

  /**
   * Latch this frame's devices and clear the previous frame's claims — first thing in Game
   * Step_0, before any consumer reads. The ownership of each pressed button settles here from
   * the claim that stood when the press landed (last frame's), before that claim is cleared.
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

  /** a press edge went to whoever held the pointer that frame; a release frees the button */
  _settle(b) {
    if (b.pressed) b.owner = Input._pointerClaimed ? "ui" : "world";
    if (b.released) b.owner = "";
  },

  // ── claims ──────────────────────────────────────────────────────────────────────────────

  /** The pointer is a UI layer's this frame — UI.update (a hovered/held widget), a dialogue box click. */
  claimPointer() {
    Input._pointerClaimed = true;
  },

  /** The keyboard is a text field's this frame (re-asserted per frame while focused). */
  claimKeys() {
    Input._keysClaimed = true;
  },

  /** The gamepad is menu navigation's this frame (re-asserted per frame while UINav is live). */
  claimPad() {
    Input._padClaimed = true;
  },

  /**
   * A consumer acted on this key's press; later readers see it idle. The frame-scoped record
   * keyboard_clear cannot be (docs/GMRT.md — it leaves the pressed edge standing).
   */
  consumeKey(code) {
    Input._consumedKeys.push(code);
  },

  /** A consumer acted on this gamepad button's press (device 0); later readers see it idle. */
  consumePad(button) {
    Input._consumedPad.push(button);
  },

  // ── queries (claim-aware; the only reads outside the UI tree) ──────────────────────────

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

  /** -1 up / +1 down / 0 — 0 while the pointer is claimed (a wheel over a list scrolls it, never the world) */
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

  /** raw stick axis (hardware-deadzoned — see `deadzone`); 0 while the pad is claimed */
  padAxis(axis, device = 0) {
    return Input._padClaimed ? 0 : gamepad_axis_value(device, axis);
  },

  /** analog trigger value; 0 while the pad is claimed */
  padValue(button, device = 0) {
    return Input._padClaimed ? 0 : gamepad_button_value(device, button);
  },

  /**
   * Any press at all this frame — a key, a mouse button, a pad face button — regardless of
   * claims: a "press anything" prompt (waking a sleeper), never a gameplay read.
   */
  anyPressed() {
    return (
      keyboard_check_pressed(vk_anykey) ||
      Input.pointer.left.pressed ||
      Input.pointer.right.pressed ||
      gamepad_button_check_pressed(0, gp_face1) ||
      gamepad_button_check_pressed(0, gp_face2)
    );
  },

  // ── registry + profile ─────────────────────────────────────────────────────────────────

  destroy() {
    Input.actions = {};
    Input._defaults = {};
  },

  /**
   * Apply a saved profile (the export() shape) over whatever is registered: the rebinds REPLACE
   * the current set, the deadzone is pushed to the pads.
   */
  import(data) {
    Input.sensitivity = data.sensitivity;
    Input.deadzone = data.deadzone;
    Input.applyDeadzone();
    Input.restoreAll();
    const keys = Object.keys(data.rebinds);
    for (let i = 0; i < keys.length; i++)
      Input.rebind(keys[i], data.rebinds[keys[i]]);
  },

  /** Serializable profile: { sensitivity, deadzone, rebinds }. */
  export() {
    return {
      sensitivity: Input.sensitivity,
      deadzone: Input.deadzone,
      rebinds: Object.assign({}, Input.rebinds),
    };
  },

  /**
   * Push Input.deadzone to the gamepad hardware; a slot omitted from `device` means every slot.
   *
   * The built-in sets one SLOT (all of its axes at once), and the value neither follows a pad
   * across a reconnect nor exists before a pad does — no pad is connected yet when Game's
   * Create runs, so the seeding sweep alone reaches nothing and the async system event re-pushes
   * per slot on "gamepad discovered". That event is the load-bearing call site.
   *
   * Slots are whatever gamepad_get_device_count() reports (4 on GMRT 0.20 Windows, against the
   * manual's 11-12 with DirectInput on 4-11); a set to a slot past that is silently DROPPED —
   * it reads back 0, with no error. Never assume a fixed slot map.
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
   * Rebind an action's keyboard key (see _setKey), recorded so it survives re-registration and
   * persists; the default keycode clears the record instead. An unregistered key is recorded
   * only, and applies when its action registers.
   */
  rebind(key, code) {
    if (code === Input._defaults[key]) delete Input.rebinds[key];
    else Input.rebinds[key] = code;
    const action = Input.actions[key];
    if (action !== undefined) Input._setKey(action, code);
  },

  /** Drop an action's rebind, returning it to the keyboard key it registered with. */
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
   * Set an action's keyboard binding: its first keyboard button takes `code`; an action without
   * one gains it at the FRONT (the label() slot — its mouse/pad buttons stay as alternates); 0
   * removes it.
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

  /**
   * Register many single-button actions at once.
   * `spec`: key → [source, button, contexts?].
   *   3rd element is the InputContext list (see InputAction.inContext); omit for everywhere.
   */
  bindAll(spec) {
    for (const key in spec) {
      const b = spec[key];
      const action = new InputAction().bindButton(b[0], b[1]);
      if (b[2] !== undefined) action.inContext(b[2]);
      Input.register(key, action);
    }
    return Input;
  },

  /** `keys`: action keys from a bindAll spec. */
  unbindAll(keys) {
    for (let i = 0; i < keys.length; i++) Input.unregister(keys[i]);
  },
};
