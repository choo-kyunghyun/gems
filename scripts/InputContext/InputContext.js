// InputContext: a named-context stack over the Input layer. The ACTIVE context is the
// top of the stack; the bottom is always "default". An InputAction may declare the
// contexts it is live in (see InputAction.inContext / Input.bindAll's 3rd spec element);
// its query methods (down/pressed/released/value) return falsy while the active context
// is not in that list. An action with no declared contexts (the default) is live in
// EVERY context, so existing keymaps (platformer/RTS/UI) are unaffected.
//
// This generalizes InputAction.captured() (which mutes ALL gameplay input while a text
// field owns the keyboard) to arbitrary gameplay contexts — e.g. the RPG scene sets
// "play" / "build" / "window" so fire self-mutes while building or while a window is
// open, with no per-consumer flag-checking. captured() still wins (a focused field mutes
// everything regardless of context).
//
// Usage (a scene owning gameplay input):
//   InputContext.push("play");   // once, when the scene takes over input
//   InputContext.set("window");  // each frame: replace the active context (push base kept)
//   InputContext.reset();        // on scene teardown — back to ["default"]
// Other systems can push/pop their own modal context (a dialogue, a wizard) and pop it
// when done; the action tags decide which inputs survive each layer.
globalThis.InputContext = class InputContext {
  // Stack of context names; index 0 ("default") is the permanent base. Kept as a plain
  // array (index-looped, never Set/iterator — see GMRT-Safe Idioms).
  static _stack = ["default"];

  // The active context = top of the stack.
  static active() {
    return InputContext._stack[InputContext._stack.length - 1];
  }

  static is(name) {
    return InputContext.active() === name;
  }

  // Push a new active context above the current one.
  static push(name) {
    InputContext._stack.push(name);
  }

  // Pop the active context, never below the "default" base.
  static pop() {
    if (InputContext._stack.length > 1) InputContext._stack.pop();
  }

  // Replace the active context in place. No-op'd into a push when only the base remains,
  // so a caller that forgot to push() can't overwrite "default".
  static set(name) {
    if (InputContext._stack.length === 1) InputContext._stack.push(name);
    else InputContext._stack[InputContext._stack.length - 1] = name;
  }

  // Reset to just the base context (scene teardown).
  static reset() {
    InputContext._stack = ["default"];
  }

  // True when an action whose live-context list is `list` is permitted right now. `list`
  // is a non-null string[] (the caller checks null = live-everywhere before calling).
  static allows(list) {
    return list.indexOf(InputContext.active()) !== -1;
  }
};
