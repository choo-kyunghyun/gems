// TODO: Clipboard, indexes, drag, and initial caret height
function UIInput(_style = {}, _input = {}, _panel = {}, _placeholder = {}) : UIElement(_style) constructor {
    // Value
    self.value = _input[$ "value"] ?? "";
    self.on_change = method(self, _input[$ "on_change"] ?? noop);

    // Status
    self.focus = false;
    self.clip = true;

    // Indexes
    self.caret_index = 0;
    self.selection_start = 0;
    self.selection_end = 0;

    // Layout
    self.text_offset = 0;
    self.set_flex_direction(flexpanel_flex_direction.row);
    self.text_padding = _input[$ "text_padding"] ?? 8;
    
    // Panel
    self.panel = new UIPanel({ width: "100%", height: "100%", position: "absolute" }, _panel);
    self.insert_child(self.panel);

    // Tooltip
    self.tooltip = new UITooltip({ width: "100%", height: "100%", position: "absolute" }, { text_ref: method(self, function() { return self.value; }) });
    self.insert_child(self.tooltip);
    
    // Text
    self.text = new UIText({}, { text_ref: method(self, function() { return self.value; }), color: #121212 });
    self.insert_child(self.text);

    // Caret
    self.caret = new UIPanel({ width: _input[$ "caret_width"] ?? 4, height: "100%" }, { color: _input[$ "caret_color"] ?? #121212, alpha: 0, rad: 0 });
    if (_input[$ "value"] != undefined && _input[$ "value"] != "") {
        _placeholder[$ "alpha"] = 0;
    }
    self.insert_child(self.caret);
    self.caret_period = _input[$ "caret_period"] ?? 1;
    self.caret_elapsed = 0;

    // Placeholder
    self.placeholder = new UIText({}, _placeholder);
    self.insert_child(self.placeholder);

    static on_update = function() {
        // Focus
        var _mx = device_mouse_x_to_gui(0);
        var _my = device_mouse_y_to_gui(0);
        var _hover = self.position_meeting(_mx, _my);
        var _click = mouse_check_button_pressed(mb_left);
        var _focus_previous = self.focus;
        var _value_previous = self.value;

        if (_click) self.focus = _hover;

        // Input
        if (self.focus) {
            if (!_focus_previous) keyboard_string = self.value;
            self.value = keyboard_string;
            self.caret_elapsed += Time.raw;
        } else {
            self.caret_elapsed = 0;
            self.caret.alpha = 0;
            if (self.text.get_margin(flexpanel_edge.left).value != 0) {
                self.text.set_margin(flexpanel_edge.left, 0, flexpanel_unit.point);
            }
        }

        // Value
        if (self.value == _value_previous) return;
        self.on_change();

        // Layout
        var _pos = flexpanel_node_layout_get_position(self.flexpanel, false);
        var _text_pos = flexpanel_node_layout_get_position(self.text.flexpanel, false);
        var _caret_pos = flexpanel_node_layout_get_position(self.caret.flexpanel, false);
        var _overflow = _text_pos.width + _caret_pos.width + self.text_padding - _pos.width;

        // Tooltip
        if (_overflow > 0) {
            self.tooltip.text_ref = method(self, function() { return self.value; });
        } else {
            self.tooltip.text_ref = function() { return ""; };
        }
        
        // Text
        self.text.set_margin(flexpanel_edge.left, -max(0, _overflow), flexpanel_unit.point);

        // Caret
        self.caret.alpah = ((self.caret_elapsed % self.caret_period) < self.caret_period * 0.5) ? 1 : 0;
        if (_caret_pos.height != _text_pos.height) {
            self.caret.set_height(_text_pos.height, flexpanel_unit.point);
        }
        
        // Placeholder
        if (self.value == "") self.placeholder.alpha = 1;
        else self.placeholder.alpha = 0;
    }
}
