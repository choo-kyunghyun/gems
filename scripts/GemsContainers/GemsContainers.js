// ── GemsUI kit: containers ────────────────────────────────────
// Layout/structure factories. See GemsTheme.js for the kit overview + the GMRT
// globalThis-assignment rule (keep new factories in `globalThis.X = function X` form).

// Full-screen scene root: insert it into UI, hang everything else off it.
globalThis.gemsRoot = function gemsRoot(opts = {}) {
  return new UIElement({
    width: "100%",
    height: "100%",
    padding: opts.padding ?? GemsTheme.pad,
    gap: opts.gap ?? GemsTheme.gap,
  });
};

// Vertical stack (the default flexpanel direction).
globalThis.gemsList = function gemsList(opts = {}) {
  return new UIElement({
    width: opts.width ?? "100%",
    padding: opts.padding ?? 0,
    gap: opts.gap ?? GemsTheme.gapSm,
  });
};

// Horizontal wrapping row — for button bars / icon grids.
globalThis.gemsGrid = function gemsGrid(opts = {}) {
  return new UIElement({
    width: opts.width ?? "100%",
    gap: opts.gap ?? GemsTheme.gapSm,
    flexDirection: "row",
    flexWrap: "wrap",
  });
};

// Bare rounded panel. `card: true` (the default via gemsCard) adds shadow + border.
globalThis.gemsPanel = function gemsPanel(opts = {}) {
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
};

// Raised panel: vignette edge + inner top bevel + 1px border + soft shadow.
globalThis.gemsCard = function gemsCard(opts = {}) {
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
};

// Sprite-skinned panel: same content box as gemsPanel, but the background is a
// nine-slice sprite frame (spr_uibox by default) instead of a drawn roundrect — so
// the kit can wear hand-drawn skins. The sprite's IDE nine-slice keeps the border
// crisp at any size. `color` tints the frame (theme key / hex / int).
globalThis.gemsNineSlice = function gemsNineSlice(opts = {}) {
  const el = new UIElement({
    width: opts.width ?? "100%",
    padding: opts.padding ?? GemsTheme.pad,
    gap: opts.gap ?? GemsTheme.gapSm,
  });
  el.addComponent(
    new UINineSlice({
      sprite: opts.sprite ?? asset_get_index("spr_uibox"),
      subimg: opts.subimg ?? 0,
      color: opts.color != null ? gemsColor(opts.color) : c_white,
      alpha: opts.alpha ?? 1,
    }),
  );
  return el;
};

// Fixed-height scroll viewport. Insert items into the returned element's
// `.scrollBody` (a flexShrink-0 column that overflows + scrolls); insert the
// viewport itself into the layout. Clips via surface, scrolls via draw-time offset
// (wheel + drag-thumb) — no flex mutation. The keystone for list-heavy scenes given
// the display/2 GUI clamp.
globalThis.gemsScroll = function gemsScroll(opts = {}) {
  const body = new UIElement({
    width: "100%",
    flexShrink: 0, // keep natural (tall) height so it can overflow
    gap: opts.gap ?? GemsTheme.gapSm,
    padding: opts.padding ?? 0,
  });
  const viewport = new UIElement({
    width: opts.width ?? "100%",
    height: opts.height ?? 300,
    flexShrink: 0,
  });
  viewport.clip = true;
  viewport.insertChild(body);
  viewport.addComponent(
    new UIScroll({
      content: body,
      barW: opts.barW,
      wheelStep: opts.wheelStep,
      trackColor: gemsColor(opts.trackColor ?? GemsTheme.panelLo),
      thumbColor: gemsColor(opts.thumbColor ?? GemsTheme.border),
      thumbHover: gemsColor(opts.thumbHover ?? GemsTheme.borderHi),
    }),
  );
  viewport.scrollBody = body; // callers add items here
  return viewport;
};

// Header / title bar.
globalThis.gemsHeader = function gemsHeader(title, opts = {}) {
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
};

// Titled card section. A divider under the title separates it from the body.
globalThis.gemsSection = function gemsSection(title, opts = {}) {
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
};

// Thin horizontal rule.
globalThis.gemsDivider = function gemsDivider(opts = {}) {
  const el = new UIElement({ width: "100%", height: opts.thickness ?? 2 });
  el.addComponent(
    new UIPanel({ color: gemsColor(opts.color ?? GemsTheme.border), rad: 1 }),
  );
  return el;
};

// Label + control on one line.
globalThis.gemsRow = function gemsRow(label, control, opts = {}) {
  const row = new UIElement({ width: "100%", gap: GemsTheme.gapSm });
  row.insertChild(
    gemsLabel(label, { color: opts.labelColor ?? GemsTheme.textMuted }),
  );
  row.insertChild(control);
  return row;
};
