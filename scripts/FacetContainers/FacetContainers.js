/**
 * Full-screen scene root. Flow content goes into `.body` — a full-bleed column inside the screen
 * padding, or a centered capped column with `opts.maxWidth`. An absolute overlay that anchors to
 * the whole screen is inserted into the root itself, where the padding does not reach it.
 */
globalThis.facetRoot = function facetRoot(opts = {}) {
  const root = new UIElement({
    width: "100%",
    height: "100%",
    padding: opts.padding ?? FacetTheme.pad,
    alignItems: "center",
  });
  const style = {
    width: "100%",
    height: "100%",
    gap: opts.gap ?? FacetTheme.gap,
  };
  if (opts.maxWidth != null) style.maxWidth = opts.maxWidth;
  const body = new UIElement(style);
  root.insertChild(body);
  root.body = body;
  return root;
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

/** Bare rounded panel — an opaque, borderless fill (a well, with `color: panelLo`). */
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
      alpha: opts.alpha ?? 1,
      rad: opts.rad ?? FacetTheme.radius,
      border: opts.border ?? 0,
      borderColor: facetColor(opts.borderColor ?? FacetTheme.border),
    }),
  );
  return el;
};

/**
 * Card: the bordered, translucent pane that fronts the world. Never nest one in another;
 * `opts.alpha: 1` for a card that floats over other UI (a popup).
 */
globalThis.facetCard = function facetCard(opts = {}) {
  return facetPanel({
    width: opts.width,
    flexGrow: opts.flexGrow,
    padding: opts.padding,
    gap: opts.gap,
    color: opts.color,
    alpha: opts.alpha ?? FacetTheme.cardAlpha,
    rad: opts.rad,
    border: opts.border ?? 1,
    borderColor: opts.borderColor,
  });
};

/**
 * Sprite-skinned panel: a content box over a nine-slice sprite frame instead of a drawn
 * roundrect. The corner-safe stretch comes from the sprite's IDE nine-slice data. `color` tints
 * the frame (theme key / hex / int); `speed` (frames/sec) overrides the sprite's playback speed.
 */
globalThis.facetNineSlice = function facetNineSlice(opts = {}) {
  const el = new UIElement({
    width: opts.width ?? "100%",
    padding: opts.padding ?? FacetTheme.pad,
    gap: opts.gap ?? FacetTheme.gapSm,
  });
  el.addComponent(
    new UIImage({
      sprite: opts.sprite ?? pixUiBox,
      subimg: opts.subimg ?? 0,
      color: opts.color != null ? facetColor(opts.color) : c_white,
      alpha: opts.alpha ?? 1,
      speed: opts.speed,
    }),
  );
  return el;
};

/**
 * Scroll viewport. Items go into `.scrollBody`. Scrolls by draw-time offset, never flex mutation.
 * `opts.height` fixes the viewport; `opts.grow` flex-fills between siblings.
 */
