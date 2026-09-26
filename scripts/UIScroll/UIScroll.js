/**
 * @implements {UIComponent}
 * Vertical scroll controller for a clip viewport: scrolls by draw-time offset, never by layout
 * mutation. The scrollbar sits in a right gutter outside the clipped content, collapsed when
 * nothing overflows.
 */
globalThis.UIScroll = class UIScroll {
  /** scroll: { content: UIElement, barW, barPad, minThumb, wheelStep, trackColor, trackAlpha, thumbColor, thumbHover } */
  constructor(scroll = {}) {
    this.content = scroll.content;
    this.scroll = 0; // px
    this.barPad = scroll.barPad ?? 4;
    this.wheelStep = scroll.wheelStep ?? 48;
    this._bar = new UIScrollbar(scroll);
    this._track = null; // cached in onUpdate for the same frame's onDraw
    this._max = 0; // px of overflow at the last update
  }

  onUpdate(element, block, above) {
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

    // only when scrollable, so a short list uses the full width
    element.clipInsetRight = max > 0 ? barW + this.barPad * 2 : 0;

    const mx = Input.pointer.x;
    const my = Input.pointer.y;

    // a descendant's capture never stops the wheel or the grab; what lies over the viewport does.
    // BUG: positionMeeting is read live, never cached in a local (docs/GMRT.md #15549)
    if (max > 0 && !above) {
      const wheel = Input.pointer.wheel;
      if (wheel !== 0 && element.positionMeeting(mx, my))
        this.scroll += wheel * this.wheelStep;
    }
    // runs even without overflow so a drag latched before the content shrank still releases
    const t = this._bar.input(
      m,
      mx,
      my,
      max > 0 && !above && element.positionMeeting(mx, my),
    );
    if (t >= 0 && max > 0) this.scroll = t * max;

    // a positive test: max can be NaN mid-insert, which must never reach the persistent scroll
    this.scroll = max > 0 ? clamp(this.scroll, 0, max) : 0;
    element.scrollY = this.scroll;
    this._track = m;
    this._max = max;

    // capture the pointer so wheel and drag don't leak behind
    return this._bar.dragging || element.positionMeeting(mx, my) || block;
  }

  /** Scrolls the least that brings `target`, a descendant, inside the viewport `element`. */
  reveal(element, target) {
    const vp = element.getLayoutPosition(); // its own scroll is not applied to itself
    const tp = target.getLayoutPosition(); // already offset by the current scroll
    const margin = 8;
    let delta = 0;
    if (tp.top < vp.top + margin) {
      delta = tp.top - (vp.top + margin);
    } else if (tp.top + tp.height > vp.top + vp.height - margin) {
      delta = tp.top + tp.height - (vp.top + vp.height - margin);
    }
    if (delta === 0) return;
    const contentH = this.content ? this.content.getLayoutPosition().height : 0;
    const max = Math.max(0, contentH - vp.height);
    this.scroll = clamp(this.scroll + delta, 0, max);
    element.scrollY = this.scroll; // applied now, so a reveal up the chain reads it
  }

  onDraw(element) {
    if (this._track === null || !(this._max > 0)) return;
    this._bar.draw(this._track);
  }
};
