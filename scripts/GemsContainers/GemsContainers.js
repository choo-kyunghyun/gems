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

// Modal dialog: a dimmed full-screen root (top of the UI stack) + a centered card
// with an optional title, a body (string/() => string, or a prebuilt UIElement), and
// a right-aligned button row. Each button runs its onClick then closes the modal
// unless `keepOpen`. Returns the UIModal handle — call `.close()` to dismiss; it also
// closes on Escape or a backdrop click. `opts`: { title, body, buttons:[{label,
// onClick, primary, keepOpen, width}], width, dim, closeOnBackdrop, closeOnEscape }.
globalThis.gemsModal = function gemsModal(opts = {}) {
  const root = new UIElement({
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  });
  root.addComponent(
    new UIPanel({
      color: gemsColor(opts.dimColor ?? "#000000"),
      alpha: opts.dim ?? 0.6,
    }),
  );
  const modal = new UIModal({
    root,
    onClose: opts.onClose,
    closeOnBackdrop: opts.closeOnBackdrop,
    closeOnEscape: opts.closeOnEscape,
  });
  root.addComponent(modal);

  const card = gemsCard({ width: opts.width ?? 440 });
  // Swallow clicks anywhere on the card so they don't read as a backdrop dismiss.
  card.addComponent(new UITrigger({}));

  // Text labels need explicit-height rows: UIText can't self-size its element at
  // runtime (flexpanel mutation is a no-op on GMRT 0.19), so a 0-height label would
  // let the button row collapse up over it. A prebuilt body element sizes itself.
  if (opts.title != null) {
    const titleRow = new UIElement({ height: 30, justifyContent: "center" });
    titleRow.insertChild(
      gemsLabel(opts.title, {
        font: I18n.font("header"),
        color: GemsTheme.text,
      }),
    );
    card.insertChild(titleRow);
    card.insertChild(gemsDivider());
  }
  if (opts.body != null) {
    if (opts.body instanceof UIElement) {
      card.insertChild(opts.body);
    } else {
      const bodyRow = new UIElement({
        height: opts.bodyHeight ?? 28,
        justifyContent: "center",
      });
      bodyRow.insertChild(gemsLabel(opts.body, { color: GemsTheme.textMuted }));
      card.insertChild(bodyRow);
    }
  }

  const buttons = opts.buttons ?? [{ label: "OK", primary: true }];
  const row = new UIElement({
    width: "100%",
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: GemsTheme.gapSm,
  });
  for (const b of buttons) {
    row.insertChild(
      gemsButton(
        b.label,
        () => {
          if (b.onClick) b.onClick(modal);
          if (!b.keepOpen) modal.close();
        },
        { primary: b.primary, width: b.width ?? 120 },
      ),
    );
  }
  card.insertChild(row);

  root.insertChild(card);
  UI.insert(root); // top of the stack → blocks lower roots, draws last
  return modal;
};

// Tabbed view: a tab strip over a fixed-height content host. `tabs` is
// [{ label, content }] — label is a string/() => string, content a prebuilt
// UIElement (e.g. a gemsList). Each content is wrapped in an absolute-positioned
// overlay so all pages stack in the same rect; selecting a tab toggles their
// `enabled` flag (no reflow). The host needs an explicit height (`opts.height`)
// because absolute children don't contribute to it. Returns the root column; the
// UITabs component is on `root.tabs` for programmatic `.select(i)`.
globalThis.gemsTabs = function gemsTabs(tabs, opts = {}) {
  const root = new UIElement({
    width: opts.width ?? "100%",
    gap: opts.gap ?? GemsTheme.gapSm,
  });

  const strip = new UIElement({
    width: "100%",
    height: opts.stripHeight ?? 40,
    flexShrink: 0,
  });

  const host = new UIElement({
    width: "100%",
    height: opts.height ?? 360,
    flexShrink: 0,
  });

  // Wrap each page in an absolute overlay filling the host, so the pages stack
  // (no reflow on switch — only the active overlay is enabled).
  const items = [];
  for (let i = 0; i < tabs.length; i++) {
    const overlay = new UIElement({
      positionType: "absolute",
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    });
    overlay.insertChild(tabs[i].content);
    host.insertChild(overlay);
    items.push({ label: tabs[i].label, content: overlay });
  }

  const tabsComp = new UITabs({
    tabs: items,
    index: opts.index ?? 0,
    onChange: opts.onChange,
    font: opts.font ?? I18n.font("header"),
    color: gemsColor(GemsTheme.text),
    colorIdle: gemsColor(GemsTheme.textMuted),
    colorHover: gemsColor(GemsTheme.text),
    activeBg: gemsColor(GemsTheme.panel),
    accent: gemsColor(GemsTheme.accent),
    border: gemsColor(GemsTheme.border),
  });
  strip.addComponent(tabsComp);

  root.insertChild(strip);
  root.insertChild(host);
  root.tabs = tabsComp;
  return root;
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
