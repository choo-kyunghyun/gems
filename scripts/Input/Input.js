/**
 * Registry of named InputActions, plus the player input profile over them: sensitivity,
 * deadzone, and the keyboard rebinds. The profile outlives any keymap registration (a rebind
 * re-applies as its action registers) and is what InputPreset persists.
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
