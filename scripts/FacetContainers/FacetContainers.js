// See FacetTheme.js for the kit overview + the GMRT globalThis-assignment rule.

/**
 * Full-screen scene root. With `opts.maxWidth`, content is centered in a capped column
 * (menu look); `insertChild` is redirected to the inner column so callers are unaffected.
 * Without `maxWidth`, plain full-bleed — for HUDs that must anchor to the whole screen.
 */
globalThis.facetRoot = function facetRoot(opts = {}) {
  if (opts.maxWidth == null) {
    return new UIElement({
      width: "100%",
      height: "100%",
      padding: opts.padding ?? FacetTheme.pad,
      gap: opts.gap ?? FacetTheme.gap,
    });
  }
  const wrap = new UIElement({
    width: "100%",
    height: "100%",
    padding: opts.padding ?? FacetTheme.pad,
    alignItems: "center",
  });
  const col = new UIElement({
    width: "100%",
    maxWidth: opts.maxWidth,
    height: "100%",
    gap: opts.gap ?? FacetTheme.gap,
  });
  wrap.insertChild(col);
  wrap.content = col;
  // redirect inserts so callers treat the wrapper as the root
  wrap.insertChild = function (child, index) {
    return col.insertChild(child, index);
  };
  return wrap;
};

/** Vertical stack. */
globalThis.facetList = function facetList(opts = {}) {
  return new UIElement({
    width: opts.width ?? "100%",
    padding: opts.padding ?? 0,
    gap: opts.gap ?? FacetTheme.gapSm,
  });
};

/** Horizontal wrapping row — button bars / icon grids. */
globalThis.facetGrid = function facetGrid(opts = {}) {
  return new UIElement({
    width: opts.width ?? "100%",
    gap: opts.gap ?? FacetTheme.gapSm,
    flexDirection: "row",
    flexWrap: "wrap",
  });
};

/** Bare rounded panel. facetCard adds shadow + border. */
globalThis.facetPanel = function facetPanel(opts = {}) {
  const el = new UIElement({
    width: opts.width ?? "100%",
    padding: opts.padding ?? FacetTheme.pad,
    gap: opts.gap ?? FacetTheme.gapSm,
    flexGrow: opts.flexGrow ?? 0,
  });
  el.addComponent(
    new UIPanel({
      color: facetColor(opts.color ?? FacetTheme.panel),
      color2: opts.color2 != null ? facetColor(opts.color2) : undefined,
      rad: opts.rad ?? FacetTheme.radius,
      border: opts.border ?? 0,
      borderColor: facetColor(opts.borderColor ?? FacetTheme.border),
      shadow: opts.shadow ?? 0,
      highlight: opts.highlight ?? 0,
    }),
  );
  return el;
};

/** Raised panel: vignette edge + inner top bevel + 1px border + soft shadow. */
globalThis.facetCard = function facetCard(opts = {}) {
  return facetPanel({
    width: opts.width,
    flexGrow: opts.flexGrow,
    padding: opts.padding,
    gap: opts.gap,
    color: opts.color,
    color2: opts.color2 ?? FacetTheme.panelLo,
    rad: opts.rad,
    border: opts.border ?? 1,
    borderColor: opts.borderColor,
    shadow: opts.shadow ?? 10,
    highlight: opts.highlight ?? 1,
  });
};

/**
 * Sprite-skinned panel — facetPanel's content box over a nine-slice sprite frame
 * (pixUiBox default) instead of a drawn roundrect, so the kit can wear hand-drawn
 * skins. `color` tints the frame (theme key / hex / int).
 */
globalThis.facetNineSlice = function facetNineSlice(opts = {}) {
  const el = new UIElement({
    width: opts.width ?? "100%",
    padding: opts.padding ?? FacetTheme.pad,
    gap: opts.gap ?? FacetTheme.gapSm,
  });
  el.addComponent(
    new UINineSlice({
      sprite: opts.sprite ?? asset_get_index("pixUiBox"),
      subimg: opts.subimg ?? 0,
      color: opts.color != null ? facetColor(opts.color) : c_white,
      alpha: opts.alpha ?? 1,
    }),
  );
  return el;
};

/**
 * Scroll viewport. Add items to the returned element's `.scrollBody`; insert the
 * viewport into the layout. Clips via surface, scrolls via draw-time offset — no flex
 * mutation. `opts.height` fixes the viewport; `opts.grow` flex-fills between siblings.
 */
