// ── GemsUI kit ────────────────────────────────────────────────
// A themed factory library for building scene UIs declaratively. Every visual
// constant lives in GemsTheme; the gems* factories compose UIElement + the UI*
// components so scenes never hand-wire panels/text/colors. Colors are stored as
// hex strings (parsed lazily in the factories) — Color may not be loaded yet when
// this script's top level runs, so we never call Color.parse at module scope.

globalThis.GemsTheme = {
  // ── Surfaces (cool slate; `panelLo` is the darker edge of the card vignette) ──
  panel: "#272b34", // section / card fill (roundrect center)
  panelLo: "#1f222a", // card edge — darker, reads as depth
  // ── Buttons ──
  btn: "#323845",
  btnHover: "#3e4658",
  btnPress: "#23272f",
  // ── Accent — slider fills, focus glow, primary buttons ──
  accent: "#4a9eff",
  accentHi: "#74b6ff", // brighter accent (primary hover / glow)
  accentPress: "#3174d4",
  // ── Text ──
  text: "#f1f4fa",
  textMuted: "#9aa3b2",
  textDim: "#6c7585",
  // ── Lines & bevels ──
  border: "#3c4350",
  borderHi: "#566173", // hover/active outline glow
  highlight: "#ffffff", // inner top sheen (drawn at low alpha)
  // ── Geometry ──
  radius: 14,
  radiusSm: 9,
  pad: 18,
  padSm: 12,
  gap: 12,
  gapSm: 8,
  rowH: 50, // button / control height
  headerH: 64,
  // ── Motion ──
  animSpeed: 16, // hover/press easing rate
};

// Accept a theme key, hex string, or raw color int → color int.
function gemsColor(c) {
  if (typeof c === "number") return c;
  if (GemsTheme[c] !== undefined) return Color.parse(GemsTheme[c]);
  return Color.parse(c);
}

// Accept a string or a () => string → a live textRef.
function gemsTextRef(label) {
  return typeof label === "function" ? label : () => label;
}

// ── Containers ────────────────────────────────────────────────

// Full-screen scene root: insert it into UI, hang everything else off it.
function gemsRoot(opts = {}) {
  return new UIElement({
    width: "100%",
    height: "100%",
    padding: opts.padding ?? GemsTheme.pad,
    gap: opts.gap ?? GemsTheme.gap,
  });
}

// Vertical stack (the default flexpanel direction).
function gemsList(opts = {}) {
  return new UIElement({
    width: opts.width ?? "100%",
    padding: opts.padding ?? 0,
    gap: opts.gap ?? GemsTheme.gapSm,
  });
}

// Horizontal wrapping row — for button bars / icon grids.
function gemsGrid(opts = {}) {
  return new UIElement({
    width: opts.width ?? "100%",
    gap: opts.gap ?? GemsTheme.gapSm,
    flexDirection: "row",
    flexWrap: "wrap",
  });
}

// Bare rounded panel. `card: true` (the default via gemsCard) adds shadow + border.
function gemsPanel(opts = {}) {
  const el = new UIElement({
    width: opts.width ?? "100%",
    padding: opts.padding ?? GemsTheme.pad,
    gap: opts.gap ?? GemsTheme.gapSm,
  });
  el.addComponent(
    new UIPanel({
      color: gemsColor(opts.color ?? GemsTheme.panel),
      color2: opts.color2 != null ? gemsColor(opts.color2) : undefined,
      rad: opts.rad ?? GemsTheme.radius,
      border: opts.border ?? 0,
      borderColor: gemsColor(opts.borderColor ?? GemsTheme.border),
      shadow: opts.shadow ?? 0,
      highlight: opts.highlight ?? 0,
    }),
  );
  return el;
}

// Raised panel: vignette edge + inner top bevel + 1px border + soft shadow.
function gemsCard(opts = {}) {
  return gemsPanel({
    width: opts.width,
    padding: opts.padding,
    gap: opts.gap,
    color: opts.color,
    color2: opts.color2 ?? GemsTheme.panelLo,
    rad: opts.rad,
    border: opts.border ?? 1,
    borderColor: opts.borderColor,
    shadow: opts.shadow ?? 10,
    highlight: opts.highlight ?? 1,
  });
}

// Header / title bar.
function gemsHeader(title, opts = {}) {
  const bar = new UIElement({
    width: "100%",
    height: opts.height ?? GemsTheme.headerH,
    paddingHorizontal: 20,
    paddingVertical: 8,
    justifyContent: "center",
  });
  bar.addComponent(
    new UIPanel({
      color: gemsColor(GemsTheme.panel),
      color2: gemsColor(GemsTheme.panelLo),
      rad: GemsTheme.radius,
      border: 1,
      borderColor: gemsColor(GemsTheme.border),
      shadow: opts.shadow ?? 8,
      highlight: 1,
      highlightAlpha: 0.08,
    }),
  );
  bar.insertChild(
    gemsLabel(title, {
      color: opts.color ?? GemsTheme.text,
      halign: opts.halign ?? fa_left,
      font: opts.font,
    }),
  );
  return bar;
}

// Titled card section. A divider under the title separates it from the body.
function gemsSection(title, opts = {}) {
  const section = gemsCard({
    padding: GemsTheme.padSm,
    gap: GemsTheme.gapSm,
    shadow: opts.shadow ?? 4,
  });
  if (title != null) {
    section.insertChild(gemsLabel(title, { color: GemsTheme.textMuted }));
    section.insertChild(gemsDivider());
  }
  return section;
}

