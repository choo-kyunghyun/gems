function UIInput(_style = {}, _input = {}, _panel = {}, _placeholder = {}) : UIElement(_style) constructor {
    self.value = _input[$ "value"] ?? "";
    self.caret_period = _input[$ "caret_period"] ?? 1;
    self.text_padding = _input[$ "text_padding"] ?? 8;
    self.caret_elapsed = 0;
    self.focus = false;
    self.clip = true;

    self.set_flex_direction(flexpanel_flex_direction.row);
    self.panel = new UIPanel({ width: "100%", height: "100%", position: "absolute" }, _panel);
    self.tooltip = undefined;
    self.text = new UIText({}, { text_ref: method(self, function() { return self.value; }), colour: #121212 });
    self.caret = new UIPanel({ width: _input[$ "caret_width"] ?? 4, height: "100%" }, { colour: _input[$ "caret_colour"] ?? _input[$ "caret_color"] ?? #121212, alpha: 0, rad: 0 });
    if (_input[$ "value"] != undefined && _input[$ "value"] != "") {
        _placeholder[$ "alpha"] = 0;
    }
    self.placeholder = new UIText({}, _placeholder);
    
    self.insert_child(self.panel);
    self.insert_child(self.text);
    self.insert_child(self.caret);
    self.insert_child(self.placeholder);

    static on_update = function() {
        var _mx = device_mouse_x_to_gui(0);
        var _my = device_mouse_y_to_gui(0);
        var _pressed = mouse_check_button_pressed(mb_left);
        if (_pressed) {
            if (self.position_meeting(_mx, _my)) {
                self.focus = true;
                keyboard_string = self.value;
            } else {
                self.focus = false;
            }
        }

        if (self.focus) {
            self.value = keyboard_string;
            self.caret_elapsed += Time.raw;
        } else {
            self.caret_elapsed = 0;
            self.caret.alpha = 0;
            if (self.text.get_margin(flexpanel_edge.left).value != 0) {
                self.text.set_margin(flexpanel_edge.left, 0, flexpanel_unit.point);
            }
            return;
        }

        var _pos = flexpanel_node_layout_get_position(self.flexpanel, false);
        var _text_pos = flexpanel_node_layout_get_position(self.text.flexpanel, false);
        var _caret_pos = flexpanel_node_layout_get_position(self.caret.flexpanel, false);
        var _overflow = _text_pos.width + _caret_pos.width + self.text_padding - _pos.width;

        self.text.set_margin(flexpanel_edge.left, -max(0, _overflow), flexpanel_unit.point);

        if (value == "") self.placeholder.alpha = 1;
        else self.placeholder.alpha = 0;

        if ((self.caret_elapsed % self.caret_period) < self.caret_period * 0.5) {
            self.caret.alpha = 1;
        } else {
            self.caret.alpha = 0;
        }

        if (_caret_pos.height != _text_pos.height) {
            self.caret.set_height(_text_pos.height, flexpanel_unit.point);
        }

        if (_overflow > 0 && !self.tooltip) {
            self.tooltip = new UITooltip({ width: "100%", height: "100%", position: "absolute" }, { text_ref: method(self, function() { return self.value; }) });
            self.insert_child(self.tooltip);
        } else if (_overflow <= 0 && self.tooltip) {
            self.remove_child(self.tooltip).destroy();
            self.tooltip = undefined;
        }
    }
}
