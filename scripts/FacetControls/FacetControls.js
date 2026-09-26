/** Themed controls: factories for elements that edit a value or fire an action. */

/** `opts.primary` paints the accent call-to-action look. */
globalThis.facetButton = function facetButton(label, onClick, opts = {}) {
  const primary = opts.primary ?? false;
  const base = opts.color ?? (primary ? FacetTheme.accent : FacetTheme.btn);
  const hover =
    opts.colorHover ?? (primary ? FacetTheme.accentHi : FacetTheme.btnHover);
  const press =
    opts.colorPress ?? (primary ? FacetTheme.accentPress : FacetTheme.btnPress);
  const bdr =
    opts.borderColor ?? (primary ? FacetTheme.accentHi : FacetTheme.border);
  const bdrHover = primary ? FacetTheme.onAccent : FacetTheme.borderHi;
  // a primary label sits on the accent fill, so it must stay light in both theme modes
  const labelColor =
    opts.textColor ?? (primary ? FacetTheme.onAccent : FacetTheme.text);

  const hasIcon = opts.icon != null && sprite_exists(opts.icon);
  const style = {
    height: opts.height ?? FacetTheme.rowH,
    width: opts.width ?? "100%",
    justifyContent: "center",
    alignItems: "center",
  };
  if (hasIcon) {
    style.flexDirection = "row";
    style.gap = FacetTheme.gapSm;
  }
  const btn = new UIElement(style);
  btn.addComponent(
    new UIPanel({
      color: facetColor(base),
      rad: opts.rad ?? FacetTheme.radiusSm,
      border: opts.border ?? 1,
      borderColor: facetColor(bdr),
    }),
  );
  const labelEl = facetLabel(label, {
    halign: fa_center,
    color: labelColor,
    font: opts.font,
  });
  btn.addComponent(
    new UIButton({
      colorNormal: facetColor(base),
      colorHover: facetColor(hover),
      colorPress: facetColor(press),
      borderColorNormal: facetColor(bdr),
      borderColorHover: facetColor(bdrHover),
      animSpeed: FacetTheme.animSpeed,
      disabled: opts.disabled === true,
      getDisabled: typeof opts.disabled === "function" ? opts.disabled : null,
      getSelected: typeof opts.selected === "function" ? opts.selected : null,
      colorSelected: facetColor(opts.colorSelected ?? FacetTheme.accentPress),
      borderColorSelected: facetColor(
        opts.borderColorSelected ?? FacetTheme.accentHi,
      ),
      label: labelEl.getComponent(UIText),
      textColorNormal: facetColor(labelColor),
      textColorDisabled: facetColor(FacetTheme.textDim),
      onClick,
    }),
  );
  if (hasIcon) {
    const isz = opts.iconSize ?? (opts.height ?? FacetTheme.rowH) - 8;
    const iconEl = new UIElement({ width: isz, height: isz });
    iconEl.addComponent(
      new UIImage({
        sprite: opts.icon,
        fit: OBJECT_FIT.CONTAIN,
        color: c_white,
      }),
    );
    btn.insertChild(iconEl);
  }
  btn.insertChild(labelEl);
  return facetAttachTooltip(btn, opts);
};

globalThis.facetIconButton = function facetIconButton(
  sprite,
  onClick,
  opts = {},
) {
  const sz = opts.size ?? FacetTheme.rowH;
  const btn = new UIElement({ width: sz, height: sz });
  btn.addComponent(
    new UIPanel({
      color: facetColor(FacetTheme.btn),
      rad: opts.rad ?? FacetTheme.radiusSm,
      border: 1,
      borderColor: facetColor(FacetTheme.border),
    }),
  );
  btn.addComponent(
    new UIButton({
      colorNormal: facetColor(FacetTheme.btn),
      colorHover: facetColor(FacetTheme.btnHover),
      colorPress: facetColor(FacetTheme.btnPress),
      borderColorNormal: facetColor(FacetTheme.border),
      borderColorHover: facetColor(FacetTheme.borderHi),
      animSpeed: FacetTheme.animSpeed,
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
      color: facetColor(opts.iconColor ?? FacetTheme.text),
    }),
  );
  btn.insertChild(icon);
  return facetAttachTooltip(btn, opts);
};

