/**
 * Named-context stack over Input; active = top of stack, "default" is the permanent base.
 * An action tagged via inContext goes falsy when the active context isn't listed; untagged =
 * live everywhere (so plain keymaps are unaffected). Generalizes captured() to gameplay
 * contexts ("play"/"build"/"window" — fire self-mutes while building); captured() still wins.
 */
globalThis.InputContext = {
  // Plain array (index-looped, never a Set/iterator — see GMRT-Safe Idioms).
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

  /** Pop the active context, never below the "default" base. */
  pop() {
    if (InputContext._stack.length > 1) InputContext._stack.pop();
  },

  // replace top in place; pushes instead when only the base remains, so a forgotten push() can't clobber "default".
  set(name) {
    if (InputContext._stack.length === 1) InputContext._stack.push(name);
    else InputContext._stack[InputContext._stack.length - 1] = name;
  },

  /** Reset to just the base context (scene teardown). */
  reset() {
    InputContext._stack = ["default"];
  },

  /** @param {string[]} list - non-null live-context list (caller checks null = everywhere). */
  allows(list) {
    return list.indexOf(InputContext.active()) !== -1;
  },
};