globalThis.facetScroll = function facetScroll(opts = {}) {
  // right padding reserves the scrollbar gutter so right-aligned children lay out left of the
  // bar; it must equal the scroll clip's right inset (barW + twice the default 4px bar padding)
  const gutter = (opts.barW ?? 8) + 8;
  const body = new UIElement({
    width: "100%",
    flexShrink: 0, // keeps its natural height so it can overflow
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
  viewport.scrollBody = body;
  return viewport;
};

/**
 * Modal dialog: a dimmed full-screen root over a centered card. Each button runs its onClick
 * then closes unless `keepOpen`. Returns the {UIModal} handle.
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
  UI.insert(root); // top of the stack, so it blocks lower roots
  return modal;
};

/**
 * Non-modal near-fullscreen window: a dim host over a centered 16:9 card under a title row.
 * Built once and toggled via `.enabled` (starts hidden) so its content keeps its state; the
 * caller inserts it into its scene root. Content goes into `.body`; extra title-row items go
 * into `.titleRow`, before the close button.
 */
globalThis.facetOverlay = function facetOverlay(title, opts = {}) {
  // absolute, so it fills the screen past the scene root's padding
  const host = new UIElement({
    positionType: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    paddingLeft: 96,
    paddingRight: 96,
    justifyContent: "center",
    alignItems: "center",
  });
  // a light veil: the card is translucent, so the world stays legible behind the window
  host.addComponent(new UIPanel({ color: facetColor("#000000"), alpha: 0.45 }));
  host.addComponent(new UITrigger({})); // backdrop clicks never reach the world
  host.enabled = false;

  // width leads and height derives from it: flexpanel clamps a max without re-deriving the
  // other side, and the GUI's own 16:9 keeps the card within the max
  const inner = new UIElement({
    width: "100%",
    aspectRatio: 16 / 9,
    maxHeight: "100%",
  });
  const card = facetCard({
    width: "100%",
    flexGrow: 1,
    padding: FacetTheme.pad,
    gap: FacetTheme.gapSm,
  });

  // the title cell grows so extra items and the close button sit right
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
  host.body = card;
  host.titleRow = titleRow;
  return host;
};

/**
 * Tabbed view: a tab strip over a content host, or down its left with `opts.vertical`. A tab's
 * `short` abbreviation is drawn in the strip with the full label as its tooltip. Pages stack as
 * absolute overlays in one rect, so switching never reflows. `opts.height` fixes the host;
 * `opts.grow` flex-fills it. The tabs component is on `root.tabs`.
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
  if (vertical) rootStyle.flexDirection = "row";
  const root = new UIElement(rootStyle);

  const strip = new UIElement(
    vertical
      ? { width: opts.stripWidth ?? 64, height: "100%", flexShrink: 0 }
      : {
          width: "100%",
          height: opts.stripHeight ?? FacetTheme.tabH,
          flexShrink: 0,
        },
  );

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
    items.push({
      label: tabs[i].label,
      short: tabs[i].short,
      content: overlay,
    });
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
    activeBg: facetColor(FacetTheme.btn), // a step up from the card beneath
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
 * Accordion: a stack of independent collapsible sections. A body is inserted/removed on toggle
 * so the stack reflows.
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
 * Category bar: clicking a category toggles a flyout of its items above the bar, one open at a
 * time. `opts.onSelect` runs after the item's own onSelect. The caller anchors the root; a
 * bottom anchor pins the bar and pops the flyout upward. Flyouts are prebuilt once and swapped
 * structurally, never by flex mutation. `root.catbar` exposes { state, open, close, select }.
 */
globalThis.facetCatBar = function facetCatBar(categories, opts = {}) {
  const itemW = opts.itemWidth ?? 130;
  const itemH = opts.itemHeight ?? FacetTheme.rowHSm;
  const state = {
    open: -1,
    selCat: opts.selCat ?? 0,
    selItem: opts.selItem ?? 0,
  };

  const root = new UIElement({
    width: opts.width ?? 720,
    gap: FacetTheme.gapSm,
  });

  const host = new UIElement({ width: "100%" });

  const flyouts = [];
  for (let c = 0; c < categories.length; c++) {
    const items = categories[c].items;
    const card = facetCard({
      padding: FacetTheme.padSm,
      gap: FacetTheme.gapSm,
    });
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

/**
 * Titled column of a multi-column page: a header row with `opts.trailing` pushed right, over
 * `content` (one element or an array). The column shares the row's free width unless
 * `opts.width` fixes it.
 */
globalThis.facetColumn = function facetColumn(title, content, opts = {}) {
  const col = new UIElement(
    opts.width !== undefined
      ? { width: opts.width, flexShrink: 0, gap: FacetTheme.gapSm }
      : { flexGrow: 1, flexBasis: 0, gap: FacetTheme.gapSm },
  );
  const header = new UIElement({
    width: "100%",
    height: opts.headerH ?? 26,
    flexDirection: "row",
    alignItems: "center",
    gap: FacetTheme.gapSm,
  });
  const titleCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
  titleCell.insertChild(facetLabel(title, { color: "warn" }));
  header.insertChild(titleCell);
  if (opts.trailing !== undefined) header.insertChild(opts.trailing);
  col.insertChild(header);
  const items = content instanceof UIElement ? [content] : content;
  for (let i = 0; i < items.length; i++) col.insertChild(items[i]);
  return col;
};

/**
 * Master-detail row: a fixed-width `.list` column beside a `.detail` column that takes the
 * rest. Neither clips — a scissored column beside a non-clipped sibling breaks batching
 * (docs/GMRT.md) — so a page sizes its content to the card.
 */
globalThis.facetListDetail = function facetListDetail(opts = {}) {
  const row = new UIElement({
    width: "100%",
    height: "100%",
    flexDirection: "row",
    gap: opts.gap ?? FacetTheme.gap,
  });
  const list = new UIElement({
    width: opts.listWidth ?? 210,
    height: "100%",
    flexShrink: 0,
    gap: FacetTheme.gapSm,
  });
  const detail = new UIElement({
    flexGrow: 1,
    flexBasis: 0,
    height: "100%",
    gap: FacetTheme.gapSm,
  });
  row.insertChild(list);
  row.insertChild(detail);
  row.list = list;
  row.detail = detail;
  return row;
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
      alpha: FacetTheme.cardAlpha,
      rad: FacetTheme.radius,
      border: 1,
      borderColor: facetColor(FacetTheme.border),
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
 * Titled section: a muted title over a rule, with no box of its own, so it groups rows inside a
 * card without nesting a surface.
 */
globalThis.facetSection = function facetSection(title, opts = {}) {
  const section = new UIElement({
    width: "100%",
    paddingTop: opts.paddingTop ?? FacetTheme.padSm,
    gap: opts.gap ?? FacetTheme.gapSm,
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
 * Label + control on one line: a fixed-width label cell, the control filling the rest.
 * `opts.key` names the setting key(s) the control writes, or is a `() => boolean`; the label
 * is marked while the setting differs from its default.
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
