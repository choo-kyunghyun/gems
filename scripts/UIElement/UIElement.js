/**
 * @typedef {Object} UIComponent
 * @property {function(UIElement|boolean): boolean} onUpdate
 * @property {function(UIElement): void} onDraw
 * @property {function(UIElement): void} onDestroy
 */

/**
 * Shared per-element runtime state (the `element.state` blackboard) — written by behavior
 * components (UITrigger is the canonical writer), read by any sibling. Flat scalars only
 * (an object-keyed Map/Set crashes GMRT natively, and nested data invites deep-copy bugs).
 * Component array order = write order: a writer must precede its readers on the element.
 * @typedef {Object} UIState
 * @property {boolean} [hover] pointer inside the element and not blocked upstream
 * @property {boolean} [held] press started inside; cleared on release
 * @property {boolean} [clicked] one-frame pulse: released inside this frame
 * @property {boolean} [disabled] live disabled state (written by UIButton)
 * @property {boolean} [selected] live selected/toggled state (written by UIButton)
 */

// flexpanel-backed tree node.
//
// HOW LAYOUT CHANGES REACH THE SCREEN — the rule every widget follows. Live style mutation does
// work on GMRT (measure-callback self-sizing does not — GMRT.md → Known Incompatibilities), and
// `UIText`/`UIRichText` use it to self-size in onUpdate so a label reports a real width/height.
// Everything else deliberately does NOT:
//   fixed layout props   set ONCE at construction (the `style` arg below)
//   runtime movement     draw-time offset math through getLayoutPosition (scroll, drag, slider
//                        fill) — applies at draw AND hit-test with no reflow
//   show / hide          `child.enabled`, never `display`
//   change of SIZE       structural insertChild/removeChild + markDirty, which reflows reliably
//                        (UIAccordion); prefer `enabled` when the size is unchanged
// The offset/clip drivers work and migrating them to style mutation would be churn, so they stay.
// Related: this class's ~45 commented-out style setters stay commented — re-enabling them all
// would pass the 50-method ceiling (#15065); enable one on demand, minding the
// count. Property reference: `gm-cli manual read "Flex Panel Struct Members"`; Yoga docs
// (https://www.yogalayout.dev/docs/styling/) cover the semantics.
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
    /** @type {UIState} shared component blackboard — see the UIState typedef */
    this.state = {};
    this.dirty = true;
    // clip: children scissored to this rect. scrollY shifts descendants (not self) at draw+hit-test.
    // clipInsetRight reserves a right gutter (e.g. scrollbar) outside the clip.
    this.clip = false;
    this.scrollY = 0;
    this.clipInsetRight = 0;
    // dragX/Y offsets THIS element + subtree (vs scrollY which offsets only descendants).
    // Applied in getLayoutPosition — not via flexpanel mutation (bug #15065).
    this.dragX = 0;
    this.dragY = 0;
    // set in destroy(); guards against touching a deleted flexpanel node mid-traversal.
    this._destroyed = false;
  }

  /** @param {UIComponent} component @param {number} index @returns {UIElement} */
  addComponent(component, index = this.components.length) {
    this.components.splice(index, 0, component);
    return this;
  }

  /** @param {typeof UIComponent} ComponentClass @returns {UIComponent|undefined} */
  getComponent(ComponentClass) {
    return this.components.find((c) => c instanceof ComponentClass);
  }

  /** @param {typeof UIComponent} ComponentClass @returns {UIComponent[]} */
  getComponents(ComponentClass) {
    return this.components.filter((c) => c instanceof ComponentClass);
  }

  /** @param {UIComponent} component @returns {UIElement} */
  removeComponent(component) {
    const index = this.components.indexOf(component);
    if (index > -1) {
      if (component.onDestroy) component.onDestroy(this);
      this.components.splice(index, 1);
    }
    return this;
  }

  /** tear down subtree + components + flexpanel node. idempotent. */
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
   * update subtree then own components. `block` = pointer already captured upstream.
   * @param {boolean} block @returns {boolean} whether the pointer is now captured
   */
  update(block) {
    if (this._destroyed) return block; // already torn down (e.g. a closed modal's subtree)
    // clip: pointer must be inside the viewport or scrolled-away children stay clickable.
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
    // a descendant's onUpdate may destroy this element mid-traversal — stop early.
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

  /** draw components then children; children are scissored when `clip` is set. */
  draw() {
    if (this._destroyed) return;
    // components (panel bg, scrollbar) draw unclipped.
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

  // gpu_set_scissor clips children directly on the back buffer — crisp SDF text, correct blending,
  // no off-screen surface (see the gpu_set_scissor GMRT-Safe Idiom): save/restore
  // does NOT leak. Scissor coords are render-target PIXELS; convert GUI → pixels by k = target/gui.
  // Intersect with the current scissor so nested clips (gemsScroll within gemsScroll) both apply.
  _drawClipped() {
    const pos = this.getLayoutPosition();
    const w = Math.ceil(pos.width - this.clipInsetRight);
    const h = Math.ceil(pos.height);
    if (!(w > 0) || !(h > 0)) return; // unlaid-out (NaN) or zero-size

    // GUI lays out in design-resolution units; scissor needs render-target PIXELS (k = target/gui).
    // Use Display.clipW/H — NOT raw window/surface queries: those lag the back buffer on a resize
    // frame, so the old (bigger) size overflows a shrunk target → fatal "scissor not contained" error.
    // clipW/H is always ≤ the live back buffer (see Display).
    const gw = display_get_gui_width();
    const gh = display_get_gui_height();
    const tw = Display.clipW();
    const th = Display.clipH();
    const kx = gw > 0 ? tw / gw : 1;
    const ky = gh > 0 ? th / gh : 1;

    // clip rect in target pixels, clamped so an off-canvas or stale rect never exceeds the target.
    let x1 = Math.floor(pos.left) * kx;
    let y1 = Math.floor(pos.top) * ky;
    let x2 = x1 + w * kx;
    let y2 = y1 + h * ky;
    if (x1 < 0) x1 = 0;
    if (y1 < 0) y1 = 0;
    if (x2 > tw) x2 = tw;
    if (y2 > th) y2 = th;

    // intersect with any parent clip. gpu_get_scissor() returns {0,0,0,0} (not target dims) when
    // unset — only intersect when prev is a real positive sub-rect.
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
    // GMRT's gpu_set_scissor does NOT flush the vertex batch, so the last item under the clip
    // (a text run) stays pending and is only submitted by a later texture swap — by then the
    // scissor is restored to the full target and the item renders unclipped (scrolled-list bleed).
    // draw_flush is debug-flagged but is the only batch-flush primitive; runs once per clip per frame.
    // Must precede the scissor restore so the flush is still inside this clip rect.
    draw_flush();
    // replaying {0,0,0,0} (the unset sentinel) does NOT restore full drawing on GMRT — it clips
    // everything after to an empty rect. at top level, reset to the full target explicitly.
    if (nested) gpu_set_scissor(prev);
    else gpu_set_scissor(0, 0, tw, th);
  }

  /** @param {UIElement} element @param {number} index @returns {UIElement} */
  insertChild(element, index = this.children.length) {
    if (element.parent !== null) element.parent.removeChild(element);
    element.parent = this;
    this.children.splice(index, 0, element);
    flexpanel_node_insert_child(this.flexpanel, element.flexpanel, index);
    this.markDirty();
    return this;
  }

  /** @param {UIElement} element @returns {UIElement} the removed element */
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

  /** walk to root and flag dirty so the next update() recomputes layout. */
  markDirty() {
    let root = this;
    while (root.parent !== null) {
      root = root.parent;
    }
    root.dirty = true;
  }

  /** recompute flex layout from root; no-op on non-root nodes. */
  refresh() {
    if (!this.parent) {
      const w = display_get_gui_width();
      const h = display_get_gui_height();
      flexpanel_calculate_layout(this.flexpanel, w, h, this.direction);
    }
    this.dirty = false;
  }

  /**
   * flex-computed rect + own drag + all ancestor scroll/drag — single chokepoint for draw+hit-test.
   * @returns {{left:number, top:number, width:number, height:number}}
   */
  getLayoutPosition() {
    const pos = flexpanel_node_layout_get_position(this.flexpanel, false);
    // own drag offset moves this element and its subtree.
    if (this.dragX) pos.left += this.dragX;
    if (this.dragY) pos.top += this.dragY;
    // accumulate ancestor scroll/drag so this chokepoint applies them without flex mutation.
    let p = this.parent;
    while (p !== null) {
      if (p.scrollY) pos.top -= p.scrollY;
      if (p.dragX) pos.left += p.dragX;
      if (p.dragY) pos.top += p.dragY;
      p = p.parent;
    }
    return pos;
  }

  /** @param {number} x @param {number} y @returns {boolean} */
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

  // these setters stay commented: nothing calls them (kit uses draw-time offset math),
  // and enabling all ~45 would breach the 50-method ceiling (#15065).
  // enable individual ones on demand, watching the count.

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

  /** @returns {{value:number, unit:number}} style width (not computed layout width) */
  getWidth() {
    return flexpanel_node_style_get_width(this.flexpanel);
  }

  /** @returns {{value:number, unit:number}} style height (not computed layout height) */
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
