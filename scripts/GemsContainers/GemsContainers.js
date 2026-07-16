// ── GemsUI kit: containers ───────────────────────────────────
// Layout/structure factories. Keep new factories as `globalThis.X = function X` — GMRT globalThis rule.

// Full-screen scene root. With `opts.maxWidth`, content is centered in a capped column
// (menu look); `insertChild` is redirected to the inner column so callers are unaffected.
// Without `maxWidth`, plain full-bleed — for HUDs that must anchor to the whole screen.
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
    alignItems: "center",
  });
  const col = new UIElement({
    width: "100%",
    maxWidth: opts.maxWidth,
    height: "100%",
    gap: opts.gap ?? GemsTheme.gap,
  });
  wrap.insertChild(col);
  wrap.content = col;
  // redirect inserts so callers treat the wrapper as the root
  wrap.insertChild = function (child, index) {
    return col.insertChild(child, index);
  };
  return wrap;
};

// Vertical stack.
globalThis.gemsList = function gemsList(opts = {}) {
  return new UIElement({
    width: opts.width ?? "100%",
    padding: opts.padding ?? 0,
    gap: opts.gap ?? GemsTheme.gapSm,
  });
};

// Horizontal wrapping row — button bars / icon grids.
globalThis.gemsGrid = function gemsGrid(opts = {}) {
  return new UIElement({
    width: opts.width ?? "100%",
    gap: opts.gap ?? GemsTheme.gapSm,
    flexDirection: "row",
    flexWrap: "wrap",
  });
};

