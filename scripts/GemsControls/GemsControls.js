// ── GemsUI kit: interactive controls ──────────────────────────
// Value widgets (toggle/progress/slider/select/stepper/input). See GemsTheme.js for
// the kit overview + the GMRT globalThis-assignment rule.

// Real visual checkbox/switch row: label on the left, the toggle graphic anchored to
// the right edge; the whole row is the click target. `opts.style` is "check" (box +
// tick, default) or "switch" (pill + sliding knob). For a `label: ON/OFF` button
// instead, use gemsToggle.
globalThis.gemsCheckbox = function gemsCheckbox(
  label,
  getValue,
  onToggle,
  opts = {},
) {
  const el = new UIElement({
    height: opts.height ?? GemsTheme.rowH,
    width: opts.width ?? "100%",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: GemsTheme.padSm,
  });
  el.addComponent(
    new UICheckbox({
      getValue,
      onToggle,
      readOnly: opts.readOnly ?? false,
      style: opts.style ?? "check",
      colorOff: gemsColor(opts.colorOff ?? GemsTheme.btnPress),
      colorOn: gemsColor(opts.colorOn ?? GemsTheme.accent),
      colorKnob: gemsColor(opts.colorKnob ?? GemsTheme.text),
      colorBorder: gemsColor(GemsTheme.border),
      animSpeed: GemsTheme.animSpeed,
    }),
  );
  el.insertChild(
    gemsLabel(label, { color: opts.labelColor ?? GemsTheme.text }),
  );
  return gemsAttachTooltip(el, opts);
};

// Non-interactive themed progress / fill bar. `getValue` is () => 0..1 (read live).
// `opts.label` (string or () => string) draws centered; `opts.fillColor`/`trackColor`
// accept a theme key/hex/int; `opts.fillColor2` is an optional radial edge tint.
globalThis.gemsProgress = function gemsProgress(getValue, opts = {}) {
  const el = new UIElement({
    height: opts.height ?? 16,
    width: opts.width ?? "100%",
  });
  el.addComponent(
    new UIProgress({
      getValue,
      label: opts.label,
      color: gemsColor(opts.textColor ?? GemsTheme.text),
      font: opts.font ?? -1,
      track: {
        color: gemsColor(opts.trackColor ?? GemsTheme.btnPress),
        rad: opts.rad,
        border: 1,
        borderColor: gemsColor(GemsTheme.border),
      },
      fill: {
        color: gemsColor(opts.fillColor ?? GemsTheme.accent),
        color2:
          opts.fillColor2 != null ? gemsColor(opts.fillColor2) : undefined,
      },
    }),
  );
  return gemsAttachTooltip(el, opts);
};

// Settings-bound slider. For a non-Settings slider, build UISlider directly.
globalThis.gemsSlider = function gemsSlider(
  key,
  min = 0,
  max = 1,
  step = undefined,
  opts = {},
) {
  const el = new UIElement({ height: 28, width: "100%" });
  el.addComponent(
    new UISlider({
      min,
      max,
      value: Settings.get(key),
      step,
      onChange: (v) => Settings.set(key, v),
      track: {
        color: gemsColor(GemsTheme.btnPress),
        border: 1,
        borderColor: gemsColor(GemsTheme.border),
      },
      fill: { color: gemsColor(GemsTheme.accent) },
      thumb: {
        color: gemsColor(GemsTheme.text),
        borderColor: gemsColor(GemsTheme.accentHi),
        shadowAlpha: 0.35,
      },
    }),
  );
  return gemsAttachTooltip(el, opts);
};

// Panel-backed cycling select with an explicit index/onChange.
globalThis.gemsSelectCustom = function gemsSelectCustom(
  items,
  index,
  onChange,
  opts = {},
) {
  const el = new UIElement({ height: 36, width: "100%" });
  el.addComponent(
    new UIPanel({
      color: gemsColor(GemsTheme.btn),
      rad: GemsTheme.radiusSm,
      border: 1,
      borderColor: gemsColor(GemsTheme.border),
      highlight: 1,
      highlightAlpha: 0.07,
    }),
  );
  el.addComponent(
    new UISelect({
      items,
      index,
      onChange,
      halign: fa_center,
      color: gemsColor(GemsTheme.text),
      arrowColor: gemsColor(GemsTheme.textMuted),
      arrowHover: gemsColor(GemsTheme.accent),
    }),
  );
  return gemsAttachTooltip(el, opts);
};

// Panel-backed numeric stepper (`< n >`). Holds its own value; `onChange(value)`
// fires on each step. `opts`: { min, max, step, wrap, format } — `format(v)` returns
// the centered display string (default `${v}`).
globalThis.gemsStepper = function gemsStepper(value, onChange, opts = {}) {
  const el = new UIElement({
    height: opts.height ?? 36,
    width: opts.width ?? "100%",
  });
  el.addComponent(
    new UIPanel({
      color: gemsColor(GemsTheme.btn),
      rad: GemsTheme.radiusSm,
      border: 1,
      borderColor: gemsColor(GemsTheme.border),
      highlight: 1,
      highlightAlpha: 0.07,
    }),
  );
  el.addComponent(
    new UIStepper({
      value,
      min: opts.min ?? 0,
      max: opts.max ?? 10,
      step: opts.step ?? 1,
      wrap: opts.wrap ?? false,
      format: opts.format,
      onChange,
      halign: fa_center,
      color: gemsColor(GemsTheme.text),
      arrowColor: gemsColor(GemsTheme.textMuted),
      arrowHover: gemsColor(GemsTheme.accent),
      arrowDisabled: gemsColor(GemsTheme.textDim),
    }),
  );
  return gemsAttachTooltip(el, opts);
};

// Panel-backed single-line text field (UIInput). Returns the element; reach the
// component with `field.getComponent(UIInput)` to read `.value` / call focus().
// `placeholder` is resolved once (UIInput holds a plain string, not a textRef), so
// it won't re-translate on a live language switch.
globalThis.gemsInput = function gemsInput(opts = {}) {
  const el = new UIElement({
    height: opts.height ?? GemsTheme.rowH,
    width: opts.width ?? "100%",
  });
  el.addComponent(
    new UIPanel({
      color: gemsColor(opts.color ?? GemsTheme.btnPress),
      rad: opts.rad ?? GemsTheme.radiusSm,
      border: 1,
      borderColor: gemsColor(GemsTheme.border),
      highlight: 1,
      highlightAlpha: 0.05,
    }),
  );
  el.addComponent(
    new UIInput({
      value: opts.value ?? "",
      placeholder: opts.placeholder ?? "",
      mask: opts.mask ?? false,
      maxLength: opts.maxLength,
      filter: opts.filter,
      readOnly: opts.readOnly ?? false,
      padX: GemsTheme.padSm,
      color: gemsColor(GemsTheme.text),
      colorPlaceholder: gemsColor(GemsTheme.textDim),
      colorCursor: gemsColor(GemsTheme.accent),
      colorSelection: gemsColor(GemsTheme.accent),
      onChange: opts.onChange,
      onConfirm: opts.onConfirm,
      onCancel: opts.onCancel,
    }),
  );
  return gemsAttachTooltip(el, opts);
};

// Settings-bound select. `items` are { name, value }; the current Settings value
// picks the starting index.
globalThis.gemsSelect = function gemsSelect(key, items, opts = {}) {
  const cur = Settings.get(key);
  const idx = Math.max(
    0,
    items.findIndex((item) => item.value === cur),
  );
  return gemsSelectCustom(
    items,
    idx,
    (_i, value) => Settings.set(key, value),
    opts,
  );
};
