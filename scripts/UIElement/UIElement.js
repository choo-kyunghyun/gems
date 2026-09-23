/**
 * @typedef {Object} UIComponent
 * @property {function(UIElement|boolean): boolean} onUpdate
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
 * `enabled`, never `display`; a size change is a structural insert/remove, which reflows.
 * Measure-callback self-sizing is unsupported (docs/GMRT.md).
 */
globalThis.UIElement = class UIElement {
  constructor(style = {}) {
    this.enabled = true;
    this.flexpanel = flexpanel_create_node(style);
    this.direction = flexpanel_direction.LTR;
    this.parent = null;
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
    [...this.children].reverse().forEach((element) => {
      element.destroy();
    });
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
    [...this.children].reverse().forEach((child) => {
      if (child.enabled) childBlock = child.update(childBlock) || childBlock;
    });
    // a descendant's onUpdate may destroy this element mid-traversal.
    if (this._destroyed) return block;
    // don't propagate the forced block from out-of-viewport children.
    let result = this.clip && !insideClip ? block : childBlock;
    for (const component of this.components) {
      if (component.onUpdate) {
        const response = component.onUpdate(this, result);
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
      for (const child of this.children) {
        if (child.enabled) child.draw();
      }
    }
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
    for (const child of this.children) {
      if (child.enabled) child.draw();
    }
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
    this.children.splice(index, 0, element);
    flexpanel_node_insert_child(this.flexpanel, element.flexpanel, index);
    this.markDirty();
    return this;
  }

  removeChild(element) {
    const index = this.children.indexOf(element);
    if (index > -1) {
      this.children.splice(index, 1);
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

  setWidth(width, unit) {
    flexpanel_node_style_set_width(this.flexpanel, width, unit);
    this.markDirty();
    return this;
  }

  setHeight(height, unit) {
    flexpanel_node_style_set_height(this.flexpanel, height, unit);
    this.markDirty();
    return this;
  }

  // BUG: [#15065] the style accessors below stay commented out: enabling them all would breach
  // the class method ceiling (docs/GMRT.md). Enable one on demand, minding the count.

  // setMinWidth(value, unit) {
  //   flexpanel_node_style_set_min_width(this.flexpanel, value, unit);
  //   this.markDirty();
  //   return this;
  // }

  // setMaxWidth(value, unit) {
  //   flexpanel_node_style_set_max_width(this.flexpanel, value, unit);
  //   this.markDirty();
  //   return this;
  // }

  // setMinHeight(value, unit) {
  //   flexpanel_node_style_set_min_height(this.flexpanel, value, unit);
  //   this.markDirty();
  //   return this;
  // }

  // setMaxHeight(value, unit) {
  //   flexpanel_node_style_set_max_height(this.flexpanel, value, unit);
  //   this.markDirty();
  //   return this;
  // }

  // setAspectRatio(value) {
  //   flexpanel_node_style_set_aspect_ratio(this.flexpanel, value);
  //   this.markDirty();
  //   return this;
  // }

  setPosition(edge, value, unit) {
    flexpanel_node_style_set_position(this.flexpanel, edge, value, unit);
    this.markDirty();
    return this;
  }

  // setPositionType(value) {
  //   flexpanel_node_style_set_position_type(this.flexpanel, value);
  //   this.markDirty();
  //   return this;
  // }

  // setMargin(edge, size, unit = flexpanel_unit.point) {
  //   flexpanel_node_style_set_margin(this.flexpanel, edge, size, unit);
  //   this.markDirty();
  //   return this;
  // }

  // setPadding(edge, size, unit = flexpanel_unit.point) {
  //   flexpanel_node_style_set_padding(this.flexpanel, edge, size, unit);
  //   this.markDirty();
  //   return this;
  // }

  // setBorder(edge, size) {
  //   flexpanel_node_style_set_border(this.flexpanel, edge, size);
  //   this.markDirty();
  //   return this;
  // }

  // setGap(gutter, size) {
  //   flexpanel_node_style_set_gap(this.flexpanel, gutter, size);
  //   this.markDirty();
  //   return this;
  // }

  // setDirection(direction) {
  //   flexpanel_node_style_set_direction(this.flexpanel, direction);
  //   this.markDirty();
  //   return this;
  // }

  // setFlexDirection(direction) {
  //   flexpanel_node_style_set_flex_direction(this.flexpanel, direction);
  //   this.markDirty();
  //   return this;
  // }

  // setFlexWrap(align) {
  //   flexpanel_node_style_set_flex_wrap(this.flexpanel, align);
  //   this.markDirty();
  //   return this;
  // }

  // setBasis(value, unit) {
  //   flexpanel_node_style_set_flex_basis(this.flexpanel, value, unit);
  //   this.markDirty();
  //   return this;
  // }

  // setGrow(grow) {
  //   flexpanel_node_style_set_flex_grow(this.flexpanel, grow);
  //   this.markDirty();
  //   return this;
  // }

  // setShrink(shrink) {
  //   flexpanel_node_style_set_flex_shrink(this.flexpanel, shrink);
  //   this.markDirty();
  //   return this;
  // }

  // setFlex(flex) {
  //   flexpanel_node_style_set_flex(this.flexpanel, flex);
  //   this.markDirty();
  //   return this;
  // }

  // setJustifyContent(justify) {
  //   flexpanel_node_style_set_justify_content(this.flexpanel, justify);
  //   this.markDirty();
  //   return this;
  // }

  // setAlignItems(align) {
  //   flexpanel_node_style_set_align_items(this.flexpanel, align);
  //   this.markDirty();
  //   return this;
  // }

  // setAlignSelf(align) {
  //   flexpanel_node_style_set_align_self(this.flexpanel, align);
  //   this.markDirty();
  //   return this;
  // }

  // setAlignContent(align) {
  //   flexpanel_node_style_set_align_content(this.flexpanel, align);
  //   this.markDirty();
  //   return this;
  // }

  // setDisplay(display) {
  //   flexpanel_node_style_set_display(this.flexpanel, display);
  //   this.markDirty();
  //   return this;
  // }

  /** Style width (not computed layout width). */
  getWidth() {
    return flexpanel_node_style_get_width(this.flexpanel);
  }

  /** Style height (not computed layout height). */
  getHeight() {
    return flexpanel_node_style_get_height(this.flexpanel);
  }

  // getMinWidth() {
  //   return flexpanel_node_style_get_min_width(this.flexpanel);
  // }

  // getMaxWidth() {
  //   return flexpanel_node_style_get_max_width(this.flexpanel);
  // }

  // getMinHeight() {
  //   return flexpanel_node_style_get_min_height(this.flexpanel);
  // }

  // getMaxHeight() {
  //   return flexpanel_node_style_get_max_height(this.flexpanel);
  // }

  // getAspectRatio() {
  //   return flexpanel_node_style_get_aspect_ratio(this.flexpanel);
  // }

  // getPosition(edge) {
  //   return flexpanel_node_style_get_position(this.flexpanel, edge);
  // }

  // getPositionType() {
  //   return flexpanel_node_style_get_position_type(this.flexpanel);
  // }

  // getMargin(edge) {
  //   return flexpanel_node_style_get_margin(this.flexpanel, edge);
  // }

  // getPadding(edge) {
  //   return flexpanel_node_style_get_padding(this.flexpanel, edge);
  // }

  // getBorder(edge) {
  //   return flexpanel_node_style_get_border(this.flexpanel, edge);
  // }

  // getGap(gutter) {
  //   return flexpanel_node_style_get_gap(this.flexpanel, gutter);
  // }

  // getDirection() {
  //   return flexpanel_node_style_get_direction(this.flexpanel);
  // }

  // getFlexDirection() {
  //   return flexpanel_node_style_get_flex_direction(this.flexpanel);
  // }

  // getFlexWrap() {
  //   return flexpanel_node_style_get_flex_wrap(this.flexpanel);
  // }

  // getFlexBasis() {
  //   return flexpanel_node_style_get_flex_basis(this.flexpanel);
  // }

  // getFlexGrow() {
  //   return flexpanel_node_style_get_flex_grow(this.flexpanel);
  // }

  // getFlexShrink() {
  //   return flexpanel_node_style_get_flex_shrink(this.flexpanel);
  // }

  // getFlex() {
  //   return flexpanel_node_style_get_flex(this.flexpanel);
  // }

  // getJustifyContent() {
  //   return flexpanel_node_style_get_justify_content(this.flexpanel);
  // }

  // getAlignItems() {
  //   return flexpanel_node_style_get_align_items(this.flexpanel);
  // }

  // getAlignSelf() {
  //   return flexpanel_node_style_get_align_self(this.flexpanel);
  // }

  // getAlignContent() {
  //   return flexpanel_node_style_get_align_content(this.flexpanel);
  // }

  // getDisplay() {
  //   return flexpanel_node_style_get_display(this.flexpanel);
  // }
};
