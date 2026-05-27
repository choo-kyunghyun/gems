/** @implements {UIComponent} */
globalThis.UISlider = class UISlider {
  constructor(slider = {}) {
    this.min = slider.min ?? 0;
    this.max = slider.max ?? 1;
    this.value = slider.value ?? this.min;
    this.step = slider.step;
    this.values = slider.values;
    this.readOnly = slider.readOnly ?? false;
    this.onChange = slider.onChange ?? noop;

    this._trackStyle = slider.track ?? {};
    this._fillStyle = slider.fill ?? {};
    this._thumbStyle = slider.thumb ?? {};

    this._track = undefined;
    this._fill = undefined;
    this._thumb = undefined;
    this._trigger = undefined;
  }

  _snap(value) {
    if (Array.isArray(this.values) && this.values.length > 0) {
      let best = 0;
      let bestD = Math.abs(this.values[0] - value);
      for (let i = 1; i < this.values.length; i++) {
        const d = Math.abs(this.values[i] - value);
        if (d < bestD) {
          bestD = d;
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

  setValue(value) {
    const next = clamp(this._snap(value), this.min, this.max);
    if (next === this.value) return this;
    this.value = next;
    this.onChange(this.value);
    return this;
  }

  _initChildren(element) {
    this._track = new UIElement({
      width: "100%",
      height: "100%",
      position: "absolute",
    }).addComponent(new UIPanel(this._trackStyle));

    this._fill = new UIElement({
      height: "100%",
      position: "absolute",
    }).addComponent(new UIPanel(this._fillStyle));

    this._thumb = new UIElement({ position: "absolute" }).addComponent(
      new UIPanel(this._thumbStyle),
    );

    this._trigger = new UIElement({
      width: "100%",
      height: "100%",
      position: "absolute",
    }).addComponent(new UITrigger({ block: true }));

    element.insertChild(this._track);
    element.insertChild(this._fill);
    element.insertChild(this._thumb);
    element.insertChild(this._trigger);
  }

  onUpdate(element, block) {
    if (!this._track) this._initChildren(element);

    const pos = element.getLayoutPosition();
    if (pos.width <= 0) return block;

    const innerH = Math.max(
      0,
      pos.height - (pos.paddingTop ?? 0) - (pos.paddingBottom ?? 0),
    );
    const trackTop = pos.paddingTop ?? 0;
    const thumbSz = innerH * 1.4;

    this._track.setHeight(innerH, flexpanel_unit.point);
    this._track.setPosition(flexpanel_edge.top, trackTop, flexpanel_unit.point);

    this._fill.setHeight(innerH, flexpanel_unit.point);
    this._fill.setPosition(flexpanel_edge.top, trackTop, flexpanel_unit.point);

    this._thumb.setWidth(thumbSz, flexpanel_unit.point);
    this._thumb.setHeight(thumbSz, flexpanel_unit.point);

    const t =
      this.max !== this.min
        ? (this.value - this.min) / (this.max - this.min)
        : 0;
    const fillW = t * pos.width;

    this._fill.setWidth(fillW, flexpanel_unit.point);
    this._thumb.setPosition(
      flexpanel_edge.left,
      fillW - thumbSz * 0.5,
      flexpanel_unit.point,
    );
    this._thumb.setPosition(
      flexpanel_edge.top,
      trackTop - (thumbSz - innerH) * 0.5,
      flexpanel_unit.point,
    );

    if (!this.readOnly) {
      const triggerComp = this._trigger.getComponent(UITrigger);
      if (triggerComp && triggerComp.hold) {
        const mx = device_mouse_x_to_gui(0);
        const raw =
          this.min +
          (clamp(mx - pos.left, 0, pos.width) / pos.width) *
            (this.max - this.min);
        this.setValue(raw);
      }
    }

    return block;
  }

  onDestroy(element) {
    this._track = undefined;
    this._fill = undefined;
    this._thumb = undefined;
    this._trigger = undefined;
  }
};
