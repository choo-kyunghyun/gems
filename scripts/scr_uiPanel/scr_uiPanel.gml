function UIPanel(_style = {}, _panel = {}) : UIElement(_style) constructor {
    self.color = _panel[$ "color"] ?? c_white;
    self.alpha = _panel[$ "alpha"] ?? 1;
    self.rad = _panel[$ "rad"] ?? 16;
    
    static on_draw = function() {
        var _alpha = draw_get_alpha();
        var _pos = flexpanel_node_layout_get_position(self.flexpanel, false);
        draw_set_alpha(self.alpha);
        draw_roundrect_color_ext(_pos.left, _pos.top, _pos.left + _pos.width, _pos.top + _pos.height, self.rad, self.rad, self.color, self.color, false);
        draw_set_alpha(_alpha);
    }
}