/**
 * Button reading `label: ON/OFF`, live from getValue(). `opts.key` names the Settings key (or
 * keys) onToggle writes, marking the button while it differs from its default.
 */
globalThis.facetToggle = function facetToggle(
  label,
  getValue,
  onToggle,
  opts = {},
) {
  const ref = facetTextRef(label);
  const onRef = facetTextRef(opts.onText ?? "ON");
  const offRef = facetTextRef(opts.offText ?? "OFF");
  // the mark trails the whole `label: ON` string — mid-string it reads as a footnote
  return facetButton(
    facetSettingsRef(
      () => `${ref()}: ${getValue() ? onRef() : offRef()}`,
      opts.key,
    ),
    onToggle,
    opts,
  );
};

/**
 * Checkbox or switch row whose whole width is the click target. `opts.style` is "check" or
 * "switch". `opts.key` names the Settings key (or keys) onToggle writes, marking the label while
 * it differs from its default.
 */
globalThis.facetCheckbox = function facetCheckbox(
  label,
  getValue,
  onToggle,
  opts = {},
) {
  const el = new UIElement({
    height: opts.height ?? FacetTheme.rowH,
    width: opts.width ?? "100%",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: FacetTheme.padSm,
  });
  el.addComponent(
    new UICheckbox({
      getValue,
      onToggle,
      readOnly: opts.readOnly ?? false,
      style: opts.style ?? "check",
      colorOff: facetColor(opts.colorOff ?? FacetTheme.btnPress),
      colorOn: facetColor(opts.colorOn ?? FacetTheme.accent),
      colorKnob: facetColor(opts.colorKnob ?? FacetTheme.text),
      colorBorder: facetColor(FacetTheme.border),
      animSpeed: FacetTheme.animSpeed,
    }),
  );
  el.insertChild(
    facetLabel(facetSettingsRef(label, opts.key), {
      color: opts.labelColor ?? FacetTheme.text,
    }),
  );
  return facetAttachTooltip(el, opts);
};

/**
 * Slider with a value readout at its right end; `opts.showValue: false` gives the track the
 * whole width. `opts.key` binds it to Settings; without a key it starts at `opts.value`.
 */
globalThis.facetSlider = function facetSlider(opts = {}) {
  const min = opts.min ?? 0;
  const bind = facetBindValue(opts, min);
  const el = new UIElement({ height: FacetTheme.sliderH, width: opts.width ?? "100%" });
  el.addComponent(
    new UISlider({
      min,
      max: opts.max ?? 1,
      value: bind.value,
      step: opts.step,
      onChange: bind.onChange,
      format: opts.format,
      showValue: opts.showValue,
      valueColor: facetColor(opts.valueColor ?? FacetTheme.text),
      font: "default",
      track: {
        color: facetColor(FacetTheme.btnPress),
        border: 1,
        borderColor: facetColor(FacetTheme.border),
      },
      fill: { color: facetColor(FacetTheme.accent) },
      thumb: {
        color: facetColor(FacetTheme.text),
        borderColor: facetColor(FacetTheme.accentHi),
      },
    }),
  );
  return facetAttachTooltip(el, opts);
};

/** Framed field chassis of the boxed controls; the caller adds its control component on top. */
globalThis.facetFieldPanel = function facetFieldPanel(opts = {}) {
  const el = new UIElement({
    height: opts.height ?? FacetTheme.fieldH,
    width: opts.width ?? "100%",
  });
  el.addComponent(
    new UIPanel({
      color: facetColor(opts.color ?? FacetTheme.btn),
      rad: opts.rad ?? FacetTheme.radiusSm,
      border: 1,
      borderColor: facetColor(FacetTheme.border),
    }),
  );
  return el;
};

/**
 * In-place cycling select (`< value >`), the fit for a few options. `items` are { name, value };
 * `opts.key` binds the choice to Settings.
 */
