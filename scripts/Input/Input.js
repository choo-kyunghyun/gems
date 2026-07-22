/** registry of named InputActions; controllers bind their keymap per-level via bindAll. */
globalThis.Input = {
  // analog tuning + export/import scaffolded for InputPreset; unused today.
  sensitivity: 2.5,
  deadzone: 0,
  /** @type {Object<string, InputAction>} */
  actions: {},

  destroy() {
    Input.actions = {};
  },

  /** @param {{sensitivity:number,deadzone:number,actions:object}} data */
  import(data) {
    Input.destroy();
    Input.sensitivity = data.sensitivity;
    Input.deadzone = data.deadzone;
    Object.entries(data.actions).forEach(([key, value]) => {
      Input.actions[key] = InputAction.import(value);
    });
  },

  /** @returns {{sensitivity:number,deadzone:number,actions:object}} Serializable keymap. */
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
   * @param {Object<string, any[]>} spec - key → [source, button, contexts?].
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

  /** @param {string[]} keys - action keys from a bindAll spec. */
  unbindAll(keys) {
    for (let i = 0; i < keys.length; i++) Input.unregister(keys[i]);
  },
};
