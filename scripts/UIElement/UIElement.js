/**
 * @typedef {Object} UIComponent
 * @property {function(UIElement|boolean): boolean} onUpdate
 * @property {function(UIElement): void} onDraw
 * @property {function(UIElement): void} onDestroy
 */

// Tree node backed by a flexpanel (GameMaker Flexbox) layout node. Holds child elements + a
// list of UIComponents (behavior/visuals queried by class via getComponent). Runtime change
// (scroll, drag, clip) is driven by draw-time offset/clip math through getLayoutPosition — NOT
// live flexpanel style mutation — so a scrolled/dragged subtree moves at both draw and hit-test
// time without a reflow. See CLAUDE.md for the flexpanel-mutation idiom.
globalThis.UIElement = class UIElement {
  /** @param {Object} [style] flexpanel node style struct (fixed layout props, set once at construction) */
  constructor(style = {}) {
    this.enabled = true;
    this.flexpanel = flexpanel_create_node(style);
    this.direction = flexpanel_direction.LTR;
    /** @type {UIElement|null} */
    this.parent = null;
    /** @type {UIElement[]} */
    this.children = [];
    /** @type {UIComponent[]} */
    this.components = [];
    this.dirty = true;
    // Clip container: when true, children are clipped to this element's rect via an
    // off-screen surface (see draw()). `scrollY` shifts this element's whole subtree
    // up at draw + hit-test time (applied in getLayoutPosition); `clipInsetRight`
    // reserves a right gutter (e.g. for a scrollbar) that stays outside the clip.
    this.clip = false;
    this.scrollY = 0;
    this.clipInsetRight = 0;
    // Drag offset (UIDrag / draggable windows). Unlike scrollY (which offsets only a
    // container's descendants), dragX/dragY offset THIS element AND its subtree, so a
    // window moves bodily when its title bar is dragged. Applied in getLayoutPosition —
    // never via flexpanel mutation (unreliable on GMRT 0.19, bug #15065).
    this.dragX = 0;
    this.dragY = 0;
    // Set in destroy(); guards the post-update refresh / draw so an element torn
    // down mid-traversal (e.g. a modal closing itself on a button click) doesn't
    // touch its already-deleted flexpanel node.
    this._destroyed = false;
  }

  /**
   * @param {UIComponent} component
   * @param {number} index
   * @returns {UIElement}
   */
  addComponent(component, index = this.components.length) {
    this.components.splice(index, 0, component);
    return this;
  }

  /**
   * @param {typeof UIComponent} ComponentClass
   * @returns {UIComponent|undefined}
   */
  getComponent(ComponentClass) {
    return this.components.find((c) => c instanceof ComponentClass);
  }

  /**
   * @param {typeof UIComponent} ComponentClass
   * @returns {UIComponent[]}
   */
  getComponents(ComponentClass) {
    return this.components.filter((c) => c instanceof ComponentClass);
  }

  /**
   * @param {UIComponent} component
   * @returns {UIElement}
   */
  removeComponent(component) {
    const index = this.components.indexOf(component);
    if (index > -1) {
      if (component.onDestroy) component.onDestroy(this);
      this.components.splice(index, 1);
    }
    return this;
  }

  /** Tear down this element + its subtree (components' onDestroy, child elements, flexpanel node). Idempotent. */
  destroy() {
    if (this._destroyed) return; // idempotent — close() may fire more than once
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

  /**
   * Update this element's subtree then its own components. `block` is true when an
   * earlier-traversed (higher) element already captured the pointer this frame; the return
   * value propagates that capture upward.
   * @param {boolean} block @returns {boolean} whether the pointer is now captured
   */
  update(block) {
    if (this._destroyed) return block; // already torn down (e.g. a closed modal's subtree)
    // A clip container hides its subtree outside its own rect, so the pointer must
    // be inside the viewport for children to receive input — otherwise a scrolled-
    // away (invisible) child would still be clickable.
    let childBlock = block;
    let insideClip = true;
    if (this.clip) {
      const mx = device_mouse_x_to_gui(0);
      const my = device_mouse_y_to_gui(0);
      insideClip = this.positionMeeting(mx, my);
      if (!insideClip) childBlock = true;
    }
    [...this.children].reverse().forEach((child) => {
      if (child.enabled) childBlock = child.update(childBlock) || childBlock;
    });
    // A descendant's onUpdate (e.g. a modal button calling close()) may have
    // destroyed this element mid-traversal — stop before touching the deleted node.
    if (this._destroyed) return block;
    // Children outside the viewport didn't legitimately capture the pointer, so
    // don't report their (forced) block upward.
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

  /** Draw this element's components then its children (clipped to a surface when `clip` is set). */
  draw() {
    if (this._destroyed) return;
    // Components (panel background, scrollbar) draw unclipped in the element's space.
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

  // Clip children to this element's rect (minus any scrollbar gutter) with the GPU scissor: a
  // rasterizer-level rectangle on the render target, so children draw DIRECTLY to the back buffer
  // at full window density — crisp SDF text, correct blending, and zero surface memory (no off-
  // screen surface, no resolution cap, no premultiplied-alpha dance). Verified on GMRT 0.20 (see
  // the gpu_set_scissor GMRT-Safe Idiom): it clips, save/restore via gpu_get/set_scissor does NOT
  // leak, and it doesn't crash — the old "scissor leaks globally" caveat was a 0.19-era discipline
  // issue, not a runtime defect. Two things to respect: scissor coords are render-target (window)
  // PIXELS, not GUI units, and the GUI layer is scaled to the window, so convert by k = window/gui;
  // and intersect with the CURRENT scissor so a clip nested in another clip (a gemsScroll within a
  // gemsScroll) is bounded by BOTH — which also retires the old double-nested-text bug, since with
  // no nested surfaces there is no world matrix to lose.
  _drawClipped() {
    const pos = this.getLayoutPosition();
    const w = Math.ceil(pos.width - this.clipInsetRight);
    const h = Math.ceil(pos.height);
    if (!(w > 0) || !(h > 0)) return; // unlaid-out (NaN) or zero-size

    // Scissor coords are physical render-target PIXELS, while UI lays out in design-resolution GUI
    // units (display_get_gui_*) that the runtime stretches to fill the target — so convert GUI →
    // target by k = target/gui. The GUI render target is the WINDOW back buffer. Size it via
    // Display.clipW/H (the crash-safe min of the intended size and the OS-reported size), NOT a raw
    // window/surface query: on a resolution-change frame those lag the back buffer, so a scissor
    // built from the OLD (bigger) size overflows the shrunk target → a fatal "scissor not contained
    // in the render target" validation error. clipW/H never exceeds the live back buffer (see there).
    const gw = display_get_gui_width();
    const gh = display_get_gui_height();
    const tw = Display.clipW();
    const th = Display.clipH();
    const kx = gw > 0 ? tw / gw : 1;
    const ky = gh > 0 ? th / gh : 1;

    // This element's clip rect in render-target pixels, clamped to the target — an off-canvas widget
    // (or a stale size on a transition frame) must never yield a rect larger than the target.
    let x1 = Math.floor(pos.left) * kx;
    let y1 = Math.floor(pos.top) * ky;
    let x2 = x1 + w * kx;
    let y2 = y1 + h * ky;
    if (x1 < 0) x1 = 0;
    if (y1 < 0) y1 = 0;
    if (x2 > tw) x2 = tw;
    if (y2 > th) y2 = th;

    // Intersect with the CURRENT scissor so a clip nested in another clip is bounded by both.
    // gpu_get_scissor() reports {0,0,0,0} when no scissor is set (the full-target default, NOT the
    // target dims) — so only clamp when prev is a real positive sub-rect.
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
    // Restore. Replaying the saved {0,0,0,0} (the unset sentinel) does NOT re-enable full drawing
    // on GMRT — it clips everything drawn AFTER this to an empty rect (footers, dropdown popups,
    // later roots all vanish). So at top level reset to the full render target explicitly; only a
    // genuinely nested clip restores its parent's (positive) rect.
    if (nested) gpu_set_scissor(prev);
    else gpu_set_scissor(0, 0, tw, th);
  }

  /**
   * @param {UIElement} element
   * @param {number} index
   * @returns {UIElement}
   */
  insertChild(element, index = this.children.length) {
    if (element.parent !== null) element.parent.removeChild(element);
    element.parent = this;
    this.children.splice(index, 0, element);
    flexpanel_node_insert_child(this.flexpanel, element.flexpanel, index);
    this.markDirty();
    return this;
  }

  /** Detach `element` from this node. @param {UIElement} element @returns {UIElement} the removed element */
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

  /** Flag the whole tree dirty (walks to the root) so the next update() recomputes layout. */
  markDirty() {
    let root = this;
    while (root.parent !== null) {
      root = root.parent;
    }
    root.dirty = true;
  }

  /** Recompute flexbox layout from the root (a no-op on non-root nodes); clears the dirty flag. */
  refresh() {
    if (!this.parent) {
      const w = display_get_gui_width();
      const h = display_get_gui_height();
      flexpanel_calculate_layout(this.flexpanel, w, h, this.direction);
    }
    this.dirty = false;
  }

  /**
   * The flexbox-computed rect, adjusted by this element's drag offset and every ancestor's
   * scroll/drag — the single chokepoint that makes scroll/drag apply at draw AND hit-test time.
   * @returns {{left:number, top:number, width:number, height:number}}
   */
  getLayoutPosition() {
    const pos = flexpanel_node_layout_get_position(this.flexpanel, false);
    // This element's own drag offset moves itself + its whole subtree.
    if (this.dragX) pos.left += this.dragX;
    if (this.dragY) pos.top += this.dragY;
    // Apply the accumulated scroll/drag of ancestors so a scroll container shifts its
    // whole subtree at draw AND hit-test time through this single chokepoint (no
    // flex mutation). A container's own scrollY offsets its descendants, not itself;
    // a dragged ancestor (e.g. an enclosing window) carries this element along too.
    let p = this.parent;
    while (p !== null) {
      if (p.scrollY) pos.top -= p.scrollY;
      if (p.dragX) pos.left += p.dragX;
      if (p.dragY) pos.top += p.dragY;
      p = p.parent;
    }
    return pos;
  }

  /** @param {number} x @param {number} y @returns {boolean} whether the GUI point is inside this element's rect */
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

  /** @param {number} width @param {number} unit flexpanel_unit @returns {UIElement} */
  setWidth(width, unit) {
    flexpanel_node_style_set_width(this.flexpanel, width, unit);
    this.markDirty();
    return this;
  }

  /** @param {number} height @param {number} unit flexpanel_unit @returns {UIElement} */
  setHeight(height, unit) {
    flexpanel_node_style_set_height(this.flexpanel, height, unit);
    this.markDirty();
    return this;
  }

  // The style setters below stay commented even on GMRT 0.20 (where live flexpanel
  // mutation now works again — setWidth/setHeight above are the proof). Two reasons:
  // the whole UI kit drives runtime change through draw-time offset/clip math + dirty
  // structural reflow (not live style mutation), so nothing calls them; and the full
  // set is ~45 methods — uncommenting it would push this class past the 50-method
  // ceiling (#15065, STILL live on 0.20) and crash. Enable an individual setter on
  // demand if a consumer needs one, watching the count.

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

  /** @param {number} edge flexpanel_edge @param {number} value @param {number} unit flexpanel_unit @returns {UIElement} */
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

  /** @returns {{value:number, unit:number}} the style width (not the computed layout width) */
  getWidth() {
    return flexpanel_node_style_get_width(this.flexpanel);
  }

  /** @returns {{value:number, unit:number}} the style height (not the computed layout height) */
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
