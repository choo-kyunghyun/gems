// ── GemsUI kit: containers ────────────────────────────────────
// Layout/structure factories. See GemsTheme.js for the kit overview + the GMRT
// globalThis-assignment rule (keep new factories in `globalThis.X = function X` form).

// Full-screen scene root: insert it into UI, hang everything else off it.
//
// With `opts.maxWidth`, the content is centered in a column capped at that width — the
// menu look (no full-bleed buttons/sliders on a wide display). The returned wrapper
// stays full-screen (so it's the UI root), but `insertChild` is redirected to the inner
// column, so callers keep doing `root.insertChild(...)` unchanged. Without `maxWidth`,
// it's a plain full-bleed root — what gameplay scenes want (an absolute-positioned HUD
// anchors to the whole screen, not a centered column).
globalThis.gemsRoot = function gemsRoot(opts = {}) {
  if (opts.maxWidth == null) {
    return new UIElement({
      width: "100%",
      height: "100%",
      padding: opts.padding ?? GemsTheme.pad,
      gap: opts.gap ?? GemsTheme.gap,
    });
  }
  const wrap = new UIElement({
    width: "100%",
    height: "100%",
    padding: opts.padding ?? GemsTheme.pad,
    alignItems: "center", // center the content column horizontally
  });
  const col = new UIElement({
    width: "100%",
    maxWidth: opts.maxWidth,
    height: "100%", // fill vertically so a grow scroll can take the middle
    gap: opts.gap ?? GemsTheme.gap,
  });
  wrap.insertChild(col);
  wrap.content = col;
  // Redirect inserts to the centered column (callers treat the wrapper as the root).
  wrap.insertChild = function (child, index) {
    return col.insertChild(child, index);
  };
  return wrap;
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

// Scroll viewport. Insert items into the returned element's `.scrollBody` (a
// flexShrink-0 column that overflows + scrolls); insert the viewport itself into the
// layout. Clips via surface, scrolls via draw-time offset (wheel + drag-thumb) — no
// flex mutation. The keystone for list-heavy scenes given the display/2 GUI clamp.
// `opts.height` fixes the viewport; `opts.grow` instead lets it flex-fill the space
// between siblings (e.g. a menu body between a header and a back button).
globalThis.gemsScroll = function gemsScroll(opts = {}) {
  const body = new UIElement({
    width: "100%",
    flexShrink: 0, // keep natural (tall) height so it can overflow
    gap: opts.gap ?? GemsTheme.gapSm,
    padding: opts.padding ?? 0,
  });
  const viewport = new UIElement(
    opts.grow
      ? { width: opts.width ?? "100%", flexGrow: 1, flexBasis: 0 }
      : {
          width: opts.width ?? "100%",
          height: opts.height ?? 300,
          flexShrink: 0,
        },
  );
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

  // Labels self-size their element (UIText sets width/height in onUpdate, which the
  // flexpanel layout now applies on GMRT 0.20), so a label is inserted directly — no
  // fixed-height wrapper row is needed to stop the button row collapsing over it.
  if (opts.title != null) {
    card.insertChild(
      gemsLabel(opts.title, {
        font: I18n.font("header"),
        color: GemsTheme.text,
      }),
    );
    card.insertChild(gemsDivider());
  }
  if (opts.body != null) {
    if (opts.body instanceof UIElement) {
      card.insertChild(opts.body);
    } else {
      card.insertChild(gemsLabel(opts.body, { color: GemsTheme.textMuted }));
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

// Draggable window: an absolute-positioned card with a title bar you can grab to move
// the whole window (UIDrag → window.dragX/dragY → getLayoutPosition offset, never flex
// mutation), plus an optional close button. Insert content into the returned wrapper's
// `.body` column (e.g. a gemsScroll or fixed-height rows). Toggle visibility via the
// wrapper's `.enabled`. The body's widgets stay UINav-navigable; only the title bar
// drag is mouse-only. `opts`: { left, top, width, titleH, onClose, padding }.
globalThis.gemsWindow = function gemsWindow(title, opts = {}) {
  const wrap = new UIElement({
    positionType: "absolute",
    left: opts.left ?? 40,
    top: opts.top ?? 40,
    width: opts.width ?? 440,
  });

  const card = gemsCard({
    width: "100%",
    padding: opts.padding ?? GemsTheme.padSm,
    gap: GemsTheme.gapSm,
  });

  // Title bar: grab-to-drag (UIDrag moves `wrap`), title label, optional close button.
  const bar = new UIElement({
    width: "100%",
    height: opts.titleH ?? 36,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    gap: GemsTheme.gapSm,
  });
  bar.addComponent(
    new UIPanel({
      color: gemsColor(GemsTheme.panelLo),
      rad: GemsTheme.radiusSm,
      border: 1,
      borderColor: gemsColor(GemsTheme.border),
    }),
  );
  bar.addComponent(new UIDrag({ target: wrap }));
  const labelCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
  labelCell.insertChild(
    gemsLabel(title, { color: GemsTheme.text, font: I18n.font("header") }),
  );
  bar.insertChild(labelCell);
  if (opts.onClose != null) {
    bar.insertChild(
      gemsButton("x", opts.onClose, {
        width: 28,
        height: 28,
        rad: GemsTheme.radiusSm,
      }),
    );
  }
  card.insertChild(bar);

  const body = new UIElement({ width: "100%", gap: GemsTheme.gapSm });
  card.insertChild(body);

  wrap.insertChild(card);
  wrap.body = body;
  return wrap;
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

// Accordion: a vertical stack of collapsible sections. `sections` is
// [{ title, content, open }] — title is a string/() => string, content a prebuilt
// UIElement, open the initial state. Each section is a clickable UIAccordion header
// over a padded body that is inserted/removed on toggle (so the stack reflows to the
// open sections — sections are independent, multiple can be open). Returns the column;
// each header's UIAccordion is reachable for programmatic control if needed.
globalThis.gemsAccordion = function gemsAccordion(sections, opts = {}) {
  const list = new UIElement({
    width: opts.width ?? "100%",
    gap: opts.gap ?? GemsTheme.gapSm,
  });

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const item = new UIElement({ width: "100%", gap: 2 });

    const header = new UIElement({
      width: "100%",
      height: opts.headerHeight ?? GemsTheme.rowH,
      flexShrink: 0,
    });
    const acc = new UIAccordion({
      title: s.title,
      expanded: s.open ?? false,
      onToggle: opts.onToggle,
      font: opts.font ?? I18n.font("header"),
      rad: GemsTheme.radiusSm,
      titleColor: gemsColor(GemsTheme.text),
      headerColor: gemsColor(GemsTheme.btn),
      headerHover: gemsColor(GemsTheme.btnHover),
      chevronColor: gemsColor(GemsTheme.textMuted),
      chevronHover: gemsColor(GemsTheme.accent),
    });
    header.addComponent(acc);

    // Padded body; the component inserts/removes this whole wrapper on toggle.
    const body = gemsPanel({
      color: GemsTheme.panelLo,
      rad: GemsTheme.radiusSm,
      padding: GemsTheme.padSm,
    });
    body.insertChild(s.content);
    acc.body = body;

    item.insertChild(header);
    if (acc.expanded) item.insertChild(body);
    list.insertChild(item);
  }

  return list;
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

// Titled card section. A divider under the title separates it from the body. The
// title label self-sizes (UIText sets the element height in onUpdate, applied by the
// flexpanel layout on GMRT 0.20), so it's inserted directly above the divider.
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

// Label + control on one line — a real two-column row (label cell | control cell), not
// a stack: the label sits in a fixed-width left cell and the control fills the rest,
// with `alignItems: center` lining them up vertically. (The fixed-width cell is a
// layout choice, not a self-size workaround — the label self-sizes within it.)
globalThis.gemsRow = function gemsRow(label, control, opts = {}) {
  const row = new UIElement({
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: opts.gap ?? GemsTheme.gap,
  });
  const labelCell = new UIElement({
    width: opts.labelWidth ?? GemsTheme.rowLabelW,
    flexShrink: 0,
  });
  labelCell.insertChild(
    gemsLabel(label, { color: opts.labelColor ?? GemsTheme.textMuted }),
  );
  const ctrlCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
  ctrlCell.insertChild(control);
  row.insertChild(labelCell);
  row.insertChild(ctrlCell);
  return row;
};