globalThis.facetSelect = function facetSelect(items, opts = {}) {
  const bind = facetBindChoice(items, opts);
  const el = facetFieldPanel({ height: opts.height, width: opts.width });
  el.addComponent(
    new UISelect({
      items,
      index: bind.index,
      onChange: bind.onChange,
      halign: fa_center,
      color: facetColor(FacetTheme.text),
      arrowColor: facetColor(FacetTheme.textMuted),
      arrowHover: facetColor(FacetTheme.accent),
    }),
  );
  return facetAttachTooltip(el, opts);
};

/**
 * Dropdown whose field opens its list inline below it, the fit for many options; lists past
 * `opts.maxVisible` scroll. `items` are { name, value }; `opts.key` binds the choice to Settings.
 */
globalThis.facetDropdown = function facetDropdown(items, opts = {}) {
  const bind = facetBindChoice(items, opts);
  const rowH = opts.rowH ?? FacetTheme.rowH;
  const gap = FacetTheme.gapSm;
  const n = items.length;
  const maxVisible = opts.maxVisible ?? 6;
  const visible = Math.min(n, maxVisible);

  const list = facetPanel({
    padding: FacetTheme.padSm,
    gap,
    color: FacetTheme.panelLo,
    rad: FacetTheme.radiusSm,
    border: 1,
  });
  const scroll =
    n > maxVisible ? facetScroll({ height: visible * rowH + (visible - 1) * gap }) : null;
  if (scroll !== null) list.insertChild(scroll);
  const host = scroll !== null ? scroll.scrollBody : list;

  const dropdown = new UIDropdown({
    items,
    index: bind.index,
    onChange: bind.onChange,
    list,
    placeholder: opts.placeholder ?? "",
    color: facetColor(FacetTheme.text),
    placeholderColor: facetColor(FacetTheme.textDim),
    chevronColor: facetColor(FacetTheme.textMuted),
  });
  for (let i = 0; i < n; i++) {
    const pick = i;
    host.insertChild(
      facetButton(
        items[i].name,
        () => {
          dropdown.setIndex(pick);
          dropdown.close();
        },
        {
          height: rowH,
          width: "100%",
          border: 0,
          selected: () => dropdown.getIndex() === pick,
        },
      ),
    );
  }

  const wrap = new UIElement({ width: opts.width ?? "100%", gap: 4 });
  const field = facetFieldPanel({ height: opts.height, width: "100%" });
  field.addComponent(dropdown);
  wrap.insertChild(facetAttachTooltip(field, opts));
  wrap.anchorH = opts.height ?? FacetTheme.fieldH; // the field's band, which a row label keeps to
  return wrap;
};

/**
 * Single-line text field. `placeholder` is a plain string resolved once, so it does not
 * re-translate on a live language switch.
 */
globalThis.facetInput = function facetInput(opts = {}) {
  const el = facetFieldPanel({
    height: opts.height ?? FacetTheme.rowH,
    width: opts.width,
    color: opts.color ?? FacetTheme.btnPress, // a shade deeper than a button
    rad: opts.rad,
  });
  el.addComponent(
    new UIInput({
      value: opts.value ?? "",
      placeholder: opts.placeholder ?? "",
      mask: opts.mask ?? false,
      maxLength: opts.maxLength,
      filter: opts.filter,
      readOnly: opts.readOnly ?? false,
      padX: FacetTheme.padSm,
      color: facetColor(FacetTheme.text),
      colorPlaceholder: facetColor(FacetTheme.textDim),
      colorCursor: facetColor(FacetTheme.accent),
      colorSelection: facetColor(FacetTheme.accent),
      onChange: opts.onChange,
      onConfirm: opts.onConfirm,
      onCancel: opts.onCancel,
    }),
  );
  return facetAttachTooltip(el, opts);
};

/**
 * Slot grid with hover and single selection, sized exactly to the grid so it fits a scroll
 * view. Each item is { sprite, subimg, count, color, borderColor?, badge?, badgeColor? } or null;
 * `sprite` must be raster (docs/GMRT.md).
 */