// Thin horizontal rule.
function gemsDivider(opts = {}) {
  const el = new UIElement({ width: "100%", height: opts.thickness ?? 2 });
  el.addComponent(
    new UIPanel({ color: gemsColor(opts.color ?? GemsTheme.border), rad: 1 }),
  );
  return el;
}

// Label + control on one line.
function gemsRow(label, control, opts = {}) {
  const row = new UIElement({ width: "100%", gap: GemsTheme.gapSm });
  row.insertChild(
    gemsLabel(label, { color: opts.labelColor ?? GemsTheme.textMuted }),
  );
  row.insertChild(control);
  return row;
}

// ── Widgets ───────────────────────────────────────────────────

// Standalone text node. Width/height auto-fit to the string (UIText).
function gemsLabel(label, opts = {}) {
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
}

// One-line help/hint text on a readable card backdrop. Use instead of a bare
// gemsLabel for overlays that would otherwise float as low-contrast text over a
// scene's render (e.g. the tile-inspector "press X to…" lines).
function gemsHint(label, opts = {}) {
  const card = gemsCard({ padding: GemsTheme.padSm });
  card.insertChild(
    gemsLabel(label, {
      color: opts.color ?? GemsTheme.textMuted,
      halign: opts.halign ?? fa_left,
      font: opts.font,
    }),
  );
  return card;
}

// Attach a hover tooltip to any element and return it (chainable). `label` is a
// string or () => string (live I18n.textRef). Added at index 0 so a sibling
// interactive component (e.g. the UIButton this describes) setting `block` while
// hovered doesn't suppress its own tooltip. `opts.delay` overrides the dwell time.
//
// The widget factories below also take this directly: pass `opts.tooltip` (string
// or () => string) — and optionally `opts.tooltipDelay` — to gemsButton/gemsToggle/
// gemsIconButton/gemsSlider/gemsSelect(Custom)/gemsInput/gemsLabel and they call
// this for you, so callers rarely wrap by hand.
function gemsTooltip(element, label, opts = {}) {
  element.addComponent(
    new UITooltip({ label: gemsTextRef(label), delay: opts.delay }),
    0,
  );
  return element;
}

// Internal: honor `opts.tooltip` on a factory's element. No-op when unset.
function gemsAttachTooltip(element, opts) {
  if (opts.tooltip != null) {
    gemsTooltip(element, opts.tooltip, { delay: opts.tooltipDelay });
  }
  return element;
}

// `opts.primary: true` paints the button in the accent color for a highlighted
// call-to-action. The label is centered both axes; hover eases the fill + a border
// glow + a shadow lift (see UIButton), press sinks it.
function gemsButton(label, onClick, opts = {}) {
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
}

// Square button holding a sprite (OBJECT_FIT.CONTAIN inside padding).
function gemsIconButton(sprite, onClick, opts = {}) {
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
}

// Boolean button: renders `label: ON/OFF`, live from getValue(); click → onToggle.
// onText/offText may be strings or () => string (for live i18n).
function gemsToggle(label, getValue, onToggle, opts = {}) {
  const ref = gemsTextRef(label);
  const onRef = gemsTextRef(opts.onText ?? "ON");
  const offRef = gemsTextRef(opts.offText ?? "OFF");
  return gemsButton(
    () => `${ref()}: ${getValue() ? onRef() : offRef()}`,
    onToggle,
    opts,
  );
}

// Non-interactive themed progress / fill bar. `getValue` is () => 0..1 (read live).
// `opts.label` (string or () => string) draws centered; `opts.fillColor`/`trackColor`
// accept a theme key/hex/int; `opts.fillColor2` is an optional radial edge tint.
function gemsProgress(getValue, opts = {}) {
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
}

// Settings-bound slider. For a non-Settings slider, build UISlider directly.
function gemsSlider(key, min = 0, max = 1, step = undefined, opts = {}) {
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
}

// Panel-backed cycling select with an explicit index/onChange.
function gemsSelectCustom(items, index, onChange, opts = {}) {
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
}

// Panel-backed single-line text field (UIInput). Returns the element; reach the
// component with `field.getComponent(UIInput)` to read `.value` / call focus().
// `placeholder` is resolved once (UIInput holds a plain string, not a textRef),
// so it won't re-translate on a live language switch.
function gemsInput(opts = {}) {
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
}

// Settings-bound select. `items` are { name, value }; the current Settings value
// picks the starting index.
function gemsSelect(key, items, opts = {}) {
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
}

// Releases the world / renderer / camera / UI a genre scene builds, in dependency
// order. Scenes hold these on `this`; call teardownScene(this) from destroy() after
// releasing any scene-specific resources (controllers, levels). Missing fields are
// skipped, so a partially-built scene still tears down safely.
function teardownScene(scene) {
  if (scene.camera) scene.camera.destroy();
  if (scene.renderer) scene.renderer.destroy();
  if (scene.world) scene.world.destroy();
  if (scene.ui) {
    UI.remove(scene.ui);
    scene.ui.destroy();
  }
}

// ── SceneRegistry ────────────────────────────────────────────

globalThis.SceneRegistry = {
  _entries: [],
  add(factory, opts) {
    this._entries.push({
      factory,
      label: opts.label,
      category: opts.category ?? "기타",
    });
  },
  byCategory() {
    const result = [];
    const index = {};
    for (const e of this._entries) {
      if (!index[e.category]) {
        index[e.category] = [];
        result.push({ category: e.category, entries: index[e.category] });
      }
      index[e.category].push(e);
    }
    return result;
  },
};
