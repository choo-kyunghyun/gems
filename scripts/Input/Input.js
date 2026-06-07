globalThis.Input = class Input {
  static sensitivity = 2.5;
  static deadzone = 0;
  static actions = {};

  static destroy() {
    Input.actions = {};
  }

  static import(data) {
    Input.destroy();
    Input.sensitivity = data.sensitivity;
    Input.deadzone = data.deadzone;
    Object.entries(data.actions).forEach(([key, value]) => {
      Input.actions[key] = InputAction.import(value);
    });
  }

  static export() {
    const actions = {};
    for (const key in Input.actions) {
      actions[key] = Input.actions[key].export();
    }

    return {
      sensitivity: Input.sensitivity,
      deadzone: Input.deadzone,
      actions: actions,
    };
  }

  static get(key) {
    return Input.actions[key];
  }

  static register(key, action) {
    Input.actions[key] = action;
    return Input;
  }

  static unregister(key) {
    delete Input.actions[key];
  }

  // Register many single-button actions at once. `spec` maps an action key to a
  // [source, button] pair, e.g. { jump: [INPUT_SOURCE.KEYBOARD, vk_space] }. Lets
  // a controller declare its whole keymap in one block instead of N register calls.
  static bindAll(spec) {
    for (const key in spec) {
      const b = spec[key];
      Input.register(key, new InputAction().bindButton(b[0], b[1]));
    }
    return Input;
  }

  // Unregister a list of action keys (the keys of a bindAll spec).
  static unbindAll(keys) {
    for (let i = 0; i < keys.length; i++) Input.unregister(keys[i]);
  }
};
