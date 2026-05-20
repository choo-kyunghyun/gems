// global.UIPanel = class UIPanel extends UIElement {}
function uiPanel(style = {}, panel = {}) {
    const element = new UIElement(style);
    element.color = panel.color ?? c_white;
    element.alpha = panel.alpha ?? 1;
    element.rad = panel.rad ?? 0;

    element.on_draw = function() {
        const alpha = draw_get_alpha();
        const pos = flexpanel_node_layout_get_position(this.flexpanel, false);
        draw_set_alpha(this.alpha);
        draw_roundrect_color_ext(pos.left, pos.top, pos.left + pos.width, pos.top + pos_height, this.rad, this.rad, this.color, this.color, false);
        draw_set_alpha(alpha);
    }

    return element;
}
