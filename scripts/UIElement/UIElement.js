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
    this._clipSurf = -1;
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
    if (this._clipSurf !== -1 && surface_exists(this._clipSurf)) {
      surface_free(this._clipSurf);
      this._clipSurf = -1;
    }
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

  // Render children into an off-screen surface sized to this element (minus any
  // scrollbar gutter) and blit it, so scrolled-out content is clipped. We use a
  // surface, NOT gpu_set_scissor — the latter's global clip state is unreliable on
  // GMRT 0.19 and leaks onto later draws (see UIInput). A world-matrix translate
  // maps the children's gui-absolute coords (already scroll-offset by
  // getLayoutPosition) into the surface's local space.
  _drawClipped() {
    const pos = this.getLayoutPosition();
    const w = Math.ceil(pos.width - this.clipInsetRight);
    const h = Math.ceil(pos.height);
    if (!(w > 0) || !(h > 0)) return; // unlaid-out (NaN) or zero-size

    // GameMaker scales the whole GUI layer to the window, so a DIRECT draw_text resolves SDF
    // glyphs at the window's pixel density (crisp at any uiScale / monitor). A clip surface
    // is created in GUI pixels, though — text baked into it is capped at GUI/design resolution
    // and then upscaled with the layer, so clipped text reads softer than direct text on a
    // hi-DPI / fullscreen window. Render the surface at the OUTPUT density instead: size it
    // w*k x h*k, scale children up by k, and blit back at 1/k. The blit is itself a GUI-space
    // draw that GM scales by k to the back buffer, so the hi-res texture lands ~1:1 on screen.
    // k=1 (GUI == window, e.g. native 1080p) reduces to the old 1:1 path with no extra cost;
    // capped at 3 to bound surface memory (k^2) on very high-res displays.
    const gw = display_get_gui_width();
    const k = Math.max(1, Math.min(3, gw > 0 ? window_get_width() / gw : 1));
    const sw = Math.ceil(w * k);
    const sh = Math.ceil(h * k);

    if (this._clipSurf !== -1 && !surface_exists(this._clipSurf)) {
      this._clipSurf = -1; // a volatile surface was reclaimed by the system
    }
    if (
      this._clipSurf === -1 ||
      surface_get_width(this._clipSurf) !== sw ||
      surface_get_height(this._clipSurf) !== sh
    ) {
      if (this._clipSurf !== -1) surface_free(this._clipSurf);
      this._clipSurf = surface_create(sw, sh);
    }

    // Pixel-snap the GUI-space origin (the floored origin also keeps children integer-aligned
    // within the surface — see UIText's anchor snap). The matrix maps a child's gui-absolute
    // coord into hi-res surface space: surfaceCoord = (guiCoord - origin) * k, i.e. scale by k
    // then translate by -origin*k.
    const ox = Math.floor(pos.left);
    const oy = Math.floor(pos.top);

    // Render into a transparent surface then composite it back WITHOUT the edge halos the
    // default blend mode causes: blending AA text onto transparent black and then again onto
    // the scene double-darkens the fringe. The fix is straight-alpha-in / premultiplied-out —
    // draw into the surface with separate-alpha blending so its alpha is true coverage, then
    // blit it with (bm_one, bm_inv_src_alpha) so the result matches a direct draw_text.
    const prevBlend = gpu_get_blendmode();
    surface_set_target(this._clipSurf);
    draw_clear_alpha(c_black, 0); // start transparent
    gpu_set_blendmode_ext_sepalpha(
      bm_src_alpha,
      bm_inv_src_alpha,
      bm_inv_dest_alpha,
      bm_one,
    );
    matrix_set(matrix_world, matrix_build(-ox * k, -oy * k, 0, 0, 0, 0, k, k, 1));
    for (const child of this.children) {
      if (child.enabled) child.draw();
    }
    matrix_set(matrix_world, matrix_build_identity());
    surface_reset_target();

    // Composite the hi-res surface back into GUI space at 1/k so it occupies exactly w x h GUI
    // units — drawing ~1:1 to window pixels (see the density note above). Premultiplied blend.
    gpu_set_blendmode_ext(bm_one, bm_inv_src_alpha);
    draw_surface_ext(this._clipSurf, ox, oy, 1 / k, 1 / k, 0, c_white, 1);
    gpu_set_blendmode(prevBlend);
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