// Bare rounded panel. gemsCard adds shadow + border.
globalThis.gemsPanel = function gemsPanel(opts = {}) {
  const el = new UIElement({
    width: opts.width ?? "100%",
    padding: opts.padding ?? GemsTheme.pad,
    gap: opts.gap ?? GemsTheme.gapSm,
    flexGrow: opts.flexGrow ?? 0,
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
    flexGrow: opts.flexGrow,
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

// Sprite-skinned panel — gemsPanel's content box over a nine-slice sprite frame
// (spr_uibox default) instead of a drawn roundrect, so the kit can wear hand-drawn
// skins. `color` tints the frame (theme key / hex / int).
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

// Scroll viewport. Add items to the returned element's `.scrollBody`; insert the
// viewport into the layout. Clips via surface, scrolls via draw-time offset — no flex
// mutation. `opts.height` fixes the viewport; `opts.grow` flex-fills between siblings.
globalThis.gemsScroll = function gemsScroll(opts = {}) {
  // reserve the scrollbar gutter as right padding so right-aligned children lay out LEFT
  // of the bar (the clip drops this same gutter); must mirror UIScroll.clipInsetRight =
  // barW + barPad*2 (barPad defaults to 4).
  const gutter = (opts.barW ?? 8) + 8;
  const body = new UIElement({
    width: "100%",
    flexShrink: 0, // keep natural (tall) height so it can overflow
    gap: opts.gap ?? GemsTheme.gapSm,
    padding: opts.padding ?? 0,
    paddingRight: Math.max(opts.padding ?? 0, gutter),
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

// Modal dialog: dimmed full-screen root + centered card (title, body, right-aligned
// button row). Each button runs onClick then closes unless `keepOpen`. Returns the
// UIModal handle (`.close()`); also closes on Escape / backdrop click. `opts`: { title,
// body, buttons:[{label, onClick, primary, keepOpen, width}], width, dim,
// closeOnBackdrop, closeOnEscape }.
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
  // swallow card clicks so they don't read as a backdrop dismiss
  card.addComponent(new UITrigger({}));

  // labels self-size (UIText sets width/height in onUpdate, applied by flexpanel on
  // GMRT 0.20), so insert directly — no fixed-height wrapper row needed.
  if (opts.title != null) {
    card.insertChild(
      gemsLabel(opts.title, {
        font: "header",
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

// Near-fullscreen overlay window — gemsModal's non-modal sibling for the big gameplay
// windows (bag / workbench / chest / trade). Absolute dim host that veils the HUD, a
// centered full-height card capped for ultra-wide, and a title row (title + close "x")
// over a divider. Built ONCE and toggled via `.enabled` (starts hidden) so rebuilt-in-place
// content keeps sort/filter/selection; the caller inserts it into its scene root itself.
// Content goes into the returned host's `.body` (the card, under the divider); callers
// needing extra title-row items (TradeUI's credits) insert into `.titleRow` before its
// close button. `opts`: { onClose, maxWidth }.
globalThis.gemsOverlay = function gemsOverlay(title, opts = {}) {
  // absolute → fills the screen ignoring the scene root's padding; 28px margin around the card.
  const host = new UIElement({
    positionType: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    padding: 28,
    alignItems: "center",
  });
  host.addComponent(new UIPanel({ color: gemsColor("#000000"), alpha: 0.72 }));
  host.addComponent(new UITrigger({})); // swallow backdrop clicks so they don't reach the world
  host.enabled = false; // owner shows/hides via .enabled

  // full-height card, capped on ultra-wide displays
  const inner = new UIElement({
    width: "100%",
    maxWidth: opts.maxWidth ?? 1100,
    height: "100%",
  });
  const card = gemsCard({
    width: "100%",
    flexGrow: 1,
    padding: GemsTheme.pad,
    gap: GemsTheme.gapSm,
  });

  // title (in a growing cell so extra items + the close "x" sit right) + divider.
  const titleRow = new UIElement({
    width: "100%",
    height: 40,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: GemsTheme.gapSm,
  });
  const titleCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
  titleCell.insertChild(
    gemsLabel(title, { font: "header", color: GemsTheme.text }),
  );
  titleRow.insertChild(titleCell);
  if (opts.onClose != null) {
    titleRow.insertChild(
      gemsButton("x", opts.onClose, {
        width: 32,
        height: 32,
        rad: GemsTheme.radiusSm,
      }),
    );
  }
  card.insertChild(titleRow);
  card.insertChild(gemsDivider());

  inner.insertChild(card);
  host.insertChild(inner);
  host.body = card; // content lands under the title row
  host.titleRow = titleRow;
  return host;
};

// Draggable window: a grab-to-move card (UIDrag → offset, never flex mutation) + an
// optional close button. Add content to the wrapper's `.body`; toggle visibility via
// `.enabled`. `opts`: { left, top, width, titleH, onClose, padding }.
globalThis.gemsWindow = function gemsWindow(title, opts = {}) {
  // out-of-flow host that centers the window and re-centers on a GUI resize (live
  // uiScale), so callers don't compute a stale absolute left from gui width
  const host = new UIElement({
    positionType: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingTop: opts.top ?? 40,
  });

  // resizable by default (bottom-right grip; opt out with resizable:false). UIResize
  // mutates width/height live so card + body flex-grow to fill; `opts.height` fixes the
  // start size (needed when content itself flex-grows), else content-sized until first resize.
  const resizable = opts.resizable !== false;

  // the window: a relative flow child centered by the host; UIDrag offsets dragX/dragY at
  // draw time so a drag survives a re-center
  const wrapStyle = { width: opts.width ?? 440, flexShrink: 0 };
  if (opts.height != null) wrapStyle.height = opts.height;
  const wrap = new UIElement(wrapStyle);

  const card = gemsCard({
    width: "100%",
    flexGrow: resizable ? 1 : 0,
    padding: opts.padding ?? GemsTheme.padSm,
    gap: GemsTheme.gapSm,
  });

  // title bar: grab-to-drag, title label, optional close button
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
    gemsLabel(title, { color: GemsTheme.text, font: "header" }),
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

  const body = new UIElement({
    width: "100%",
    gap: GemsTheme.gapSm,
    flexGrow: resizable ? 1 : 0,
  });
  card.insertChild(body);

  wrap.insertChild(card);

  // resize grip pinned bottom-right; added LAST so it updates first (children update in
  // reverse → input priority over the body) and draws on top
  if (resizable) {
    const grip = new UIElement({
      positionType: "absolute",
      right: 0,
      bottom: 0,
      width: 20,
      height: 20,
    });
    grip.addComponent(
      new UIResize({
        target: wrap,
        minWidth: opts.minWidth ?? 240,
        minHeight: opts.minHeight ?? 160,
        color: gemsColor(GemsTheme.textMuted),
        anchorCenterX: true, // host centers `wrap` — resize from the left edge too
      }),
    );
    wrap.insertChild(grip);
  }

  host.insertChild(wrap);
  host.body = body; // callers add content here
  return host;
};

// Tabbed view: tab strip over a content host. `tabs` is [{ label, content }]. Pages
// stack as absolute overlays in one rect; selecting toggles `enabled` (no reflow).
// Pass `opts.height` to fix the host, or `opts.grow: true` to flex-fill (reflows on a
// GUI resize — pair with `gemsScroll({ grow: true })`). UITabs is on `root.tabs`.
globalThis.gemsTabs = function gemsTabs(tabs, opts = {}) {
  const root = new UIElement(
    opts.grow
      ? {
          width: opts.width ?? "100%",
          flexGrow: 1,
          flexBasis: 0,
          gap: opts.gap ?? GemsTheme.gapSm,
        }
      : { width: opts.width ?? "100%", gap: opts.gap ?? GemsTheme.gapSm },
  );

  const strip = new UIElement({
    width: "100%",
    height: opts.stripHeight ?? 40,
    flexShrink: 0,
  });

  const host = new UIElement(
    opts.grow
      ? { width: "100%", flexGrow: 1, flexBasis: 0 }
      : { width: "100%", height: opts.height ?? 360, flexShrink: 0 },
  );

  // wrap each page in an absolute overlay so they stack (no reflow on switch)
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
    font: opts.font ?? "header",
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

// Accordion: a stack of collapsible sections. `sections` is [{ title, content, open }].
// Each header's body is inserted/removed on toggle so the stack reflows; sections are
// independent (multiple can be open).
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
      font: opts.font ?? "header",
      rad: GemsTheme.radiusSm,
      titleColor: gemsColor(GemsTheme.text),
      headerColor: gemsColor(GemsTheme.btn),
      headerHover: gemsColor(GemsTheme.btnHover),
      chevronColor: gemsColor(GemsTheme.textMuted),
      chevronHover: gemsColor(GemsTheme.accent),
    });
    header.addComponent(acc);

    // padded body; the component inserts/removes this wrapper on toggle
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

// Category bar with a pop-up flyout — category buttons; clicking one toggles a flyout
// of its items above the bar (one open at a time). Shared by the RPG build HUD + level
// editor palette.
//
// `categories` = [{ label, items: [{ label, onSelect?, disabled?, tooltip? }] }]. opts:
//   onSelect(catIdx, itemIdx, item)  global hook after the item's own onSelect
//   selCat / selItem                 initial highlighted item (default 0 / 0)
//   width, barHeight, itemWidth, itemHeight, font
//
// Returns the root (flyout host on top, bar below) — the caller anchors it (a bottom
// anchor keeps the bar pinned and pops the list upward). Flyouts are prebuilt once and
// driven by structural insert/remove (the reliable-reflow pattern).
// `root.catbar` exposes { state, open(c), close(), select(c, k) }.
globalThis.gemsCatBar = function gemsCatBar(categories, opts = {}) {
  const itemW = opts.itemWidth ?? 130;
  const itemH = opts.itemHeight ?? 40;
  const state = {
    open: -1,
    selCat: opts.selCat ?? 0,
    selItem: opts.selItem ?? 0,
  };

  const root = new UIElement({
    width: opts.width ?? 720,
    gap: GemsTheme.gapSm,
  });

  // flyout host above the bar; the active category's prebuilt card is inserted here
  const host = new UIElement({ width: "100%" });

  // prebuild one flyout card per category — a wrapping row of item buttons
  const flyouts = [];
  for (let c = 0; c < categories.length; c++) {
    const items = categories[c].items;
    const card = gemsCard({ padding: GemsTheme.padSm, gap: GemsTheme.gapSm });
    const grid = new UIElement({
      width: "100%",
      gap: GemsTheme.gapSm,
      flexDirection: "row",
      flexWrap: "wrap",
    });
    for (let k = 0; k < items.length; k++) {
      const it = items[k];
      const ci = c;
      const ki = k;
      const cell = new UIElement({
        width: itemW,
        height: itemH,
        flexShrink: 0,
      });
      cell.insertChild(
        gemsButton(
          it.label,
          () => {
            state.selCat = ci;
            state.selItem = ki;
            if (it.onSelect !== undefined) it.onSelect();
            if (opts.onSelect !== undefined) opts.onSelect(ci, ki, it);
          },
          {
            height: itemH,
            disabled: it.disabled,
            tooltip: it.tooltip,
            selected: () => state.selCat === ci && state.selItem === ki,
          },
        ),
      );
      grid.insertChild(cell);
    }
    card.insertChild(grid);
    flyouts.push(card);
  }

  // Toggle a category's flyout: close if it's the open one, else swap in its card.
  const toggle = (c) => {
    if (state.open === c) {
      host.removeChild(flyouts[c]);
      state.open = -1;
    } else {
      if (state.open !== -1) host.removeChild(flyouts[state.open]);
      host.insertChild(flyouts[c]);
      state.open = c;
    }
  };

  // Category bar — equal-width buttons (flexGrow split) that toggle their flyout.
  const bar = new UIElement({
    width: "100%",
    height: opts.barHeight ?? GemsTheme.rowH,
    flexDirection: "row",
    gap: GemsTheme.gapSm,
    flexShrink: 0,
  });
  for (let c = 0; c < categories.length; c++) {
    const ci = c;
    const cell = new UIElement({ flexGrow: 1, flexBasis: 0, height: "100%" });
    cell.insertChild(
      gemsButton(categories[c].label, () => toggle(ci), {
        font: opts.font ?? "header",
        selected: () => state.open === ci,
      }),
    );
    bar.insertChild(cell);
  }

  root.insertChild(host);
  root.insertChild(bar);
  root.catbar = {
    state,
    open: toggle,
    close: () => {
      if (state.open !== -1) {
        host.removeChild(flyouts[state.open]);
        state.open = -1;
      }
    },
    select: (c, k) => {
      state.selCat = c;
      state.selItem = k;
    },
  };
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

// Titled card section with a divider under the title. The title self-sizes (UIText sets
// height in onUpdate, applied by flexpanel on GMRT 0.20), so it's inserted directly.
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

// Label + control on one line — a two-column row (fixed-width label cell | control fills
// the rest), vertically centered.
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
