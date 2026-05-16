function UISlider(_style = {}, _slider = {}, _track = {}, _fill = {}, _thumb = {}, _trigger = {}) : UIElement(_style) constructor {
    self.min = _slider[$ "min"] ?? 0;
    self.max = _slider[$ "max"] ?? 1;
    self.value = clamp(_slider[$ "value"] ?? self.min, self.min, self.max);
    self.on_change = method(self, _slider[$ "on_change"] ?? noop);
    self.read_only = _slider[$ "read_only"] ?? false;
    self.step = _slider[$ "step"];
    self.values = _slider[$ "values"];

    self.track = new UIPanel({ width: "100%", height: "100%", position: "absolute" }, _track);
    self.fill = new UIPanel({ height: "100%", position: "absolute" }, _fill);
    self.thumb = new UIPanel({ aspectRatio: 1, height: "140%", position: "absolute" }, _thumb);
    self.trigger = new UITrigger({ width: "100%", height: "100%", position: "absolute" }, _trigger);

    self.insert_child(self.track);
    self.insert_child(self.fill);
    self.insert_child(self.thumb);
    self.insert_child(self.trigger);

    static _apply_snap = function(_v) {
        if (is_array(self.values) && array_length(self.values) > 0) {
            var _n = array_length(self.values);
            var _best = 0;
            var _best_d = abs(self.values[0] - _v);
            for (var _i = 1; _i < _n; _i++) {
                var _d = abs(self.values[_i] - _v);
                if (_d < _best_d) { _best_d = _d; _best = _i; }
            }
            return self.values[_best];
        }
        if (!is_undefined(self.step) && self.step > 0) {
            return round(_v / self.step) * self.step;
        }
        return _v;
    }

    static set_value = function(_v) {
        _v = self._apply_snap(_v);
        self.value = clamp(_v, self.min, self.max);
        self.on_change();
        return self;
    }

    static on_update = function() {
        var _pos = flexpanel_node_layout_get_position(self.flexpanel, false);
        if (_pos.width <= 0) return;

        var _inner_h = max(0, _pos.height - _pos.paddingTop - _pos.paddingBottom);
        var _track_top = _pos.paddingTop;
        self.track.set_height(_inner_h, flexpanel_unit.point);
        self.fill.set_height(_inner_h, flexpanel_unit.point);
        self.track.set_position(flexpanel_edge.top, _track_top, flexpanel_unit.point);
        self.fill.set_position(flexpanel_edge.top, _track_top, flexpanel_unit.point);

        self.thumb.set_height(_inner_h * 1.4, flexpanel_unit.point);

        var _t = (self.max == self.min) ? 0 : (self.value - self.min) / (self.max - self.min);
        var _x = _t * _pos.width;
        self.fill.set_width(_x, flexpanel_unit.point);
        self.thumb.set_position(flexpanel_edge.left, _x - (_inner_h * 0.2), flexpanel_unit.point);
        self.thumb.set_position(flexpanel_edge.top, _track_top - (_inner_h * 0.2), flexpanel_unit.point);

        if (!self.read_only && self.trigger.hold) {
            var _mx = device_mouse_x_to_gui(0);
            var _clamped = clamp(_mx - _pos.left, 0, _pos.width);
            var _nv = self.min + (_clamped / _pos.width) * (self.max - self.min);
            if (_nv != self.value) self.set_value(_nv);
        }
    }
}