globalThis.facetScroll = function facetScroll(opts = {}) {
  // reserve the scrollbar gutter as right padding so right-aligned children lay out LEFT
  // of the bar (the clip drops this same gutter); must mirror UIScroll.clipInsetRight =
  // barW + barPad*2 (barPad defaults to 4).
  const gutter = (opts.barW ?? 8) + 8;
  const body = new UIElement({
    width: "100%",
    flexShrink: 0, // keep natural (tall) height so it can overflow
    gap: opts.gap ?? FacetTheme.gapSm,
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
      trackColor: facetColor(opts.trackColor ?? FacetTheme.panelLo),
      thumbColor: facetColor(opts.thumbColor ?? FacetTheme.border),
      thumbHover: facetColor(opts.thumbHover ?? FacetTheme.borderHi),
    }),
  );
  viewport.scrollBody = body; // callers add items here
  return viewport;
};

/**
 * Modal dialog: dimmed full-screen root + centered card (title, body, right-aligned
 * button row). Each button runs onClick then closes unless `keepOpen`. Returns the
 * UIModal handle (`.close()`); also closes on Escape / backdrop click. `opts`: { title,
 * body, buttons:[{label, onClick, primary, keepOpen, width}], width, dim,
 * closeOnBackdrop, closeOnEscape }.
 */
