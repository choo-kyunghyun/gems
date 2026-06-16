/**
 * @implements {UIComponent}
 * Modal controller — lives as a component on a full-screen UI root (built by
 * gemsModal). The root sits at the top of the UI stack, so it draws last (over the
 * scene) and, because this component returns `true` every frame, it blocks all
 * pointer input to the roots beneath it (exclusive modal). Closes on Escape, or on a
 * backdrop click (a press that no card child captured — the card carries its own
 * UITrigger so clicks on it don't count as backdrop).
 *
 * Enter/exit motion: the dialog animates in (and back out) instead of hard-cutting —
 * the backdrop dim fades 0→target and the card slides up into place, driven by
 * Time.raw + Tween.easeInOutQuad. The slide reuses `root.scrollY` (which offsets the
 * root's whole subtree = the card; the backdrop is the root's own UIPanel component, so
 * it doesn't move) — no flex mutation, no per-glyph alpha (the card has its own bg, so
 * a subtree fade would mismatch — slide + dim reads cleanly without it).
 *
 * `gemsModal(...)` returns this instance as the handle: call `.close()` to dismiss.
 * close() starts the exit animation (idempotent); the root is removed + destroyed and
 * `onClose` fires only once the exit completes. It's safe to call from a button's
 * onClick mid-update — the destroy happens later in a clean onUpdate, and the UIElement
 * `_destroyed` guard keeps the unwinding traversal off the deleted node.
 */
globalThis.UIModal = class UIModal {
  /** @param {Object} [modal] { onClose, closeOnBackdrop, closeOnEscape, root: UIElement, duration, slide } */
  constructor(modal = {}) {
    this.onClose = modal.onClose ?? noop;
    this.closeOnBackdrop = modal.closeOnBackdrop ?? true;
    this.closeOnEscape = modal.closeOnEscape ?? true;
    this._root = modal.root ?? null; // the full-screen root, set by gemsModal

    this.duration = modal.duration ?? 0.18; // s per direction (Time.raw)
    this.slide = modal.slide ?? 28; // px the card rises into place

    // The backdrop dim is the root's own UIPanel; capture its target alpha so the
    // enter fade can scale up to it (and the exit back down).
    this._backdrop =
      this._root !== null ? this._root.getComponent(UIPanel) : null;
    this._dim =
      this._backdrop !== undefined && this._backdrop !== null
        ? this._backdrop.alpha
        : 0;

    this._phase = 0; // 0 entering, 1 shown, 2 exiting, 3 removed
    this._t = 0;
    this._apply(0); // start hidden (faded out + slid down) before the first draw
  }

  // Visibility factor f∈[0,1]: 0 = fully hidden, 1 = fully shown.
  _apply(f) {
    if (this._backdrop !== undefined && this._backdrop !== null) {
      this._backdrop.alpha = this._dim * f;
    }
    if (this._root !== null) this._root.scrollY = -this.slide * (1 - f);
  }

  /** Begin the exit animation (idempotent); the root is removed + onClose fires once it completes. */
  close() {
    if (this._phase >= 2 || this._root === null) return; // already exiting / gone
    this._phase = 2;
    this._t = 0;
  }

  /** @param {UIElement} element @param {boolean} block @returns {boolean} always true (exclusive) until removed */
  onUpdate(element, block) {
    if (this._phase === 3) return block;

    // Advance the enter / exit animation on a wall-clock timer (UI ignores Time.scale).
    if (this._phase === 0) {
      this._t += Time.raw;
      const p = clamp(this._t / this.duration, 0, 1);
      this._apply(Tween.easeInOutQuad(p));
      if (p >= 1) this._phase = 1;
    } else if (this._phase === 2) {
      this._t += Time.raw;
      const p = clamp(this._t / this.duration, 0, 1);
      this._apply(1 - Tween.easeInOutQuad(p));
      if (p >= 1) {
        this._phase = 3;
        UI.remove(this._root);
        this._root.destroy();
        this.onClose();
      }
      return true; // exiting: swallow input, ignore dismiss triggers below
    }

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
  // background while the dialog is up (kept exclusive until it's fully removed).
  /** @returns {boolean} whether nav is blocked from roots beneath this modal */
  navExclusive() {
    return this._phase !== 3;
  }
};
