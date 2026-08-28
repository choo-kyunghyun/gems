/**
 * @implements {UIComponent}
 * Exclusive modal controller on a full-screen root (gemsModal). Returns `true` every
 * frame to block all pointer input beneath it. Closes on Escape or a backdrop click (a
 * press no card child captured). Enter/exit animates: backdrop dim fades + card slides
 * via `root.scrollY`/`scrollX` (offsets the subtree = the card) — no flex mutation. `.close()`
 * starts the exit (idempotent); root is removed + onClose fires once it completes —
 * safe to call mid-update (destroy happens later, UIElement `_destroyed` guards the unwind).
 */
globalThis.UIModal = class UIModal {
  /** modal: { onClose, closeOnBackdrop, closeOnEscape, root: UIElement, duration, slide, slideX } */
  constructor(modal = {}) {
    this.onClose = modal.onClose ?? noop;
    this.closeOnBackdrop = modal.closeOnBackdrop ?? true;
    this.closeOnEscape = modal.closeOnEscape ?? true;
    this._root = modal.root ?? null; // full-screen root, set by gemsModal

    this.duration = modal.duration ?? 0.18; // s per direction (Time.raw)
    this.slide = modal.slide ?? 28; // px the card rises
    this.slideX = modal.slideX ?? 0; // px the card enters from the right (a side sheet)

    // capture the backdrop UIPanel's target alpha so the enter/exit fade scales to it.
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
   * visibility factor f∈[0,1]: 0 = hidden, 1 = shown.
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

  /** Begin the exit animation (idempotent). */
  close() {
    if (this._phase >= 2 || this._root === null) return; // already exiting / gone
    this._phase = 2;
    this._t = 0;
  }

  /** Always returns true (exclusive) until removed. */
  onUpdate(element, block) {
    if (this._phase === 3) return block;

    // advance enter/exit on wall-clock (UI ignores Time.scale).
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
      return true; // exiting: swallow input, skip dismiss triggers
    }

    // UI.keyPressed, not the raw edge: a child may have consumed this Esc (UIRebind's cancel)
    if (this.closeOnEscape && UI.keyPressed(vk_escape)) {
      this.close();
      return true;
    }
    // backdrop click: a press the card didn't capture (block still false).
    if (this.closeOnBackdrop && !block && UIPointer.pressed) {
      this.close();
      return true;
    }
    return true; // exclusive: swallow all pointer input beneath
  }

  // UINav reads this to stop collecting focusables beneath the modal (mirrors the
  // pointer block) until it's fully removed.
  navExclusive() {
    return this._phase !== 3;
  }
};
