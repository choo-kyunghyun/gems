function UIInput(_style = {}, _input = {}, _panel = {}, _text = {}, _placeholder = {}) : UIPanel(_style, _panel) constructor {
    // Value
    self.value = _input[$ "value"] ?? "";
    self.on_change = method(self, _input[$ "on_change"] ?? noop);

    // Status
    self.focus = false;
    self.clip = true;

    // TODO: Clipboard, index, drag, and initial caret height
    self.caret_index = 0;
    self.selection_start = 0;
    self.selection_end = 0;

    // Layout
    self.text_offset = 0;
    self.set_flex_direction(flexpanel_flex_direction.row);

    // Tooltip
    self.tooltip = new UITooltip({ width: "100%", height: "100%", position: "absolute" }, { text_ref: method(self, function() { return self.value; }) });
    self.insert_child(self.tooltip);
    
    // Text
    self.text = new UIText({}, _text);
    self.text.text_ref = method(self, function() { return self.value; });
    self.insert_child(self.text);

    // Caret
    self.caret = new UIPanel({ width: _input[$ "caret_width"] ?? 3, height: "100%" }, { color: _input[$ "caret_color"] ?? #121212, alpha: 0, rad: 0 });
    self.insert_child(self.caret);
    self.caret_period = _input[$ "caret_period"] ?? 1;
    self.caret_elapsed = 0;

    // Placeholder
    self.placeholder = new UIText({}, _placeholder);
    self.insert_child(self.placeholder);

    static backspace = function() {
        if (self.caret_index < 1) return;
        if (keyboard_check_pressed(vk_backspace)) {
            self.value = string_delete(self.value, self.caret_index, 1);
        }
    }

    static copy_value = function() {
        if (keyboard_check(vk_control) && keyboard_check_pressed(ord("C"))) {
            clipboard_set_text(self.value);
        }
    }

    static paste_value = function() {
        if (keyboard_check(vk_control) && keyboard_check_pressed(ord("V"))) {
            keyboard_string += clipboard_get_text();
        }
    }

    static on_update = function() {
        var _mx = device_mouse_x_to_gui(0);
        var _my = device_mouse_y_to_gui(0);
        var _hover = self.position_meeting(_mx, _my);
        var _click = mouse_check_button_pressed(mb_left);

        if (_click) self.focus = _hover;

        if (self.focus) {
            var _focus_previous = self.focus;
            var _value_previous = self.value;
            var _pos = flexpanel_node_layout_get_position(self.flexpanel, false);
            var _text_pos = flexpanel_node_layout_get_position(self.text.flexpanel, false);
            var _caret_pos = flexpanel_node_layout_get_position(self.caret.flexpanel, false);
            var _overflow = _text_pos.width + _caret_pos.width + _pos.paddingRight + _pos.paddingLeft - _pos.width;
            if (!_focus_previous) keyboard_string = self.value;
            self.paste_value();
            self.value = keyboard_string;
            self.copy_value();
            if (self.value != _value_previous) {
                self.on_change();
                
                if (self.value != "" && _caret_pos.height != _text_pos.height) {
                    self.caret.set_height(_text_pos.height, flexpanel_unit.point);
                }

                if (_overflow > 0) {
                    self.tooltip.text_ref = method(self, function() { return self.value; });
                } else {
                    self.tooltip.text_ref = function() { return ""; };
                }
            }
            self.text.set_margin(flexpanel_edge.left, -max(0, _overflow), flexpanel_unit.point);
            self.caret_elapsed += Time.raw;
            self.caret.alpha = ((self.caret_elapsed % self.caret_period) < self.caret_period * 0.5) ? 1 : 0;
            self.placeholder.alpha = 0;
        } else {
            self.caret_elapsed = 0;
            self.caret.alpha = 0;
            if (self.text.get_margin(flexpanel_edge.left).value != 0) {
                self.text.set_margin(flexpanel_edge.left, 0, flexpanel_unit.point);
            }
            self.placeholder.alpha = (self.value == "") ? 1 : 0;
        }
    }
}
