/**
 * Static registry of named InputActions. Controllers register their keymap per-scene via
 * bindAll/register; everything else reads actions back through get(). Also holds the global
 * keymap (de)serializer.
 */
globalThis.Input = class Input {
  // Analog tuning + the export/import keymap serializer are scaffolding for a future
  // InputPreset module (à la EntityPreset), loaded/saved by obj_game. Not consumed yet:
  // InputAxis.value() reads raw gamepad values and nothing calls export/import today.
  static sensitivity = 2.5;
  static deadzone = 0;
  /** @type {Object<string, InputAction>} */
  static actions = {};

  /** Drop all registered actions. */
  static destroy() {
    Input.actions = {};
  }

  /** @param {{sensitivity:number,deadzone:number,actions:object}} data - A prior export() blob. */
  static import(data) {
    Input.destroy();
    Input.sensitivity = data.sensitivity;
    Input.deadzone = data.deadzone;
    Object.entries(data.actions).forEach(([key, value]) => {
      Input.actions[key] = InputAction.import(value);
    });
  }

  /** @returns {{sensitivity:number,deadzone:number,actions:object}} Serializable keymap. */
  static export() {
    const actions = {};
    Object.entries(Input.actions).forEach(([key, action]) => {
      actions[key] = action.export();
    });

    return {
      sensitivity: Input.sensitivity,
      deadzone: Input.deadzone,
      actions: actions,
    };
  }

  /** @param {string} key @returns {InputAction|undefined} */
  static get(key) {
    return Input.actions[key];
  }

  /** @param {string} key @param {InputAction} action @returns {typeof Input} */
  static register(key, action) {
    Input.actions[key] = action;
    return Input;
  }

  /** @param {string} key */
  static unregister(key) {
    delete Input.actions[key];
  }

  /**
   * Register many single-button actions at once — a controller's whole keymap in one block.
   * @param {Object<string, any[]>} spec - key → [source, button, contexts?].
   *   The optional 3rd element is the InputContext live-list (see InputAction.inContext);
   *   omit it for a context-free action (live everywhere), e.g.
   *   { jump: [INPUT_SOURCE.KEYBOARD, vk_space], fire: [INPUT_SOURCE.MOUSE, mb_left, ["play"]] }.
   * @returns {typeof Input}
   */
  static bindAll(spec) {
    for (const key in spec) {
      const b = spec[key];
      const action = new InputAction().bindButton(b[0], b[1]);
      if (b[2] !== undefined) action.inContext(b[2]);
      Input.register(key, action);
    }
    return Input;
  }

  /** @param {string[]} keys - Action keys (the keys of a bindAll spec) to unregister. */
  static unbindAll(keys) {
    for (let i = 0; i < keys.length; i++) Input.unregister(keys[i]);
  }
};
