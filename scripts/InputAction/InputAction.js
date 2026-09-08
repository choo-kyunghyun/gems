/**
 * OR-combined button/axis bindings gated by InputContext. Each binding reads through the Input
 * queries, so an action is already muted wherever the frame's claims mute its device (a hovered
 * widget takes the mouse, a focused text field the keyboard, live menu nav the pad — Input);
 * the context gate here is the orthogonal scene-level one (play/build/window).
 */
globalThis.InputAction = class InputAction {
  constructor() {
    this.buttons = [];
    this.axes = [];
    // null = live in every context; string[] gates to those contexts.
    this.contexts = null;
  }

  /**
   * Restrict to given context names (indexOf-tested array, never a Set — GMRT Set iteration crashes).
   */
  inContext(list) {
    this.contexts = list;
    return this;
  }

  _blocked() {
    return this.contexts !== null && !InputContext.allows(this.contexts);
  }

  bindButton(source, button, device = 0) {
    this.buttons.push(new InputButton(source, button, device));
    return this;
  }

  bindAxis(mode, axis, device = 0) {
    this.axes.push(new InputAxis(mode, axis, device));
    return this;
  }

  /** Index of the first keyboard button, -1 when none — the slot a rebind edits (Input._setKey). */
  keyIndex() {
    for (let i = 0; i < this.buttons.length; i++)
      if (this.buttons[i].source === INPUT_SOURCE.KEYBOARD) return i;
    return -1;
  }

  // single source of truth for binding→display text; reads live so a remap updates UIRebind + facetKeyHints automatically.
  /** E.g. "W" / "Shift" / "LMB", or "—" when unbound. */
  label() {
    return this.buttons.length > 0 ? this.buttons[0].label() : "—";
  }

  down() {
    if (this._blocked()) return false;
    return this.buttons.some((button) => button.down());
  }

  pressed() {
    if (this._blocked()) return false;
    return this.buttons.some((button) => button.pressed());
  }

  released() {
    if (this._blocked()) return false;
    return this.buttons.some((button) => button.released());
  }

  value() {
    if (this._blocked()) return 0;
    let val = 0;
    for (const axis of this.axes) {
      const v = axis.value();
      if (Math.abs(v) > Math.abs(val)) val = v;
    }
    return val;
  }
};
