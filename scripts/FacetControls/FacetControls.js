// See FacetTheme.js for the kit overview + the GMRT globalThis-assignment rule.

/**
 * `opts.primary: true` paints the button accent (highlighted CTA). Centered label;
 * hover eases fill + border, press darkens it (see UIButton).
 */
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
  // label sits ON the accent fill for a primary button, so it takes onAccent (light in both
  // modes) — plain `text` would go dark in light mode and vanish against the blue.
  const labelColor =
    opts.textColor ?? (primary ? FacetTheme.onAccent : FacetTheme.text);

  // opts.icon: optional sprite drawn left of the label; only then does the layout become a
  // row (no-icon path unchanged)
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
      // opts.disabled: bool or a live () => bool
      disabled: opts.disabled === true,
      getDisabled: typeof opts.disabled === "function" ? opts.disabled : null,
      // opts.selected: a live () => bool marking the active choice (category bar / palette);
      // tints toward the accent
      getSelected: typeof opts.selected === "function" ? opts.selected : null,
      colorSelected: facetColor(opts.colorSelected ?? FacetTheme.accentPress),
      borderColorSelected: facetColor(
        opts.borderColorSelected ?? FacetTheme.accentHi,
      ),
      // grey the label alongside the panel when disabled
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

/** Square button holding a sprite (OBJECT_FIT.CONTAIN inside padding). */
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
 * Boolean button: renders `label: ON/OFF`, live from getValue(); click → onToggle.
 * onText/offText may be strings or () => string (for live i18n). `opts.key` names the Settings
 * key (or keys) onToggle writes, marking the button while it differs from its default.
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
 * Checkbox/switch row: label left, toggle graphic right; the whole row is the click
 * target. `opts.style` "check" (box+tick, default) or "switch" (pill+knob). `opts.key` names
 * the Settings key (or keys) onToggle writes, marking the label while it differs from its
 * default. For a `label: ON/OFF` button instead, use facetToggle.
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
 * Slider with an always-visible value readout (UISlider). `opts`: { key | value, min (0),
 * max (1), step, onChange(value), format(value) — the readout string (a percentage, say),
 * valueColor, tooltip }. `opts.key` binds it to Settings (facetBindValue); without a key it
 * starts at `opts.value` (else `min`).
 */
