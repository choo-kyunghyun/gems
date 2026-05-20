// global.UISlider = class UISlider extends UIElement {}
function uiSlider(
  style = {},
  slider = {},
  track = {},
  fill = {},
  thumb = {},
  trigger = {},
) {
  const elem = new UIElement(style);
  elem.min = slider.min ?? 0;
  elem.max = slider.max ?? 1;
  elem.value = slider.value ?? elem.min;
  elem.on_change = slider.on_change ?? noop;
  elem.read_only = slider.read_only ?? false;
  elem.step = slider.step;
  elem.values = slider.values;

  elem.track = uiPanel(
    { width: "100%", height: "100%", position: "absolute" },
    track,
  );
  elem.fill = uiPanel({ height: "100%", position: "absolute" }, fill);
  elem.thumb = uiPanel(
    { aspectRatio: 1, height: "140%", position: "absolute" },
    thumb,
  );
  elem.trigger = uiTrigger(
    { width: "100%", height: "100%", position: "absolute" },
    trigger,
  );

  elem.insert_child(elem.track);
  elem.insert_child(elem.fill);
  elem.insert_child(elem.thumb);
  elem.insert_child(elem.trigger);

  elem.apply_snap = function (value) {
    if (Array.isArray(this.values) && this.values.length > 0) {
      const n = this.values.length;
      let best = 0;
      let best_d = Math.abs(this.values[0] - value);
      for (let i = 1; i < n; i++) {
        const d = Math.abs(this.values[i] - value);
        if (d < best_d) {
          best_d = d;
          best = i;
        }
      }
      return this.values[best];
    }

    if (typeof this.step === "number" && this.step > 0) {
      return Math.round(value / this.step) * this.step;
    }

    return value;
  };

  elem.set_value = function (value) {
    value = this.apply_snap(value);
    this.value = clamp(value, this.min, this.max);
    this.on_change();
    return this;
  };

  this.on_update = function () {
    const pos = flexpanel_node_layout_get_position(this.flexpanel, false);
    if (pos.width <= 0) return;

    let inner_h = max(0, pos.height - pos.paddingTop - pos.paddingBottom);
    let track_top = pos.paddingTop;
    this.track.set_height(inner_h, flexpanel_unit.point);
    this.fill.set_height(inner_h, flexpanel_unit.point);
    this.track.set_position(
      flexpanel_edge.top,
      track_top,
      flexpanel_unit.point,
    );
    this.fill.set_position(flexpanel_edge.top, track_top, flexpanel_unit.point);
    this.thumb.set_height(inner_h * 1.4, flexpanel_unit.point);

    let _t =
      this.max === this.min
        ? 0
        : (this.value - this.min) / (this.max - this.min);
    let _x = _t * pos.width;
    this.fill.set_width(_x, flexpanel_unit.point);
    this.thumb.set_position(
      flexpanel_edge.left,
      _x - inner_h * 0.2,
      flexpanel_unit.point,
    );
    this.thumb.set_position(
      flexpanel_edge.top,
      track_top - inner_h * 0.2,
      flexpanel_unit.point,
    );

    if (!this.read_only && this.trigger.hold) {
      let _mx = device_mouse_x_to_gui(0);
      let _clamped = clamp(_mx - pos.left, 0, pos.width);
      let _nv = this.min + (_clamped / pos.width) * (this.max - this.min);
      if (_nv != this.value) this.set_value(_nv);
    }
  };

  return elem;
}
