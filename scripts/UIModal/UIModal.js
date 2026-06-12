/**
 * @implements {UIComponent}
 * Modal controller — lives as a component on a full-screen UI root (built by
 * gemsModal). The root sits at the top of the UI stack, so it draws last (over the
 * scene) and, because this component returns `true` every frame, it blocks all
 * pointer input to the roots beneath it (exclusive modal). Closes on Escape, or on a
 * backdrop click (a press that no card child captured — the card carries its own
 * UITrigger so clicks on it don't count as backdrop).
 *
 * `gemsModal(...)` returns this instance as the handle: call `.close()` to dismiss.
 * close() is idempotent and safe to call from a button's onClick mid-update — the
 * UIElement `_destroyed` guard keeps the unwinding traversal off the deleted node.
 */
globalThis.UIModal = class UIModal {
  constructor(modal = {}) {
    this.onClose = modal.onClose ?? noop;
    this.closeOnBackdrop = modal.closeOnBackdrop ?? true;
    this.closeOnEscape = modal.closeOnEscape ?? true;
    this._root = modal.root ?? null; // the full-screen root, set by gemsModal
    this._closed = false;
  }

  close() {
    if (this._closed || this._root === null) return;
    this._closed = true;
    UI.remove(this._root);
    this._root.destroy();
    this.onClose();
  }

  onUpdate(element, block) {
    if (this._closed) return block;

    if (this.closeOnEscape && keyboard_check_pressed(vk_escape)) {
      this.close();
      return true;
    }
    // Backdrop click: a press the card didn't capture (block is still false here).
    if (this.closeOnBackdrop && !block && mouse_check_button_pressed(mb_left)) {
      this.close();
      return true;
    }
    // Exclusive: swallow all pointer input from the roots beneath the modal.
    return true;
  }

  // UINav reads this to stop collecting focusables from roots beneath an open modal,
  // mirroring the pointer block above — so keyboard/gamepad focus can't reach the
  // background while the dialog is up.
  navExclusive() {
    return !this._closed;
  }
};