globalThis.facetSlider = function facetSlider(opts = {}) {
  const min = opts.min ?? 0;
  const bind = facetBindValue(opts, min);
  const el = new UIElement({ height: FacetTheme.sliderH, width: "100%" });
  el.addComponent(
    new UISlider({
      min,
      max: opts.max ?? 1,
      value: bind.value,
      step: opts.step,
      onChange: bind.onChange,
      format: opts.format,
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

/**
 * Framed field chassis shared by the boxed controls (select/dropdown/stepper/rebind/input):
 * a fixed-size element carrying the themed field UIPanel; the caller adds its control
 * component on top. `opts`: { width, height, color, rad }.
 */
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
 * Panel-backed cycling select (`< value >`, UISelect) — the fit for a few options;
 * facetDropdown for many. `items` are { name, value }. `opts`: { key | index,
 * onChange(index, value), width, height, tooltip } — `opts.key` binds the choice to
 * Settings (facetBindChoice).
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
 * Dropdown / combobox (UIDropdown): clicking the panel-backed field drops a navigable popup
 * list — the fit for many options (resolutions, locales), unlike facetSelect's in-place
 * `< >` cycle. Lists past `opts.maxVisible` (6) scroll. `items` are { name, value }. `opts`:
 * { key | index, onChange(index, value), width, height, rowH, maxVisible, dim, placeholder,
 * tooltip } — `opts.key` binds the choice to Settings (facetBindChoice).
 */
globalThis.facetDropdown = function facetDropdown(items, opts = {}) {
  const bind = facetBindChoice(items, opts);
  const el = facetFieldPanel({ height: opts.height, width: opts.width });
  el.addComponent(
    new UIDropdown({
      items,
      index: bind.index,
      onChange: bind.onChange,
      placeholder: opts.placeholder ?? "",
      color: facetColor(FacetTheme.text),
      placeholderColor: facetColor(FacetTheme.textDim),
      chevronColor: facetColor(FacetTheme.textMuted),
      onOpen: (dropdown, field) => facetDropdownPopup(dropdown, field, opts),
    }),
  );
  return facetAttachTooltip(el, opts);
};

/**
 * Builds + shows the popup list for an open UIDropdown (its `onOpen`). Assigned global,
 * not a bare function — GMRT large-file hoisting rule.
 */
globalThis.facetDropdownPopup = function facetDropdownPopup(
  dropdown,
  field,
  opts,
) {
  const pos = field.getLayoutPosition();
  const rowH = opts.rowH ?? FacetTheme.rowH;
  const gap = FacetTheme.gapSm;
  const pad = FacetTheme.padSm;
  const n = dropdown.items.length;
  const maxVisible = opts.maxVisible ?? 6;
  const visible = Math.min(n, maxVisible);
  const listH = visible * rowH + Math.max(0, visible - 1) * gap;
  const cardH = listH + pad * 2;

  // drop below the field; flip above if it would run off the screen bottom
  let top = pos.top + pos.height + 4;
  if (top + cardH > display_get_gui_height()) top = pos.top - 4 - cardH;

  // full-screen modal root: blocks rows behind, draws on top, closes on outside-click/Esc.
  // dim 0 → no darkening, just the popup
  const root = new UIElement({ width: "100%", height: "100%" });
  root.addComponent(
    new UIPanel({ color: facetColor("#000000"), alpha: opts.dim ?? 0 }),
  );
  const modal = new UIModal({
    root,
    slide: 8,
    duration: 0.12,
    onClose: () => dropdown.notifyClosed(),
  });
  root.addComponent(modal);

  // absolute wrapper positions the card at the field (construction-time layout props
  // only — runtime change is draw-time offsets, not flex mutation)
  const wrap = new UIElement({
    positionType: "absolute",
    left: pos.left,
    top,
    width: pos.width,
  });
  const card = facetCard({ width: "100%", padding: pad, gap, alpha: 1 }); // floats over other UI
  // long lists scroll in a fixed-height viewport; short ones list directly
  const scroll = n > maxVisible ? facetScroll({ height: listH }) : null;
  const host = scroll !== null ? scroll.scrollBody : card;
  if (scroll !== null) card.insertChild(scroll);
  const sel = dropdown.getIndex(); // method, not a .index getter (UIDropdown house style)
  for (let i = 0; i < n; i++) {
    const item = dropdown.items[i];
    const selected = i === sel;
    const pick = i; // capture for the click closure
    host.insertChild(
      facetButton(
        item.name,
        () => {
          dropdown.setIndex(pick);
          modal.close();
        },
        {
          height: rowH,
          width: "100%",
          border: 0,
          primary: selected,
        },
      ),
    );
  }
  wrap.insertChild(card);
  root.insertChild(wrap);
  UI.insert(root); // top of the stack → blocks lower roots, draws last
};

/**
 * Panel-backed numeric stepper (`< n >`). Holds its own value; `onChange(value)`
 * fires on each step. `opts`: { min, max, step, wrap, format } — `format(v)` returns
 * the centered display string (default `${v}`).
 */
globalThis.facetStepper = function facetStepper(value, onChange, opts = {}) {
  const el = facetFieldPanel({ height: opts.height, width: opts.width });
  el.addComponent(
    new UIStepper({
      value,
      min: opts.min ?? 0,
      max: opts.max ?? 10,
      step: opts.step ?? 1,
      wrap: opts.wrap ?? false,
      format: opts.format,
      onChange,
      halign: fa_center,
      color: facetColor(FacetTheme.text),
      arrowColor: facetColor(FacetTheme.textMuted),
      arrowHover: facetColor(FacetTheme.accent),
      arrowDisabled: facetColor(FacetTheme.textDim),
    }),
  );
  return facetAttachTooltip(el, opts);
};

/**
 * Panel-backed single-line text field (UIInput). Reach the component via
 * `field.getComponent(UIInput)`. `placeholder` is resolved once (a plain string, not a
 * textRef), so it won't re-translate on a live language switch.
 */
globalThis.facetInput = function facetInput(opts = {}) {
  const el = facetFieldPanel({
    height: opts.height ?? FacetTheme.rowH,
    width: opts.width,
    color: opts.color ?? FacetTheme.btnPress, // input field sits a shade deeper than a button
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
 * Slot grid with hover + single selection (inventory foundation). `items` is slot data
 * ({ sprite, subimg, count, color }) or null; `sprite` must be raster (SVG faults on
 * GMRT). Sized exactly to the grid so it drops into a facetScroll. `onSelect(index, item)`.
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
 * Key-rebinding row (UIRebind): shows an action's current binding; click to arm capture,
 * next key rebinds its keyboard key through Input.rebind (Esc / mouse-click cancels). `actionKey`
 * must already be registered. `opts.prompt` is the capture label; `opts.onRebind(code)` fires on
 * rebind.
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
 * Data table (UITable): sortable columns, filtering, single selection, sticky header,
 * row scrolling, keyboard/gamepad browse. `columns` is the UITable column spec
 * ({ label, width?/flex?, align?, text(row), color?(row), sprite?(row), sortable?,
 * sortValue?(row) }). Sized to show `opts.rows` (8) whole rows. Reach the component via
 * `el.getComponent(UITable)`. `opts`: { data, rows, grow, rowH, headerH, width, sortBy,
 * sortDir, onSelect, onActivate, emptyText, font, headerFont, tooltip }.
 */
globalThis.facetTable = function facetTable(columns, opts = {}) {
  const rowH = opts.rowH ?? FacetTheme.rowH;
  const headerH = opts.headerH ?? FacetTheme.lineH;
  const visible = opts.rows ?? 8;
  const pad = FacetTheme.padSm;
  // `grow` flex-fills instead of fixing a row count; UITable derives its visible-row count
  // from the live layout height, so a grown table reflows as a resizable window changes size.
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

/**
 * Amount-picker modal — "how many?" stepper (defaults to the full `max`) + 1/Half/All quick
 * buttons over a facetModal; confirm fires onConfirm(amount), Cancel/backdrop just close.
 * All labels are options (the kit stays content-agnostic — the colony passes its STORAGE_*
 * strings); closeOnEscape defaults OFF because the colony level's handleEscape cancels the
 * picker before the window under it. Returns the UIModal (as facetModal does).
 * opts: { title, max, prompt, half, all, cancelLabel, confirmLabel, onConfirm, onClose,
 *         closeOnEscape, width }
 */
globalThis.facetAmountPicker = function facetAmountPicker(opts = {}) {
  const max = opts.max ?? 1;
  let amount = max; // the confirm button reads it on confirm
  const body = new UIElement({ width: "100%", gap: FacetTheme.gapSm });
  body.insertChild(
    facetLabel((opts.prompt ?? "How many?") + " (" + max + ")", {
      color: FacetTheme.textMuted,
    }),
  );
  const stepEl = facetStepper(amount, (v) => (amount = v), {
    min: 1,
    max,
    step: 1,
  });
  const stepper = stepEl.getComponent(UIStepper);
  body.insertChild(stepEl);

  // equal-width quick-set row; each button snaps the stepper.
  const quickBtn = (label, onClick) => {
    const cell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    cell.insertChild(
      facetButton(label, onClick, { height: FacetTheme.rowHSm }),
    );
    return cell;
  };
  const quick = new UIElement({
    width: "100%",
    flexDirection: "row",
    gap: FacetTheme.gapSm,
  });
  quick.insertChild(quickBtn("1", () => stepper.setValue(1)));
  quick.insertChild(
    quickBtn(opts.half ?? "Half", () => stepper.setValue(Math.floor(max / 2))),
  );
  quick.insertChild(quickBtn(opts.all ?? "All", () => stepper.setValue(max)));
  body.insertChild(quick);

  return facetModal({
    title: opts.title,
    width: opts.width ?? 360,
    body,
    closeOnEscape: opts.closeOnEscape ?? false,
    buttons: [
      { label: opts.cancelLabel ?? "Cancel" },
      {
        label: opts.confirmLabel ?? "OK",
        primary: true,
        onClick: () => opts.onConfirm(amount),
      },
    ],
    onClose: opts.onClose ?? noop,
  });
};
