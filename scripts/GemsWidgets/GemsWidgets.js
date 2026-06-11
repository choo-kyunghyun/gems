// ── GemsUI kit: text / tooltip / buttons ──────────────────────
// See GemsTheme.js for the kit overview + the GMRT globalThis-assignment rule.

// Standalone text node. Width/height auto-fit to the string (UIText).
globalThis.gemsLabel = function gemsLabel(label, opts = {}) {
  const el = new UIElement();
  el.addComponent(
    new UIText({
      textRef: gemsTextRef(label),
      color: gemsColor(opts.color ?? GemsTheme.text),
      halign: opts.halign ?? fa_left,
      font: opts.font ?? -1,
    }),
  );
  return gemsAttachTooltip(el, opts);
};

// One-line help/hint text on a readable card backdrop. Use instead of a bare
// gemsLabel for overlays that would otherwise float as low-contrast text over a
// scene's render (e.g. the tile-inspector "press X to…" lines).
globalThis.gemsHint = function gemsHint(label, opts = {}) {
  const card = gemsCard({ padding: GemsTheme.padSm });
  card.insertChild(
    gemsLabel(label, {
      color: opts.color ?? GemsTheme.textMuted,
      halign: opts.halign ?? fa_left,
      font: opts.font,
    }),
  );
  return card;
};

// Attach a hover tooltip to any element and return it (chainable). `label` is a
// string or () => string (live I18n.textRef). Added at index 0 so a sibling
// interactive component (e.g. the UIButton this describes) setting `block` while
// hovered doesn't suppress its own tooltip. `opts.delay` overrides the dwell time.
//
// The widget factories also take this directly: pass `opts.tooltip` (string or
// () => string) — and optionally `opts.tooltipDelay` — to gemsButton/gemsToggle/
// gemsIconButton/gemsSlider/gemsSelect(Custom)/gemsInput/gemsLabel and they call this
// for you, so callers rarely wrap by hand.
globalThis.gemsTooltip = function gemsTooltip(element, label, opts = {}) {
  element.addComponent(
    new UITooltip({ label: gemsTextRef(label), delay: opts.delay }),
    0,
  );
  return element;
};

// Internal: honor `opts.tooltip` on a factory's element. No-op when unset.
globalThis.gemsAttachTooltip = function gemsAttachTooltip(element, opts) {
  if (opts.tooltip != null) {
    gemsTooltip(element, opts.tooltip, { delay: opts.tooltipDelay });
  }
  return element;
};

// `opts.primary: true` paints the button in the accent color for a highlighted
// call-to-action. The label is centered both axes; hover eases the fill + a border
// glow + a shadow lift (see UIButton), press sinks it.
globalThis.gemsButton = function gemsButton(label, onClick, opts = {}) {
  const primary = opts.primary ?? false;
  const base = opts.color ?? (primary ? GemsTheme.accent : GemsTheme.btn);
  const hover =
    opts.colorHover ?? (primary ? GemsTheme.accentHi : GemsTheme.btnHover);
  const press =
    opts.colorPress ?? (primary ? GemsTheme.accentPress : GemsTheme.btnPress);
  const bdr =
    opts.borderColor ?? (primary ? GemsTheme.accentHi : GemsTheme.border);
  const bdrHover = primary ? GemsTheme.text : GemsTheme.borderHi;

  const btn = new UIElement({
    height: opts.height ?? GemsTheme.rowH,
    width: opts.width ?? "100%",
    justifyContent: "center",
    alignItems: "center",
  });
  btn.addComponent(
    new UIPanel({
      color: gemsColor(base),
      rad: opts.rad ?? GemsTheme.radiusSm,
      border: opts.border ?? 1,
      borderColor: gemsColor(bdr),
      shadow: opts.shadow ?? 5,
      shadowAlpha: 0.3,
      highlight: 1,
      highlightAlpha: primary ? 0.16 : 0.07,
    }),
  );
  btn.addComponent(
    new UIButton({
      colorNormal: gemsColor(base),
      colorHover: gemsColor(hover),
      colorPress: gemsColor(press),
      borderColorNormal: gemsColor(bdr),
      borderColorHover: gemsColor(bdrHover),
      animSpeed: GemsTheme.animSpeed,
      onClick,
    }),
  );
  btn.insertChild(
    gemsLabel(label, {
      halign: fa_center,
      color: opts.textColor ?? GemsTheme.text,
      font: opts.font,
    }),
  );
  return gemsAttachTooltip(btn, opts);
};

// Square button holding a sprite (OBJECT_FIT.CONTAIN inside padding).
globalThis.gemsIconButton = function gemsIconButton(
  sprite,
  onClick,
  opts = {},
) {
  const sz = opts.size ?? GemsTheme.rowH;
  const btn = new UIElement({ width: sz, height: sz });
  btn.addComponent(
    new UIPanel({
      color: gemsColor(GemsTheme.btn),
      rad: opts.rad ?? GemsTheme.radiusSm,
      border: 1,
      borderColor: gemsColor(GemsTheme.border),
      shadow: opts.shadow ?? 5,
      shadowAlpha: 0.3,
      highlight: 1,
      highlightAlpha: 0.07,
    }),
  );
  btn.addComponent(
    new UIButton({
      colorNormal: gemsColor(GemsTheme.btn),
      colorHover: gemsColor(GemsTheme.btnHover),
      colorPress: gemsColor(GemsTheme.btnPress),
      borderColorNormal: gemsColor(GemsTheme.border),
      borderColorHover: gemsColor(GemsTheme.borderHi),
      animSpeed: GemsTheme.animSpeed,
      onClick,
    }),
  );
  const icon = new UIElement({
    width: "100%",
    height: "100%",
    padding: opts.pad ?? 10,
  });
  icon.addComponent(
    new UIImage({
      sprite,
      fit: OBJECT_FIT.CONTAIN,
      color: gemsColor(opts.iconColor ?? GemsTheme.text),
    }),
  );
  btn.insertChild(icon);
  return gemsAttachTooltip(btn, opts);
};

// Boolean button: renders `label: ON/OFF`, live from getValue(); click → onToggle.
// onText/offText may be strings or () => string (for live i18n).
globalThis.gemsToggle = function gemsToggle(
  label,
  getValue,
  onToggle,
  opts = {},
) {
  const ref = gemsTextRef(label);
  const onRef = gemsTextRef(opts.onText ?? "ON");
  const offRef = gemsTextRef(opts.offText ?? "OFF");
  return gemsButton(
    () => `${ref()}: ${getValue() ? onRef() : offRef()}`,
    onToggle,
    opts,
  );
};
