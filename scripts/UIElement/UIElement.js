/**
 * `onUpdate(element, block, above)`: `block` also counts a descendant's capture, `above` only
 * what lies over the element.
 * @typedef {Object} UIComponent
 * @property {function(UIElement, boolean, boolean): boolean} onUpdate
 * @property {function(UIElement): void} onDraw
 * @property {function(UIElement): void} onDestroy
 */

/**
 * Per-element blackboard shared by the element's components. Flat scalars only (docs/GMRT.md).
 * Component order is write order: a writer must precede its readers on the element.
 * @typedef {Object} UIState
 * @property {boolean} [hover] pointer inside the element and not blocked upstream
 * @property {boolean} [held] press started inside; cleared on release
 * @property {boolean} [clicked] one-frame pulse: released inside this frame
 * @property {boolean} [disabled]
 * @property {boolean} [selected]
 */

/**
 * flexpanel-backed UI tree node, and the rule for how a layout change reaches the screen:
 * layout props are set once at construction; runtime movement (scroll, drag) is draw-time offset
 * math through getLayoutPosition, applied at draw and hit-test with no reflow; show/hide is
 * `enabled`, never `display`; a size change is a structural insert/remove, which reflows. A
 * `page`, marked before it is inserted, stands in for every sibling before it while it is
 * enabled: they keep their layout but neither update, draw nor take the focus.
 * Measure-callback self-sizing is unsupported (docs/GMRT.md).
 */
