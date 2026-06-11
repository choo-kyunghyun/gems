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
