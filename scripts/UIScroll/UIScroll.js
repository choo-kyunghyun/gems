/**
 * @implements {UIComponent}
 * Vertical scroll controller for a clip viewport. Drives scrolling by draw-time offset
 * (sets viewport scrollY, which getLayoutPosition subtracts for the subtree) — never flex
 * mutation. The scrollbar itself (geometry/drag/draw) is the shared UIScrollbar model;
 * it sits in a right gutter reserved via clipInsetRight (outside the clipped content),
 * and the gutter collapses to 0 when nothing overflows. Wheel + drag-thumb input.
 * GMRT: pointer read live each frame (no cached primitive to clobber).
 */
globalThis.UIScroll = class UIScroll {
  /** @param {Object} [scroll] { content: UIElement, barW, barPad, minThumb, wheelStep, trackColor, trackAlpha, thumbColor, thumbHover } */
  constructor(scroll = {}) {
    this.content = scroll.content; // body element to measure + scroll
    this.scroll = 0; // scrollY in px
    this.barPad = scroll.barPad ?? 4;
    this.wheelStep = scroll.wheelStep ?? 48;
    // shared track/thumb model — bar style opts (barW/minThumb/colors) pass through.
    this._bar = new UIScrollbar(scroll);
    this._track = null; // geometry cached in onUpdate for onDraw (same frame)
    this._max = 0; // px of overflow at the last update
  }

  /** @param {UIElement} element the clip viewport @param {boolean} block @returns {boolean} whether the pointer is captured */
  onUpdate(element, block) {
    const pos = element.getLayoutPosition();
    const contentH = this.content ? this.content.getLayoutPosition().height : 0;

    const barW = this._bar.barW;
    const max = Math.max(0, contentH - pos.height);
    const m = this._bar.metrics(
      pos.left + pos.width - barW - this.barPad,
      pos.top + this.barPad,
      Math.max(1, pos.height - this.barPad * 2),
      pos.height,
      contentH,
      max > 0 ? this.scroll / max : 0,
    );

    // reserve the gutter only when scrollable, so a short list uses full width.
    element.clipInsetRight = max > 0 ? barW + this.barPad * 2 : 0;

    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);

    // positionMeeting read live each use, never cached in a local (the &&-clobber quirk, #15549).
    if (max > 0) {
      const wheel = UIPointer.wheel;
      if (wheel !== 0 && element.positionMeeting(mx, my))
        this.scroll += wheel * this.wheelStep;
    }
    // input() runs even at max <= 0 so a drag latched before the content shrank still
    // releases; the hover gate goes false so no new drag can start.
    const t = this._bar.input(
      m,
      mx,
      my,
      max > 0 && element.positionMeeting(mx, my),
    );
    if (t >= 0 && max > 0) this.scroll = t * max;

    // positive test: max can be NaN in the residual mid-pass-insert window — never let
    // NaN into the persistent scroll (it would poison scrollY for the whole subtree).
    this.scroll = max > 0 ? clamp(this.scroll, 0, max) : 0;
    element.scrollY = this.scroll; // offsets subtree via getLayoutPosition
    this._track = m;
    this._max = max;

    // capture the pointer over the viewport (or dragging) so wheel/drag don't leak behind.
    return this._bar.dragging || element.positionMeeting(mx, my) || block;
  }

  /** @param {UIElement} element */
  onDraw(element) {
    if (this._track === null || !(this._max > 0)) return; // nothing overflowing → no scrollbar
    this._bar.draw(this._track);
  }
};
