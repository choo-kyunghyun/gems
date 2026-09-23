/**
 * Named-context stack gating input actions; the top is active and "default" is the permanent
 * base. An action tagged with contexts goes falsy while the active one is not listed; an untagged
 * action is live everywhere. A scene-level gate, orthogonal to per-device claims.
 */
globalThis.InputContext = {
  _stack: ["default"],

  active() {
    return InputContext._stack[InputContext._stack.length - 1];
  },

  is(name) {
    return InputContext.active() === name;
  },

  push(name) {
    InputContext._stack.push(name);
  },

  /** Never pops the "default" base. */
  pop() {
    if (InputContext._stack.length > 1) InputContext._stack.pop();
  },

  /**
   * Replaces the top in place, pushing instead when only the base remains, so a forgotten push()
   * cannot clobber "default".
   */
  set(name) {
    if (InputContext._stack.length === 1) InputContext._stack.push(name);
    else InputContext._stack[InputContext._stack.length - 1] = name;
  },

  reset() {
    InputContext._stack = ["default"];
  },

  /** `list` must be non-null; the caller treats null as everywhere. */
  allows(list) {
    return list.indexOf(InputContext.active()) !== -1;
  },
};
