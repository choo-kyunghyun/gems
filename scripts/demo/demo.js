// ── GemsUI kit ────────────────────────────────────────────────
// A themed factory library for building scene UIs declaratively. Every visual
// constant lives in GemsTheme; the gems* factories compose UIElement + the UI*
// components so scenes never hand-wire panels/text/colors. Colors are stored as
// hex strings (parsed lazily in the factories) — Color may not be loaded yet when
// this script's top level runs, so we never call Color.parse at module scope.

globalThis.GemsTheme = {
  // surfaces
  panel: "#282828", // section / card background (gradient top)
  panelHi: "#303030", // gradient bottom for raised surfaces
  // buttons
  btn: "#3a3a3a",
  btnHover: "#505050",
  btnPress: "#2a2a2a",
  // accent — slider fills, highlights
  accent: "#4a9eff",
  // text
  text: "#ffffff",
  textMuted: "#aaaaaa",
  textDim: "#777777",
  // lines
  border: "#454545",
  // geometry
  radius: 12,
  radiusSm: 8,
  pad: 16,
  padSm: 12,
  gap: 12,
  gapSm: 8,
  rowH: 48, // button / control height
  headerH: 60,
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
    }),
  );
  return el;
}

// Raised panel: subtle gradient + 1px border + drop shadow.
function gemsCard(opts = {}) {
  return gemsPanel({
    width: opts.width,
    padding: opts.padding,
    gap: opts.gap,
    color: opts.color,
    color2: opts.color2 ?? GemsTheme.panelHi,
    rad: opts.rad,
    border: opts.border ?? 1,
    borderColor: opts.borderColor,
    shadow: opts.shadow ?? 6,
  });
}

// Header / title bar.
function gemsHeader(title, opts = {}) {
  const bar = new UIElement({
    width: "100%",
    height: opts.height ?? GemsTheme.headerH,
    paddingHorizontal: 16,
    paddingVertical: 8,
  });
  bar.addComponent(
    new UIPanel({
      color: gemsColor(GemsTheme.panel),
      color2: gemsColor(GemsTheme.panelHi),
      rad: GemsTheme.radius,
      shadow: opts.shadow ?? 4,
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
  row.insertChild(gemsLabel(label, { color: opts.labelColor ?? GemsTheme.textMuted }));
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
  return el;
}

function gemsButton(label, onClick, opts = {}) {
  const btn = new UIElement({
    height: opts.height ?? GemsTheme.rowH,
    width: opts.width ?? "100%",
  });
  btn.addComponent(
    new UIPanel({
      color: gemsColor(opts.color ?? GemsTheme.btn),
      rad: opts.rad ?? GemsTheme.radiusSm,
      border: opts.border ?? 1,
      borderColor: gemsColor(opts.borderColor ?? GemsTheme.border),
    }),
  );
  btn.addComponent(
    new UIButton({
      colorNormal: gemsColor(opts.color ?? GemsTheme.btn),
      colorHover: gemsColor(opts.colorHover ?? GemsTheme.btnHover),
      colorPress: gemsColor(opts.colorPress ?? GemsTheme.btnPress),
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
  return btn;
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
    }),
  );
  btn.addComponent(
    new UIButton({
      colorNormal: gemsColor(GemsTheme.btn),
      colorHover: gemsColor(GemsTheme.btnHover),
      colorPress: gemsColor(GemsTheme.btnPress),
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
  return btn;
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

// Settings-bound slider. For a non-Settings slider, build UISlider directly.
function gemsSlider(key, min = 0, max = 1, step = undefined) {
  const el = new UIElement({ height: 24, width: "100%" });
  el.addComponent(
    new UISlider({
      min,
      max,
      value: Settings.get(key),
      step,
      onChange: (v) => Settings.set(key, v),
      track: { color: gemsColor(GemsTheme.btnPress), rad: 6 },
      fill: { color: gemsColor(GemsTheme.accent), rad: 6 },
      thumb: { color: gemsColor(GemsTheme.text), rad: 8 },
    }),
  );
  return el;
}

// Panel-backed cycling select with an explicit index/onChange.
function gemsSelectCustom(items, index, onChange) {
  const el = new UIElement({ height: 36, width: "100%" });
  el.addComponent(
    new UIPanel({
      color: gemsColor(GemsTheme.btn),
      rad: GemsTheme.radiusSm,
      border: 1,
      borderColor: gemsColor(GemsTheme.border),
    }),
  );
  el.addComponent(
    new UISelect({ items, index, onChange, halign: fa_center }),
  );
  return el;
}

// Settings-bound select. `items` are { name, value }; the current Settings value
// picks the starting index.
function gemsSelect(key, items) {
  const cur = Settings.get(key);
  const idx = Math.max(
    0,
    items.findIndex((item) => item.value === cur),
  );
  return gemsSelectCustom(items, idx, (_i, value) => Settings.set(key, value));
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
