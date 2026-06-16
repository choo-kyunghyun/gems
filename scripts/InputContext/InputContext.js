/**
 * A named-context stack over the Input layer. The active context is the top of the stack;
 * index 0 ("default") is the permanent base. An InputAction declares which contexts it is
 * live in (InputAction.inContext / bindAll's 3rd spec element); its queries go falsy when
 * the active context isn't listed. An untagged action is live in every context, so plain
 * keymaps are unaffected. Generalizes InputAction.captured() to arbitrary gameplay contexts
 * (a scene sets "play"/"build"/"window" so fire self-mutes while building or with a window
 * open); captured() still wins. Push/pop a modal context (dialogue, wizard) and pop it when
 * done — the action tags decide which inputs survive each layer.
 */
globalThis.InputContext = class InputContext {
  // Plain array (index-looped, never a Set/iterator — see GMRT-Safe Idioms).
  static _stack = ["default"];

  /** @returns {string} The active context (top of stack). */
  static active() {
    return InputContext._stack[InputContext._stack.length - 1];
  }

  /** @param {string} name @returns {boolean} */
  static is(name) {
    return InputContext.active() === name;
  }

  /** Push a new active context above the current one. @param {string} name */
  static push(name) {
    InputContext._stack.push(name);
  }

  /** Pop the active context, never below the "default" base. */
  static pop() {
    if (InputContext._stack.length > 1) InputContext._stack.pop();
  }

  /**
   * Replace the active context in place. No-op'd into a push when only the base remains,
   * so a caller that forgot to push() can't overwrite "default".
   * @param {string} name
   */
  static set(name) {
    if (InputContext._stack.length === 1) InputContext._stack.push(name);
    else InputContext._stack[InputContext._stack.length - 1] = name;
  }

  /** Reset to just the base context (scene teardown). */
  static reset() {
    InputContext._stack = ["default"];
  }

  /**
   * @param {string[]} list - A non-null live-context list (caller checks null = everywhere).
   * @returns {boolean} True when an action with this list is permitted now.
   */
  static allows(list) {
    return list.indexOf(InputContext.active()) !== -1;
  }
};
