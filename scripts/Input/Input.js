/** registry of named InputActions; controllers bind their keymap per-level via bindAll. */
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

  destroy() {
    Input.actions = {};
  },

  import(data) {
    Input.destroy();
    Input.sensitivity = data.sensitivity;
    Input.deadzone = data.deadzone;
    Input.applyDeadzone();
    Object.entries(data.actions).forEach(([key, value]) => {
      Input.actions[key] = InputAction.import(value);
    });
  },

  /** Serializable keymap: { sensitivity, deadzone, actions }. */
  export() {
    const actions = {};
    Object.entries(Input.actions).forEach(([key, action]) => {
      actions[key] = action.export();
    });

    return {
      sensitivity: Input.sensitivity,
      deadzone: Input.deadzone,
      actions: actions,
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

  register(key, action) {
    Input.actions[key] = action;
    return Input;
  },

  unregister(key) {
    delete Input.actions[key];
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
