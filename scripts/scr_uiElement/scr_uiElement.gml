function UIElement(_style) constructor {
    self.flexpanel = flexpanel_create_node(_style);
    self.parent = undefined;
    self.children = [];
    self.dirty = false;
    
    static on_update = function() {}
    static on_draw = function() {}
    static on_destroy = function() {}
    
    static destroy = function() {
        self.on_destroy();
        array_foreach(self.children, function(_child) {
            _child.destroy();
        });
        if (self.parent) self.parent.remove_child(self);
        flexpanel_delete_node(self.flexpanel);
    }
    
    static insert_child = function(_element, _index = array_length(self.children)) {
        if (_element.parent) _element.parent.remove_child(_element);
        _element.parent = self;
        array_insert(self.children, _index, _element);
        flexpanel_node_insert_child(self.flexpanel, _element.flexpanel, _index);
        self.mark_dirty();
        return self;
    }
    
    static remove_child = function(_element) {
        var _index = array_get_index(self.children, _element);
        if (_index != -1) {
            array_delete(self.children, _index, 1);
            flexpanel_node_remove_child(self.flexpanel, _element.flexpanel);
            _element.parent = undefined;
            self.mark_dirty();
        }
        return _element;
    }
    
    static mark_dirty = function() {
        var _root = self;
        while (_root.parent) _root = _root.parent;
        _root.dirty = true;
    }
    
    static update = function() {
        if (self.dirty) flexpanel_calculate_layout(self.flexpanel, display_get_gui_width(), display_get_gui_height(), flexpanel_direction.LTR);
        self.on_update();
        array_foreach(self.children, function(_child) {
            _child.update();
        });
    }
    
    static draw = function() {
        self.on_draw();
        array_foreach(self.children, function(_child) {
            _child.draw();
        });
    }
    
    static position_meeting = function(_x, _y) {
        var _pos = flexpanel_node_layout_get_position(self.flexpanel, false);
        return point_in_rectangle(_x, _y, _pos.left, _pos.top, _pos.left + _pos.width, _pos.top + _pos.height);
    }
    
    static set_width = function(_width, _unit) {
        flexpanel_node_style_set_width(self.flexpanel, _width, _unit);
        self.mark_dirty();
        return self;
    }
    
    static set_height = function(_height, _unit) {
        flexpanel_node_style_set_height(self.flexpanel, _height, _unit);
        self.mark_dirty();
        return self;
    }
    
    static set_min_width = function(_value, _unit) {
        flexpanel_node_style_set_min_width(self.flexpanel, _value, _unit);
        self.mark_dirty();
        return self;
    }
    
    static set_max_width = function(_value, _unit) {
        flexpanel_node_style_set_max_width(self.flexpanel, _value, _unit);
        self.mark_dirty();
        return self;
    }
    
    static set_min_height = function(_value, _unit) {
        flexpanel_node_style_set_min_height(self.flexpanel, _value, _unit);
        self.mark_dirty();
        return self;
    }
    
    static set_max_height = function(_value, _unit) {
        flexpanel_node_style_set_max_height(self.flexpanel, _value, _unit);
        self.mark_dirty();
        return self;
    }
    
    static set_aspect_ratio = function(_value) {
        flexpanel_node_style_set_aspect_ratio(self.flexpanel, _value);
        self.mark_dirty();
        return self;
    }
    
    static set_position = function(_edge, _value, _unit) {
        flexpanel_node_style_set_position(self.flexpanel, _edge, _value, _unit);
        self.mark_dirty();
        return self;
    }
    
    static set_position_type = function(_value) {
        flexpanel_node_style_set_position_type(self.flexpanel, _value);
        self.mark_dirty();
        return self;
    }
    
    static set_margin = function(_edge, _size, _unit = flexpanel_unit.point) {
        flexpanel_node_style_set_margin(self.flexpanel, _edge, _size, _unit);
        self.mark_dirty();
        return self;
    }
    
    static set_padding = function(_edge, _size, _unit = flexpanel_unit.point) {
        flexpanel_node_style_set_padding(self.flexpanel, _edge, _size, _unit);
        self.mark_dirty();
        return self;
    }
    
    static set_border = function(_edge, _size) {
        flexpanel_node_style_set_border(self.flexpanel, _edge, _size);
        self.mark_dirty();
        return self;
    }
    
    static set_gap = function(_gutter, _size) {
        flexpanel_node_style_set_gap(self.flexpanel, _gutter, _size);
        self.mark_dirty();
        return self;
    }
    
    static set_direction = function(_direction) {
        flexpanel_node_style_set_direction(self.flexpanel, _direction);
        self.mark_dirty();
        return self;
    }
    
    static set_flex_direction = function(_direction) {
        flexpanel_node_style_set_flex_direction(self.flexpanel, _direction);
        self.mark_dirty();
        return self;
    }
    
    static set_flex_wrap = function(_align) {
        flexpanel_node_style_set_flex_wrap(self.flexpanel, _align);
        self.mark_dirty();
        return self;
    }
    
    static set_basis = function(_value, _unit) {
        flexpanel_node_style_set_flex_basis(self.flexpanel, _value, _unit);
        self.mark_dirty();
        return self;
    }
    
    static set_grow = function(_grow) {
        flexpanel_node_style_set_flex_grow(self.flexpanel, _grow);
        self.mark_dirty();
        return self;
    }
    
    static set_shrink = function(_shrink) {
        flexpanel_node_style_set_flex_shrink(self.flexpanel, _shrink);
        self.mark_dirty();
        return self;
    }
    
    static set_flex = function(_flex) {
        flexpanel_node_style_set_flex(self.flexpanel, _flex);
        self.mark_dirty();
        return self;
    }
    
    static set_justify_content = function(_justify) {
        flexpanel_node_style_set_justify_content(self.flexpanel, _justify);
        self.mark_dirty();
        return self;
    }
    
    static set_align_items = function(_align) {
        flexpanel_node_style_set_align_items(self.flexpanel, _align);
        self.mark_dirty();
        return self;
    }
    
    static set_align_self = function(_align) {
        flexpanel_node_style_set_align_self(self.flexpanel, _align);
        self.mark_dirty();
        return self;
    }
    
    static set_align_content = function(_align) {
        flexpanel_node_style_set_align_content(self.flexpanel, _align);
        self.mark_dirty();
        return self;
    }
    
    static set_display = function(_display) {
        flexpanel_node_style_set_display(self.flexpanel, _display);
        self.mark_dirty();
        return self;
    }
    
    static get_width = function() {
        return flexpanel_node_style_get_width(self.flexpanel);
    }
    
    static get_height = function() {
        return flexpanel_node_style_get_height(self.flexpanel);
    }
    
    static get_min_width = function() {
        return flexpanel_node_style_get_min_width(self.flexpanel);
    }
    
    static get_max_width = function() {
        return flexpanel_node_style_get_max_width(self.flexpanel);
    }
    
    static get_min_height = function() {
        return flexpanel_node_style_get_min_height(self.flexpanel);
    }
    
    static get_max_height = function() {
        return flexpanel_node_style_get_max_height(self.flexpanel);
    }
    
    static get_aspect_ratio = function() {
        return flexpanel_node_style_get_aspect_ratio(self.flexpanel);
    }
    
    static get_position = function(_edge) {
        return flexpanel_node_style_get_position(self.flexpanel, _edge);
    }
    
    static get_position_type = function() {
        return flexpanel_node_style_get_position_type(self.flexpanel);
    }
    
    static get_margin = function(_edge) {
        return flexpanel_node_style_get_margin(self.flexpanel, _edge);
    }
    
    static get_padding = function(_edge) {
        return flexpanel_node_style_get_padding(self.flexpanel, _edge);
    }
    
    static get_border = function(_edge) {
        return flexpanel_node_style_get_border(self.flexpanel, _edge);
    }
    
    static get_gap = function(_gutter) {
        return flexpanel_node_style_get_gap(self.flexpanel, _gutter);
    }
    
    static get_direction = function() {
        return flexpanel_node_style_get_direction(self.flexpanel);
    }
    
    static get_flex_direction = function() {
        return flexpanel_node_style_get_flex_direction(self.flexpanel);
    }
    
    static get_flex_wrap = function() {
        return flexpanel_node_style_get_flex_wrap(self.flexpanel);
    }
    
    static get_flex_basis = function() {
        return flexpanel_node_style_get_flex_basis(self.flexpanel);
    }
    
    static get_flex_grow = function() {
        return flexpanel_node_style_get_flex_grow(self.flexpanel);
    }
    
    static get_flex_shrink = function() {
        return flexpanel_node_style_get_flex_shrink(self.flexpanel);
    }
    
    static get_flex = function() {
        return flexpanel_node_style_get_flex(self.flexpanel);
    }
    
    static get_justify_content = function() {
        return flexpanel_node_style_get_justify_content(self.flexpanel);
    }
    
    static get_align_items = function() {
        return flexpanel_node_style_get_align_items(self.flexpanel);
    }
    
    static get_align_self = function() {
        return flexpanel_node_style_get_align_self(self.flexpanel);
    }
    
    static get_align_content = function() {
        return flexpanel_node_style_get_align_content(self.flexpanel);
    }
    
    static get_display = function() {
        return flexpanel_node_style_get_display(self.flexpanel);
    }
}
