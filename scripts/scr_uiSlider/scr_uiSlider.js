class SliderComponent {
  constructor(slider, children) {
    this.min = slider.min ?? 0;
    this.max = slider.max ?? 1;
    this.value = slider.value ?? this.min;
    this.on_change = slider.on_change ?? noop;
    this.read_only = slider.read_only ?? false;
    this.step = slider.step;
    this.values = slider.values;
    this.track = children.track;
    this.fill = children.fill;
    this.thumb = children.thumb;
    this.trigger = children.trigger;
  }

  apply_snap(value) {
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
  }

  set_value(value) {
    value = this.apply_snap(value);
    this.value = clamp(value, this.min, this.max);
    this.on_change();
  }

  onUpdate(element) {
    const pos = flexpanel_node_layout_get_position(element.flexpanel, false);
    if (pos.width <= 0) return;

    const inner_h = max(0, pos.height - pos.paddingTop - pos.paddingBottom);
    const track_top = pos.paddingTop;

    this.track.set_height(inner_h, flexpanel_unit.point);
    this.fill.set_height(inner_h, flexpanel_unit.point);
    this.track.set_position(
      flexpanel_edge.top,
      track_top,
      flexpanel_unit.point,
    );
    this.fill.set_position(flexpanel_edge.top, track_top, flexpanel_unit.point);
    this.thumb.set_height(inner_h * 1.4, flexpanel_unit.point);

    const t =
      this.max === this.min
        ? 0
        : (this.value - this.min) / (this.max - this.min);
    const x = t * pos.width;

    this.fill.set_width(x, flexpanel_unit.point);
    this.thumb.set_position(
      flexpanel_edge.left,
      x - inner_h * 0.2,
      flexpanel_unit.point,
    );
    this.thumb.set_position(
      flexpanel_edge.top,
      track_top - inner_h * 0.2,
      flexpanel_unit.point,
    );

    if (!this.read_only) {
      const triggerComp = this.trigger.getComponent(UITrigger);
      if (triggerComp && triggerComp.hold) {
        const mx = device_mouse_x_to_gui(0);
        const clamped = clamp(mx - pos.left, 0, pos.width);
        const nv = this.min + (clamped / pos.width) * (this.max - this.min);
        if (nv !== this.value) this.set_value(nv);
      }
    }
  }
}
global.SliderComponent = SliderComponent;

function uiSlider(
  style = {},
  slider = {},
  track = {},
  fill = {},
  thumb = {},
  trigger = {},
) {
  const elem = new UIElement(style);

  const trackEl = new UIElement({
    width: "100%",
    height: "100%",
    position: "absolute",
  }).addComponent(new UIPanel(track));

  const fillEl = new UIElement({
    height: "100%",
    position: "absolute",
  }).addComponent(new UIPanel(fill));

  const thumbEl = new UIElement({
    aspectRatio: 1,
    height: "140%",
    position: "absolute",
  }).addComponent(new UIPanel(thumb));

  const triggerEl = new UIElement({
    width: "100%",
    height: "100%",
    position: "absolute",
  }).addComponent(
    new UITrigger({
      block: trigger.block,
      on_enter: method(this, trigger.on_enter ?? noop),
      on_hover: method(this, trigger.on_hover ?? noop),
      on_leave: method(this, trigger.on_leave ?? noop),
      on_down: method(this, trigger.on_down ?? noop),
      on_up: method(this, trigger.on_up ?? noop),
      on_click: method(this, trigger.on_click ?? noop),
    }),
  );

  elem.insertChild(trackEl);
  elem.insertChild(fillEl);
  elem.insertChild(thumbEl);
  elem.insertChild(triggerEl);

  const sliderComp = new SliderComponent(slider, {
    track: trackEl,
    fill: fillEl,
    thumb: thumbEl,
    trigger: triggerEl,
  });
  elem.addComponent(sliderComp);

  const elemAny = elem;
  elemAny.set_value = (value) => {
    sliderComp.set_value(value);
    return elem;
  };

  return elem;
}