globalThis.facetModal = function facetModal(opts = {}) {
  const root = new UIElement({
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  });
  root.addComponent(
    new UIPanel({
      color: facetColor(opts.dimColor ?? "#000000"),
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

  const card = facetCard({ width: opts.width ?? 440 });
  // swallow card clicks so they don't read as a backdrop dismiss
  card.addComponent(new UITrigger({}));

  // labels self-size (UIText sets width/height in onUpdate, applied by flexpanel on
  // GMRT 0.20), so insert directly — no fixed-height wrapper row needed.
  if (opts.title != null) {
    card.insertChild(
      facetLabel(opts.title, {
        font: "header",
        color: FacetTheme.text,
      }),
    );
    card.insertChild(facetDivider());
  }
  if (opts.body != null) {
    if (opts.body instanceof UIElement) {
      card.insertChild(opts.body);
    } else {
      card.insertChild(facetLabel(opts.body, { color: FacetTheme.textMuted }));
    }
  }

  const buttons = opts.buttons ?? [{ label: "OK", primary: true }];
  const row = new UIElement({
    width: "100%",
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: FacetTheme.gapSm,
  });
  for (const b of buttons) {
    row.insertChild(
      facetButton(
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

/**
 * Near-fullscreen overlay window — facetModal's non-modal sibling for the big gameplay
 * windows (bag / workbench / chest / trade). Absolute dim host that veils the HUD, a
 * centered full-height card capped for ultra-wide, and a title row (title + close "x")
 * over a divider. Built ONCE and toggled via `.enabled` (starts hidden) so rebuilt-in-place
 * content keeps sort/filter/selection; the caller inserts it into its scene root itself.
 * Content goes into the returned host's `.body` (the card, under the divider); callers
 * needing extra title-row items (TradeUI's credits) insert into `.titleRow` before its
 * close button. `opts`: { onClose, maxWidth }.
 */
globalThis.facetOverlay = function facetOverlay(title, opts = {}) {
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
  host.addComponent(new UIPanel({ color: facetColor("#000000"), alpha: 0.72 }));
  host.addComponent(new UITrigger({})); // swallow backdrop clicks so they don't reach the world
  host.enabled = false; // owner shows/hides via .enabled

  // full-height card, capped on ultra-wide displays
  const inner = new UIElement({
    width: "100%",
    maxWidth: opts.maxWidth ?? 1100,
    height: "100%",
  });
  const card = facetCard({
    width: "100%",
    flexGrow: 1,
    padding: FacetTheme.pad,
    gap: FacetTheme.gapSm,
  });

  // title (in a growing cell so extra items + the close "x" sit right) + divider.
  const titleRow = new UIElement({
    width: "100%",
    height: 40,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: FacetTheme.gapSm,
  });
  const titleCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
  titleCell.insertChild(
    facetLabel(title, { font: "header", color: FacetTheme.text }),
  );
  titleRow.insertChild(titleCell);
  if (opts.onClose != null) {
    titleRow.insertChild(
      facetButton("x", opts.onClose, {
        width: 32,
        height: 32,
        rad: FacetTheme.radiusSm,
      }),
    );
  }
  card.insertChild(titleRow);
  card.insertChild(facetDivider());

  inner.insertChild(card);
  host.insertChild(inner);
  host.body = card; // content lands under the title row
  host.titleRow = titleRow;
  return host;
};

/**
 * Tabbed view: tab strip over a content host — or, with `opts.vertical`, a narrow strip
 * down its left (the VSCode activity-bar shape; `stripWidth`/`segment` size it). `tabs` is
 * [{ label, content, short }] — a `short` abbreviation is drawn in the strip and the full
 * label becomes its hover tooltip (see UITabs). Pages stack as absolute overlays in one
 * rect; selecting toggles `enabled` (no reflow). Pass `opts.height` to fix the host, or
 * `opts.grow: true` to flex-fill (reflows on a GUI resize — pair with
 * `facetScroll({ grow: true })`). UITabs is on `root.tabs`.
 */
globalThis.facetTabs = function facetTabs(tabs, opts = {}) {
  const vertical = opts.vertical ?? false;
  const rootStyle = opts.grow
    ? {
        width: opts.width ?? "100%",
        flexGrow: 1,
        flexBasis: 0,
        gap: opts.gap ?? FacetTheme.gapSm,
      }
    : { width: opts.width ?? "100%", gap: opts.gap ?? FacetTheme.gapSm };
  if (vertical) rootStyle.flexDirection = "row"; // strip | pages
  const root = new UIElement(rootStyle);

  const strip = new UIElement(
    vertical
      ? { width: opts.stripWidth ?? 64, height: "100%", flexShrink: 0 }
      : { width: "100%", height: opts.stripHeight ?? 40, flexShrink: 0 },
  );

  // vertical: the pages take the remaining width; a fixed `opts.height` still applies
  const hostStyle = vertical
    ? { flexGrow: 1, flexBasis: 0 }
    : { width: "100%" };
  if (opts.grow) {
    if (vertical) hostStyle.height = "100%";
    else {
      hostStyle.flexGrow = 1;
      hostStyle.flexBasis = 0;
    }
  } else {
    hostStyle.height = opts.height ?? 360;
    hostStyle.flexShrink = 0;
  }
  const host = new UIElement(hostStyle);

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
    items.push({ label: tabs[i].label, short: tabs[i].short, content: overlay });
  }

  const tabsComp = new UITabs({
    tabs: items,
    index: opts.index ?? 0,
    onChange: opts.onChange,
    vertical,
    segment: opts.segment,
    tipDelay: opts.tooltipDelay,
    font: opts.font ?? "header",
    color: facetColor(FacetTheme.text),
    colorIdle: facetColor(FacetTheme.textMuted),
    colorHover: facetColor(FacetTheme.text),
    activeBg: facetColor(FacetTheme.panel),
    accent: facetColor(FacetTheme.accent),
    border: facetColor(FacetTheme.border),
  });
  strip.addComponent(tabsComp);

  root.insertChild(strip);
  root.insertChild(host);
  root.tabs = tabsComp;
  return root;
};

/**
 * Accordion: a stack of collapsible sections. `sections` is [{ title, content, open }].
 * Each header's body is inserted/removed on toggle so the stack reflows; sections are
 * independent (multiple can be open).
 */
globalThis.facetAccordion = function facetAccordion(sections, opts = {}) {
  const list = new UIElement({
    width: opts.width ?? "100%",
    gap: opts.gap ?? FacetTheme.gapSm,
  });

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const item = new UIElement({ width: "100%", gap: 2 });

    const header = new UIElement({
      width: "100%",
      height: opts.headerHeight ?? FacetTheme.rowH,
      flexShrink: 0,
    });
    const acc = new UIAccordion({
      title: s.title,
      expanded: s.open ?? false,
      onToggle: opts.onToggle,
      font: opts.font ?? "header",
      rad: FacetTheme.radiusSm,
      titleColor: facetColor(FacetTheme.text),
      headerColor: facetColor(FacetTheme.btn),
      headerHover: facetColor(FacetTheme.btnHover),
      chevronColor: facetColor(FacetTheme.textMuted),
      chevronHover: facetColor(FacetTheme.accent),
    });
    header.addComponent(acc);

    // padded body; the component inserts/removes this wrapper on toggle
    const body = facetPanel({
      color: FacetTheme.panelLo,
      rad: FacetTheme.radiusSm,
      padding: FacetTheme.padSm,
    });
    body.insertChild(s.content);
    acc.body = body;

    item.insertChild(header);
    if (acc.expanded) item.insertChild(body);
    list.insertChild(item);
  }

  return list;
};

/**
 * Category bar with a pop-up flyout — category buttons; clicking one toggles a flyout
 * of its items above the bar (one open at a time). Shared by the colony build HUD + scene
 * editor palette.
 *
 * `categories` = [{ label, items: [{ label, onSelect?, disabled?, tooltip? }] }]. opts:
 *   onSelect(catIdx, itemIdx, item)  global hook after the item's own onSelect
 *   selCat / selItem                 initial highlighted item (default 0 / 0)
 *   width, barHeight, itemWidth, itemHeight, font
 *
 * Returns the root (flyout host on top, bar below) — the caller anchors it (a bottom
 * anchor keeps the bar pinned and pops the list upward). Flyouts are prebuilt once and
 * driven by structural insert/remove, not flex mutation (the layout rule at UIElement).
 * `root.catbar` exposes { state, open(c), close(), select(c, k) }.
 */
globalThis.facetCatBar = function facetCatBar(categories, opts = {}) {
  const itemW = opts.itemWidth ?? 130;
  const itemH = opts.itemHeight ?? 40;
  const state = {
    open: -1,
    selCat: opts.selCat ?? 0,
    selItem: opts.selItem ?? 0,
  };

  const root = new UIElement({
    width: opts.width ?? 720,
    gap: FacetTheme.gapSm,
  });

  // flyout host above the bar; the active category's prebuilt card is inserted here
  const host = new UIElement({ width: "100%" });

  // prebuild one flyout card per category — a wrapping row of item buttons
  const flyouts = [];
  for (let c = 0; c < categories.length; c++) {
    const items = categories[c].items;
    const card = facetCard({ padding: FacetTheme.padSm, gap: FacetTheme.gapSm });
    const grid = new UIElement({
      width: "100%",
      gap: FacetTheme.gapSm,
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
        facetButton(
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
    height: opts.barHeight ?? FacetTheme.rowH,
    flexDirection: "row",
    gap: FacetTheme.gapSm,
    flexShrink: 0,
  });
  for (let c = 0; c < categories.length; c++) {
    const ci = c;
    const cell = new UIElement({ flexGrow: 1, flexBasis: 0, height: "100%" });
    cell.insertChild(
      facetButton(categories[c].label, () => toggle(ci), {
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

/** Header / title bar. */
globalThis.facetHeader = function facetHeader(title, opts = {}) {
  const bar = new UIElement({
    width: "100%",
    height: opts.height ?? FacetTheme.headerH,
    paddingHorizontal: 20,
    paddingVertical: 8,
    justifyContent: "center",
  });
  bar.addComponent(
    new UIPanel({
      color: facetColor(FacetTheme.panel),
      color2: facetColor(FacetTheme.panelLo),
      rad: FacetTheme.radius,
      border: 1,
      borderColor: facetColor(FacetTheme.border),
      shadow: opts.shadow ?? 8,
      highlight: 1,
      highlightAlpha: 0.08,
    }),
  );
  bar.insertChild(
    facetLabel(title, {
      color: opts.color ?? FacetTheme.text,
      halign: opts.halign ?? fa_left,
      font: opts.font,
    }),
  );
  return bar;
};

/**
 * Titled card section with a divider under the title. The title self-sizes (UIText sets
 * height in onUpdate, applied by flexpanel on GMRT 0.20), so it's inserted directly.
 */
globalThis.facetSection = function facetSection(title, opts = {}) {
  const section = facetCard({
    padding: FacetTheme.padSm,
    gap: FacetTheme.gapSm,
    shadow: opts.shadow ?? 4,
  });
  if (title != null) {
    section.insertChild(facetLabel(title, { color: FacetTheme.textMuted }));
    section.insertChild(facetDivider());
  }
  return section;
};

/** Thin horizontal rule. */
globalThis.facetDivider = function facetDivider(opts = {}) {
  const el = new UIElement({ width: "100%", height: opts.thickness ?? 2 });
  el.addComponent(
    new UIPanel({ color: facetColor(opts.color ?? FacetTheme.border), rad: 1 }),
  );
  return el;
};

/**
 * Label + control on one line — a two-column row (fixed-width label cell | control fills
 * the rest), vertically centered. `opts.key` names the Settings key (or keys) the control
 * writes — or is a `() => boolean` for a control bound elsewhere — marking the label while it
 * differs from its default.
 */
globalThis.facetRow = function facetRow(label, control, opts = {}) {
  const row = new UIElement({
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: opts.gap ?? FacetTheme.gap,
  });
  const labelCell = new UIElement({
    width: opts.labelWidth ?? FacetTheme.rowLabelW,
    flexShrink: 0,
  });
  labelCell.insertChild(
    facetLabel(facetSettingsRef(label, opts.key), {
      color: opts.labelColor ?? FacetTheme.textMuted,
    }),
  );
  const ctrlCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
  ctrlCell.insertChild(control);
  row.insertChild(labelCell);
  row.insertChild(ctrlCell);
  return row;
};
