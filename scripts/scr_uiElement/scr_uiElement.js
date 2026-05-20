global.UIElement = class UIElement {
  constructor(style = {}) {
    this.enabled = true;
    this.flexpanel = flexpanel_create_node(style);
    this.direction = flexpanel_direction.LTR;
    this.parent = undefined;
    this.children = [];
    this.dirty = true;
    this.clip = false;
  }

  on_update(block) {}
  on_draw() {}
  on_destroy() {}

  destroy() {
    this.on_destroy();
    [...this.children].reverse().forEach((element) => {
      element.destroy();
    });
    if (this.parent !== undefined) this.parent.remove_child(this);
    flexpanel_delete_node(this.flexpanel);
  }

  insert_child(element, index = this.children.length) {
    if (element.parent !== undefined) element.parent.remove_child(element);
    element.parent = this;
    this.children.splice(index, 0, element);
    flexpanel_node_insert_child(this.flexpanel, element.flexpanel, index);
    this.mark_dirty();
    return this;
  }

  remove_child(element) {
    const index = this.children.indexOf(element);
    if (index > -1) {
      this.children.splice(index, 1);
      flexpanel_node_remove_child(this.flexpanel, element.flexpanel);
      element.parent = undefined;
      this.mark_dirty();
    }
    return element;
  }

  mark_dirty() {
    let root = this;
    while (root.parent !== undefined) {
      root = root.parent;
    }
    root.dirty = true;
  }

  refresh_layout() {
    if (!this.dirty) return;
    if (!this.parent) {
      const w = display_get_gui_width();
      const h = display_get_gui_height();
      flexpanel_calculate_layout(this.flexpanel, w, h, this.direction);
    }
    this.dirty = false;
  }

  update(block) {
    [...this.children].reverse().forEach((child) => {
      if (child.enabled) {
        block = child.update(block) || block;
      }
    });
    const response = this.on_update(block);
    if (typeof response === "boolean" && response === true) block = true;
    this.refresh_layout();
    return block;
  }

  draw() {
    const scissor = gpu_get_scissor();
    if (this.clip) {
      const pos = flexpanel_node_layout_get_position(this.flexpanel, false);
      gpu_set_scissor(pos.left, pos.top, pos.width, pos.height);
    }
    this.on_draw();
    for (const child of this.children) {
      if (child.enabled) child.draw();
    }
    if (this.clip) gpu_set_scissor(scissor);
  }

  position_meeting(x, y) {
    const pos = flexpanel_node_layout_get_position(this.flexpanel, false);
    return point_in_rectangle(
      x,
      y,
      pos.left,
      pos.top,
      pos.left + pos.width,
      pos.top + pos.height,
    );
  }

  set_width(width, unit) {
    flexpanel_node_style_set_width(this.flexpanel, width, unit);
    this.mark_dirty();
    return this;
  }

  set_height(height, unit) {
    flexpanel_node_style_set_height(this.flexpanel, height, unit);
    this.mark_dirty();
    return this;
  }

  set_min_width(value, unit) {
    flexpanel_node_style_set_min_width(this.flexpanel, value, unit);
    this.mark_dirty();
    return this;
  }

  set_max_width(value, unit) {
    flexpanel_node_style_set_max_width(this.flexpanel, value, unit);
    this.mark_dirty();
    return this;
  }

  set_min_height(value, unit) {
    flexpanel_node_style_set_min_height(this.flexpanel, value, unit);
    this.mark_dirty();
    return this;
  }

  set_max_height(value, unit) {
    flexpanel_node_style_set_max_height(this.flexpanel, value, unit);
    this.mark_dirty();
    return this;
  }

  set_aspect_ratio(value) {
    flexpanel_node_style_set_aspect_ratio(this.flexpanel, value);
    this.mark_dirty();
    return this;
  }

  set_position(edge, value, unit) {
    flexpanel_node_style_set_position(this.flexpanel, edge, value, unit);
    this.mark_dirty();
    return this;
  }

  set_position_type(value) {
    flexpanel_node_style_set_position_type(this.flexpanel, value);
    this.mark_dirty();
    return this;
  }

  set_margin(edge, size, unit = flexpanel_unit.point) {
    flexpanel_node_style_set_margin(this.flexpanel, edge, size, unit);
    this.mark_dirty();
    return this;
  }

  set_padding(edge, size, unit = flexpanel_unit.point) {
    flexpanel_node_style_set_padding(this.flexpanel, edge, size, unit);
    this.mark_dirty();
    return this;
  }

  set_border(edge, size) {
    flexpanel_node_style_set_border(this.flexpanel, edge, size);
    this.mark_dirty();
    return this;
  }

  set_gap(gutter, size) {
    flexpanel_node_style_set_gap(this.flexpanel, gutter, size);
    this.mark_dirty();
    return this;
  }

  set_direction(direction) {
    flexpanel_node_style_set_direction(this.flexpanel, direction);
    this.mark_dirty();
    return this;
  }

  set_flex_direction(direction) {
    flexpanel_node_style_set_flex_direction(this.flexpanel, direction);
    this.mark_dirty();
    return this;
  }

  set_flex_wrap(align) {
    flexpanel_node_style_set_flex_wrap(this.flexpanel, align);
    this.mark_dirty();
    return this;
  }

  set_basis(value, unit) {
    flexpanel_node_style_set_flex_basis(this.flexpanel, value, unit);
    this.mark_dirty();
    return this;
  }

  set_grow(grow) {
    flexpanel_node_style_set_flex_grow(this.flexpanel, grow);
    this.mark_dirty();
    return this;
  }

  set_shrink(shrink) {
    flexpanel_node_style_set_flex_shrink(this.flexpanel, shrink);
    this.mark_dirty();
    return this;
  }

  set_flex(flex) {
    flexpanel_node_style_set_flex(this.flexpanel, flex);
    this.mark_dirty();
    return this;
  }

  set_justify_content(justify) {
    flexpanel_node_style_set_justify_content(this.flexpanel, justify);
    this.mark_dirty();
    return this;
  }

  set_align_items(align) {
    flexpanel_node_style_set_align_items(this.flexpanel, align);
    this.mark_dirty();
    return this;
  }

  set_align_self(align) {
    flexpanel_node_style_set_align_self(this.flexpanel, align);
    this.mark_dirty();
    return this;
  }

  set_align_content(align) {
    flexpanel_node_style_set_align_content(this.flexpanel, align);
    this.mark_dirty();
    return this;
  }

  set_display(display) {
    flexpanel_node_style_set_display(this.flexpanel, display);
    this.mark_dirty();
    return this;
  }

  get_width() {
    return flexpanel_node_style_get_width(this.flexpanel);
  }

  get_height() {
    return flexpanel_node_style_get_height(this.flexpanel);
  }

  get_min_width() {
    return flexpanel_node_style_get_min_width(this.flexpanel);
  }

  get_max_width() {
    return flexpanel_node_style_get_max_width(this.flexpanel);
  }

  get_min_height() {
    return flexpanel_node_style_get_min_height(this.flexpanel);
  }

  get_max_height() {
    return flexpanel_node_style_get_max_height(this.flexpanel);
  }

  get_aspect_ratio() {
    return flexpanel_node_style_get_aspect_ratio(this.flexpanel);
  }

  get_position(edge) {
    return flexpanel_node_style_get_position(this.flexpanel, edge);
  }

  get_position_type() {
    return flexpanel_node_style_get_position_type(this.flexpanel);
  }

  get_margin(edge) {
    return flexpanel_node_style_get_margin(this.flexpanel, edge);
  }

  get_padding(edge) {
    return flexpanel_node_style_get_padding(this.flexpanel, edge);
  }

  get_border(edge) {
    return flexpanel_node_style_get_border(this.flexpanel, edge);
  }

  get_gap(gutter) {
    return flexpanel_node_style_get_gap(this.flexpanel, gutter);
  }

  get_direction() {
    return flexpanel_node_style_get_direction(this.flexpanel);
  }

  get_flex_direction() {
    return flexpanel_node_style_get_flex_direction(this.flexpanel);
  }

  get_flex_wrap() {
    return flexpanel_node_style_get_flex_wrap(this.flexpanel);
  }

  get_flex_basis() {
    return flexpanel_node_style_get_flex_basis(this.flexpanel);
  }

  get_flex_grow() {
    return flexpanel_node_style_get_flex_grow(this.flexpanel);
  }

  get_flex_shrink() {
    return flexpanel_node_style_get_flex_shrink(this.flexpanel);
  }

  get_flex() {
    return flexpanel_node_style_get_flex(this.flexpanel);
  }

  get_justify_content() {
    return flexpanel_node_style_get_justify_content(this.flexpanel);
  }

  get_align_items() {
    return flexpanel_node_style_get_align_items(this.flexpanel);
  }

  get_align_self() {
    return flexpanel_node_style_get_align_self(this.flexpanel);
  }

  get_align_content() {
    return flexpanel_node_style_get_align_content(this.flexpanel);
  }

  get_display() {
    return flexpanel_node_style_get_display(this.flexpanel);
  }
};