globalThis.facetSlots = function facetSlots(items, opts = {}) {
  const cols = opts.cols ?? 4;
  const cellSize = opts.cellSize ?? 64;
  const gap = opts.gap ?? FacetTheme.gapSm;
  const rows = Math.max(1, Math.ceil(items.length / cols));
  const el = new UIElement({
    width: cols * cellSize + (cols - 1) * gap,
    height: rows * cellSize + (rows - 1) * gap,
    flexShrink: 0,
  });
  el.addComponent(
    new UISlots({
      items,
      cols,
      cellSize,
      gap,
      selected: opts.selected ?? -1,
      onSelect: opts.onSelect,
      onActivate: opts.onActivate,
      draggable: opts.draggable ?? false,
      onDrop: opts.onDrop,
      passive: opts.passive,
      font: opts.font ?? -1,
      slotColor: facetColor(opts.slotColor ?? FacetTheme.btnPress),
      slotHover: facetColor(FacetTheme.btnHover),
      borderColor: facetColor(FacetTheme.border),
      selectColor: facetColor(FacetTheme.accent),
      countColor: facetColor(FacetTheme.text),
    }),
  );
  return facetAttachTooltip(el, opts);
};

/**
 * Key-rebinding row showing an action's current binding; a click arms capture and the next key
 * rebinds it (Esc or a mouse click cancels). `actionKey` must already be registered.
 */
globalThis.facetRebind = function facetRebind(actionKey, opts = {}) {
  const el = facetFieldPanel({
    height: opts.height ?? FacetTheme.rowH,
    width: opts.width,
  });
  el.addComponent(
    new UIRebind({
      actionKey,
      prompt: facetTextRef(opts.prompt ?? "Press a key…"),
      onRebind: opts.onRebind,
      color: facetColor(FacetTheme.text),
      captureColor: facetColor(FacetTheme.accent),
      rad: FacetTheme.radiusSm,
      font: opts.font ?? -1,
    }),
  );
  return facetAttachTooltip(el, opts);
};

/**
 * Data table sized to show `opts.rows` whole rows, or to flex-fill with `opts.grow`. `columns`
 * is the table column spec ({ label, width?/flex?, align?, text(row), color?(row), sprite?(row),
 * sortable?, sortValue?(row) }).
 */
globalThis.facetTable = function facetTable(columns, opts = {}) {
  const rowH = opts.rowH ?? FacetTheme.rowH;
  const headerH = opts.headerH ?? FacetTheme.lineH;
  const visible = opts.rows ?? 8;
  const pad = FacetTheme.padSm;
  // a grown table's visible-row count follows its live layout height, so it reflows on resize
  const el = new UIElement(
    opts.grow
      ? { width: opts.width ?? "100%", flexGrow: 1, flexBasis: 0 }
      : {
          width: opts.width ?? "100%",
          height: headerH + visible * rowH + pad * 2,
          flexShrink: 0,
        },
  );
  el.addComponent(
    new UIPanel({
      color: facetColor(FacetTheme.panelLo),
      rad: FacetTheme.radiusSm,
      border: 1,
      borderColor: facetColor(FacetTheme.border),
    }),
  );
  el.addComponent(
    new UITable({
      columns,
      rows: opts.data ?? [],
      rowH,
      headerH,
      pad,
      sortBy: opts.sortBy,
      sortDir: opts.sortDir,
      onSelect: opts.onSelect,
      onActivate: opts.onActivate,
      emptyText: opts.emptyText ?? "",
      font: opts.font ?? -1,
      headerFont: opts.headerFont ?? "default",
      colorText: facetColor(FacetTheme.text),
      colorMuted: facetColor(FacetTheme.textMuted),
      colorHeader: facetColor(FacetTheme.textMuted),
      colorHeaderBg: facetColor(FacetTheme.panel),
      colorRow: facetColor(FacetTheme.panelLo),
      colorRowAlt: facetColor(FacetTheme.panel),
      colorRowHover: facetColor(FacetTheme.btnHover),
      colorSel: facetColor(FacetTheme.accent),
      colorBorder: facetColor(FacetTheme.border),
      colorArrow: facetColor(FacetTheme.accent),
      colorArrow2: facetColor(FacetTheme.textMuted),
      trackColor: facetColor(FacetTheme.panelLo),
      thumbColor: facetColor(FacetTheme.border),
      thumbHover: facetColor(FacetTheme.borderHi),
    }),
  );
  return facetAttachTooltip(el, opts);
};
