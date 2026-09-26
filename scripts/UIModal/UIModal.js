/**
 * @implements {UIComponent}
 * Exclusive modal controller on a full-screen root: blocks all pointer input beneath it until
 * removed. Closes on a nav cancel or a backdrop click (a press no card child captured). Enter and
 * exit fade the backdrop and slide the card by scroll offset, with no flex mutation. `close()` is
 * safe mid-update: the root is removed and onClose fires once the exit completes.
 */
globalThis.UIModal = class UIModal {
  /** modal: { onClose, closeOnBackdrop, closeOnEscape, root: UIElement, duration, slide, slideX } */
  constructor(modal = {}) {
    this.onClose = modal.onClose ?? noop;
    this.closeOnBackdrop = modal.closeOnBackdrop ?? true;
    this.closeOnEscape = modal.closeOnEscape ?? true;
    this._root = modal.root ?? null;

    this.duration = modal.duration ?? 0.18; // s per direction, wall-clock
    this.slide = modal.slide ?? 28; // px the card rises
    this.slideX = modal.slideX ?? 0; // px the card enters from the right (a side sheet)

    // the fade scales to the backdrop's authored alpha
    this._backdrop =
      this._root !== null ? this._root.getComponent(UIPanel) : null;
    this._dim =
      this._backdrop !== undefined && this._backdrop !== null
        ? this._backdrop.alpha
        : 0;

    this._phase = 0; // 0 entering, 1 shown, 2 exiting, 3 removed
    this._t = 0;
    this._apply(0); // start hidden before the first draw
  }

  /**
   * f in [0,1]: 0 = hidden, 1 = shown.
   */
  _apply(f) {
    if (this._backdrop !== undefined && this._backdrop !== null) {
      this._backdrop.alpha = this._dim * f;
    }
    if (this._root !== null) {
      this._root.scrollY = -this.slide * (1 - f);
      this._root.scrollX = -this.slideX * (1 - f);
    }
  }

  /** Idempotent. */
  close() {
    if (this._phase >= 2 || this._root === null) return;
    this._phase = 2;
    this._t = 0;
  }

  /**
   * Drops the root now, with no exit and no onClose (idempotent): for an owner tearing the modal
   * down outside its flow, where a deferred onClose would land on state already replaced.
   */
  remove() {
    if (this._phase === 3 || this._root === null) return;
    this._phase = 3;
    UI.remove(this._root);
    this._root.destroy();
  }

  onUpdate(element, block) {
    if (this._phase === 3) return block;

    // wall-clock: UI ignores time scale
    if (this._phase === 0) {
      this._t += Time.raw;
      const p = clamp(this._t / this.duration, 0, 1);
      this._apply(curve(acEaseInOut, p));
      if (p >= 1) this._phase = 1;
    } else if (this._phase === 2) {
      this._t += Time.raw;
      const p = clamp(this._t / this.duration, 0, 1);
      this._apply(1 - curve(acEaseInOut, p));
      if (p >= 1) {
        this._phase = 3;
        UI.remove(this._root);
        this._root.destroy();
        this.onClose();
      }
      return true; // exiting: swallow input, skip dismiss triggers
    }

    // backdrop click: a press the card didn't capture
    if (this.closeOnBackdrop && !block && Input.pointer.left.pressed) {
      this.close();
      return true;
    }
    return true; // exclusive: swallow all pointer input beneath
  }

  /** A cancel no child took closes the modal; one arriving mid-exit is spent on it. */
  onNav(element, ev) {
    if (ev.kind !== "cancel") return false;
    if (this._phase >= 2) return true;
    if (!this.closeOnEscape) return false;
    this.close();
    return true;
  }

  // blocks keyboard focus beneath the modal, as the pointer block does, until it's removed
  navExclusive() {
    return this._phase !== 3;
  }
};