globalThis.UIElement = class UIElement {
  constructor(style = {}) {
    this.enabled = true;
    this.page = false;
    this._pages = 0; // page children: a parent with none skips the scan for the front
    this.flexpanel = flexpanel_create_node(style);
    this.direction = flexpanel_direction.LTR;
    this.parent = null;
    // replaced on every insert/remove, never mutated, so a walk over the array it began with sees
    // the tree as it was
    this.children = [];
    this.components = [];
    /** @type {UIState} */
    this.state = {};
    this.dirty = true;
    // scroll shifts descendants, not self; the inset reserves a right gutter outside the clip.
    this.clip = false;
    this.scrollX = 0;
    this.scrollY = 0;
    this.clipInsetRight = 0;
    // drag shifts this element and its subtree.
    this.dragX = 0;
    this.dragY = 0;
    // guards against touching a deleted flexpanel node mid-traversal.
    this._destroyed = false;
  }

  addComponent(component, index = this.components.length) {
    this.components.splice(index, 0, component);
    return this;
  }

  getComponent(ComponentClass) {
    return this.components.find((c) => c instanceof ComponentClass);
  }

  getComponents(ComponentClass) {
    return this.components.filter((c) => c instanceof ComponentClass);
  }

  removeComponent(component) {
    const index = this.components.indexOf(component);
    if (index > -1) {
      if (component.onDestroy) component.onDestroy(this);
      this.components.splice(index, 1);
    }
    return this;
  }

  /** Idempotent. */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    for (const component of this.components) {
      if (component.onDestroy) component.onDestroy(this);
    }
    const kids = this.children;
    for (let i = kids.length - 1; i >= 0; i--) kids[i].destroy();
    if (this.parent !== null) this.parent.removeChild(this);
    flexpanel_delete_node(this.flexpanel, false);
  }

  /** `block`: the pointer is already captured upstream. Returns whether it is captured now. */
  update(block) {
    if (this._destroyed) return block;
    // scrolled-away children must not stay clickable.
    let childBlock = block;
    let insideClip = true;
    if (this.clip) {
      const mx = Input.pointer.x;
      const my = Input.pointer.y;
      insideClip = this.positionMeeting(mx, my);
      if (!insideClip) childBlock = true;
    }
    const kids = this.children;
    const front = this._pages > 0 ? this.front() : 0;
    for (let i = kids.length - 1; i >= front; i--) {
      const child = kids[i];
      if (child.enabled) childBlock = child.update(childBlock) || childBlock;
    }
    // a descendant's onUpdate may destroy this element mid-traversal.
    if (this._destroyed) return block;
    // don't propagate the forced block from out-of-viewport children.
    let result = this.clip && !insideClip ? block : childBlock;
    for (const component of this.components) {
      if (component.onUpdate) {
        const response = component.onUpdate(this, result, block);
        if (response === true) result = true;
      }
    }
    if (this.dirty && !this._destroyed) this.refresh();
    return result;
  }

  draw() {
    if (this._destroyed) return;
    // components draw unclipped.
    for (const component of this.components) {
      if (component.onDraw) component.onDraw(this);
    }
    if (this.clip) {
      this._drawClipped();
    } else {
      this._drawChildren();
    }
  }

  _drawChildren() {
    const kids = this.children;
    for (let i = this._pages > 0 ? this.front() : 0; i < kids.length; i++) {
      if (kids[i].enabled) kids[i].draw();
    }
  }

  /** The index of the last enabled page child, the first child that shows; 0 with none. */
  front() {
    if (this._pages === 0) return 0;
    const kids = this.children;
    for (let i = kids.length - 1; i > 0; i--) {
      if (kids[i].page ? kids[i].enabled : false) return i;
    }
    return 0;
  }

  /**
   * Scissors children on the back buffer (no off-screen surface), intersected with any enclosing
   * clip so nested clips both apply (docs/GMRT.md).
   */
  _drawClipped() {
    const pos = this.getLayoutPosition();
    const w = Math.ceil(pos.width - this.clipInsetRight);
    const h = Math.ceil(pos.height);
    if (!(w > 0) || !(h > 0)) return; // unlaid-out (NaN) or zero-size

    // the scissor is in render-target pixels, sized never to exceed the back buffer (docs/GMRT.md).
    const gw = display_get_gui_width();
    const gh = display_get_gui_height();
    const tw = Display.clipW();
    const th = Display.clipH();
    const kx = gw > 0 ? tw / gw : 1;
    const ky = gh > 0 ? th / gh : 1;

    // clamped so an off-canvas or stale rect never exceeds the target.
    let x1 = Math.floor(pos.left) * kx;
    let y1 = Math.floor(pos.top) * ky;
    let x2 = x1 + w * kx;
    let y2 = y1 + h * ky;
    if (x1 < 0) x1 = 0;
    if (y1 < 0) y1 = 0;
    if (x2 > tw) x2 = tw;
    if (y2 > th) y2 = th;

    // an unset scissor reads as {0,0,0,0} (docs/GMRT.md).
    const prev = gpu_get_scissor();
    const nested = prev.w > 0 && prev.h > 0;
    if (nested) {
      if (x1 < prev.x) x1 = prev.x;
      if (y1 < prev.y) y1 = prev.y;
      if (x2 > prev.x + prev.w) x2 = prev.x + prev.w;
      if (y2 > prev.y + prev.h) y2 = prev.y + prev.h;
    }

    gpu_set_scissor(x1, y1, Math.max(0, x2 - x1), Math.max(0, y2 - y1));
    this._drawChildren();
    // BUG: [#6523] the scissor does not flush the batch: flush, then re-arm with an untextured
    // draw, both still inside this clip (docs/GMRT.md).
    draw_flush();
    const a0 = draw_get_alpha();
    draw_set_alpha(0);
    draw_rectangle_color(0, 0, 1, 1, c_black, c_black, c_black, c_black, false);
    draw_set_alpha(a0);
    // an unset scissor is never replayed (docs/GMRT.md).
    if (nested) gpu_set_scissor(prev);
    else gpu_set_scissor(0, 0, tw, th);
  }

  insertChild(element, index = this.children.length) {
    if (element.parent !== null) element.parent.removeChild(element);
    element.parent = this;
    const kids = this.children.slice();
    kids.splice(index, 0, element);
    this.children = kids;
    if (element.page) this._pages++;
    flexpanel_node_insert_child(this.flexpanel, element.flexpanel, index);
    this.markDirty();
    return this;
  }

  removeChild(element) {
    const index = this.children.indexOf(element);
    if (index > -1) {
      const kids = this.children.slice();
      kids.splice(index, 1);
      this.children = kids;
      if (element.page) this._pages--;
      flexpanel_node_remove_child(this.flexpanel, element.flexpanel);
      element.parent = null;
      this.markDirty();
    }
    return element;
  }

  markDirty() {
    let root = this;
    while (root.parent !== null) {
      root = root.parent;
    }
    root.dirty = true;
  }

  /** No-op on a non-root node. */
  refresh() {
    if (!this.parent) {
      const w = display_get_gui_width();
      const h = display_get_gui_height();
      flexpanel_calculate_layout(this.flexpanel, w, h, this.direction);
    }
    this.dirty = false;
  }

  /** The one rect both draw and hit-test use: layout plus every scroll/drag offset. */
  getLayoutPosition() {
    const pos = flexpanel_node_layout_get_position(this.flexpanel, false);
    if (this.dragX) pos.left += this.dragX;
    if (this.dragY) pos.top += this.dragY;
    let p = this.parent;
    while (p !== null) {
      if (p.scrollX) pos.left -= p.scrollX;
      if (p.scrollY) pos.top -= p.scrollY;
      if (p.dragX) pos.left += p.dragX;
      if (p.dragY) pos.top += p.dragY;
      p = p.parent;
    }
    return pos;
  }

  positionMeeting(x, y) {
    const pos = this.getLayoutPosition();
    return point_in_rectangle(
      x,
      y,
      pos.left,
      pos.top,
      pos.left + pos.width,
      pos.top + pos.height,
    );
  }

  /**
   * Any flexpanel style setter applied to this node, then a reflow:
   * `style(flexpanel_node_style_set_margin, flexpanel_edge.left, 8)`; a getter reads `flexpanel`
   * directly. BUG: [#15065] one door for every setter, as a method apiece would breach the class
   * method ceiling; and a built-in takes no spread, so the arity is dispatched (docs/GMRT.md).
   */
  style(set, ...args) {
    const node = this.flexpanel;
    const k = args.length;
    if (k === 1) set(node, args[0]);
    else if (k === 2) set(node, args[0], args[1]);
    else set(node, args[0], args[1], args[2]);
    this.markDirty();
    return this;
  }

  setWidth(width, unit) {
    return this.style(flexpanel_node_style_set_width, width, unit);
  }

  setHeight(height, unit) {
    return this.style(flexpanel_node_style_set_height, height, unit);
  }

  /** Style width (not computed layout width). */
  getWidth() {
    return flexpanel_node_style_get_width(this.flexpanel);
  }

  /** Style height (not computed layout height). */
  getHeight() {
    return flexpanel_node_style_get_height(this.flexpanel);
  }
};
