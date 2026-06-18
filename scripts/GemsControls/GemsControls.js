// ── GemsUI kit: interactive controls ──────────────────────────
// Value widgets (toggle/progress/slider/select/stepper/input). See GemsTheme.js for
// the kit overview + the GMRT globalThis-assignment rule.

/** Index of the item whose `value` matches the current Settings value for `key` (0 if none). @param {string} key @param {{value:*}[]} items @returns {number} */
globalThis.gemsSettingsIndex = function gemsSettingsIndex(key, items) {
  const cur = Settings.get(key);
  return Math.max(
    0,
    items.findIndex((item) => item.value === cur),
  );
};

// Real visual checkbox/switch row: label on the left, the toggle graphic anchored to
// the right edge; the whole row is the click target. `opts.style` is "check" (box +
// tick, default) or "switch" (pill + sliding knob). For a `label: ON/OFF` button
// instead, use gemsToggle.
globalThis.gemsCheckbox = function gemsCheckbox(
  label,
  getValue,
  onToggle,
  opts = {},
) {
  const el = new UIElement({
    height: opts.height ?? GemsTheme.rowH,
    width: opts.width ?? "100%",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: GemsTheme.padSm,
  });
  el.addComponent(
    new UICheckbox({
      getValue,
      onToggle,
      readOnly: opts.readOnly ?? false,
      style: opts.style ?? "check",
      colorOff: gemsColor(opts.colorOff ?? GemsTheme.btnPress),
      colorOn: gemsColor(opts.colorOn ?? GemsTheme.accent),
      colorKnob: gemsColor(opts.colorKnob ?? GemsTheme.text),
      colorBorder: gemsColor(GemsTheme.border),
      animSpeed: GemsTheme.animSpeed,
    }),
  );
  el.insertChild(
    gemsLabel(label, { color: opts.labelColor ?? GemsTheme.text }),
  );
  return gemsAttachTooltip(el, opts);
};

// Non-interactive themed progress / fill bar. `getValue` is () => 0..1 (read live).
// `opts.label` (string or () => string) draws centered; `opts.fillColor`/`trackColor`
// accept a theme key/hex/int; `opts.fillColor2` is an optional radial edge tint.
globalThis.gemsProgress = function gemsProgress(getValue, opts = {}) {
  const el = new UIElement({
    height: opts.height ?? 16,
    width: opts.width ?? "100%",
  });
  el.addComponent(
    new UIProgress({
      getValue,
      label: opts.label,
      color: gemsColor(opts.textColor ?? GemsTheme.text),
      font: opts.font ?? -1,
      track: {
        color: gemsColor(opts.trackColor ?? GemsTheme.btnPress),
        rad: opts.rad,
        border: 1,
        borderColor: gemsColor(GemsTheme.border),
      },
      fill: {
        color: gemsColor(opts.fillColor ?? GemsTheme.accent),
        color2:
          opts.fillColor2 != null ? gemsColor(opts.fillColor2) : undefined,
      },
    }),
  );
  return gemsAttachTooltip(el, opts);
};

// Settings-bound slider. For a non-Settings slider, build UISlider directly.
globalThis.gemsSlider = function gemsSlider(
  key,
  min = 0,
  max = 1,
  step = undefined,
  opts = {},
) {
  const el = new UIElement({ height: 28, width: "100%" });
  el.addComponent(
    new UISlider({
      min,
      max,
      value: Settings.get(key),
      step,
      onChange: (v) => {
        Settings.set(key, v);
        if (opts.onChange !== undefined) opts.onChange(v);
      },
      // Always-visible value readout (opts.format customizes it, e.g. a percentage).
      format: opts.format,
      valueColor: gemsColor(opts.valueColor ?? GemsTheme.text),
      font: "default",
      track: {
        color: gemsColor(GemsTheme.btnPress),
        border: 1,
        borderColor: gemsColor(GemsTheme.border),
      },
      fill: { color: gemsColor(GemsTheme.accent) },
      thumb: {
        color: gemsColor(GemsTheme.text),
        borderColor: gemsColor(GemsTheme.accentHi),
        shadowAlpha: 0.35,
      },
    }),
  );
  return gemsAttachTooltip(el, opts);
};

// Panel-backed cycling select with an explicit index/onChange.
globalThis.gemsSelectCustom = function gemsSelectCustom(
  items,
  index,
  onChange,
  opts = {},
) {
  const el = new UIElement({ height: 36, width: "100%" });
  el.addComponent(
    new UIPanel({
      color: gemsColor(GemsTheme.btn),
      rad: GemsTheme.radiusSm,
      border: 1,
      borderColor: gemsColor(GemsTheme.border),
      highlight: 1,
      highlightAlpha: 0.07,
    }),
  );
  el.addComponent(
    new UISelect({
      items,
      index,
      onChange,
      halign: fa_center,
      color: gemsColor(GemsTheme.text),
      arrowColor: gemsColor(GemsTheme.textMuted),
      arrowHover: gemsColor(GemsTheme.accent),
    }),
  );
  return gemsAttachTooltip(el, opts);
};

// Dropdown / combobox with an explicit index/onChange. The closed field is a
// panel-backed UIDropdown; clicking (or nav-confirm) drops a popup list to pick from.
// Unlike gemsSelectCustom (cycles in place with `< >`), this opens a navigable list —
// the better fit when there are many options (resolutions, locales). The popup is a
// positioned UIModal root: it blocks the rows behind it, draws on top, closes on
// outside-click/Esc, and is UINav (keyboard/gamepad) navigable for free. Lists longer
// than `opts.maxVisible` (6) scroll. `items` are { name, value } (name a resolved
// string). `opts`: { width, height, rowH, maxVisible, dim, placeholder, tooltip }.
globalThis.gemsDropdownCustom = function gemsDropdownCustom(
  items,
  index,
  onChange,
  opts = {},
) {
  const el = new UIElement({
    height: opts.height ?? 36,
    width: opts.width ?? "100%",
  });
  el.addComponent(
    new UIPanel({
      color: gemsColor(GemsTheme.btn),
      rad: GemsTheme.radiusSm,
      border: 1,
      borderColor: gemsColor(GemsTheme.border),
      highlight: 1,
      highlightAlpha: 0.07,
    }),
  );
  el.addComponent(
    new UIDropdown({
      items,
      index,
      onChange,
      placeholder: opts.placeholder ?? "",
      color: gemsColor(GemsTheme.text),
      placeholderColor: gemsColor(GemsTheme.textDim),
      chevronColor: gemsColor(GemsTheme.textMuted),
      onOpen: (dropdown, field) => gemsDropdownPopup(dropdown, field, opts),
    }),
  );
  return gemsAttachTooltip(el, opts);
};

// Builds + shows the popup list for an open UIDropdown (its `onOpen`). Kept as an
// assigned global (not a bare function) per the GMRT large-file hoisting rule.
globalThis.gemsDropdownPopup = function gemsDropdownPopup(
  dropdown,
  field,
  opts,
) {
  const pos = field.getLayoutPosition();
  const rowH = opts.rowH ?? GemsTheme.rowH;
  const gap = GemsTheme.gapSm;
  const pad = GemsTheme.padSm;
  const n = dropdown.items.length;
  const maxVisible = opts.maxVisible ?? 6;
  const visible = Math.min(n, maxVisible);
  const listH = visible * rowH + Math.max(0, visible - 1) * gap;
  const cardH = listH + pad * 2;

  // Drop below the field; flip above if it would run off the bottom of the screen.
  let top = pos.top + pos.height + 4;
  if (top + cardH > display_get_gui_height()) top = pos.top - 4 - cardH;

  // Full-screen modal root: blocks the rows behind it, draws last (on top), closes on
  // outside-click/Esc. dim 0 → no screen darkening, just the popup; a small slide gives
  // it a subtle drop-in.
  const root = new UIElement({ width: "100%", height: "100%" });
  root.addComponent(
    new UIPanel({ color: gemsColor("#000000"), alpha: opts.dim ?? 0 }),
  );
  const modal = new UIModal({
    root,
    slide: 8,
    duration: 0.12,
    onClose: () => dropdown.notifyClosed(),
  });
  root.addComponent(modal);

  // Absolute wrapper positions the card at the field (construction-time layout props
  // only — the kit drives runtime change with draw-time offsets, not flex mutation).
  const wrap = new UIElement({
    positionType: "absolute",
    left: pos.left,
    top,
    width: pos.width,
  });
  const card = gemsCard({ width: "100%", padding: pad, gap });
  // Long lists scroll inside a fixed-height viewport; short ones list directly.
  const scroll = n > maxVisible ? gemsScroll({ height: listH }) : null;
  const host = scroll !== null ? scroll.scrollBody : card;
  if (scroll !== null) card.insertChild(scroll);
  const sel = dropdown.getIndex(); // method, not a .index getter (GMRT faults on it — see UIDropdown)
  for (let i = 0; i < n; i++) {
    const item = dropdown.items[i];
    const selected = i === sel;
    const pick = i; // capture for the click closure
    host.insertChild(
      gemsButton(
        item.name,
        () => {
          dropdown.setIndex(pick);
          modal.close();
        },
        {
          height: rowH,
          width: "100%",
          border: 0,
          shadow: 0,
          primary: selected,
        },
      ),
    );
  }
  wrap.insertChild(card);
  root.insertChild(wrap);
  UI.insert(root); // top of the stack → blocks lower roots, draws last
};

// Settings-bound dropdown. `items` are { name, value }; the current Settings value
// picks the starting index (mirrors gemsSelect, but as a popup list).
globalThis.gemsDropdown = function gemsDropdown(key, items, opts = {}) {
  return gemsDropdownCustom(
    items,
    gemsSettingsIndex(key, items),
    (_i, value) => Settings.set(key, value),
    opts,
  );
};

// Panel-backed numeric stepper (`< n >`). Holds its own value; `onChange(value)`
// fires on each step. `opts`: { min, max, step, wrap, format } — `format(v)` returns
// the centered display string (default `${v}`).
globalThis.gemsStepper = function gemsStepper(value, onChange, opts = {}) {
  const el = new UIElement({
    height: opts.height ?? 36,
    width: opts.width ?? "100%",
  });
  el.addComponent(
    new UIPanel({
      color: gemsColor(GemsTheme.btn),
      rad: GemsTheme.radiusSm,
      border: 1,
      borderColor: gemsColor(GemsTheme.border),
      highlight: 1,
      highlightAlpha: 0.07,
    }),
  );
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
      color: gemsColor(GemsTheme.text),
      arrowColor: gemsColor(GemsTheme.textMuted),
      arrowHover: gemsColor(GemsTheme.accent),
      arrowDisabled: gemsColor(GemsTheme.textDim),
    }),
  );
  return gemsAttachTooltip(el, opts);
};

// Panel-backed single-line text field (UIInput). Returns the element; reach the
// component with `field.getComponent(UIInput)` to read `.value` / call focus().
// `placeholder` is resolved once (UIInput holds a plain string, not a textRef), so
// it won't re-translate on a live language switch.
globalThis.gemsInput = function gemsInput(opts = {}) {
  const el = new UIElement({
    height: opts.height ?? GemsTheme.rowH,
    width: opts.width ?? "100%",
  });
  el.addComponent(
    new UIPanel({
      color: gemsColor(opts.color ?? GemsTheme.btnPress),
      rad: opts.rad ?? GemsTheme.radiusSm,
      border: 1,
      borderColor: gemsColor(GemsTheme.border),
      highlight: 1,
      highlightAlpha: 0.05,
    }),
  );
  el.addComponent(
    new UIInput({
      value: opts.value ?? "",
      placeholder: opts.placeholder ?? "",
      mask: opts.mask ?? false,
      maxLength: opts.maxLength,
      filter: opts.filter,
      readOnly: opts.readOnly ?? false,
      padX: GemsTheme.padSm,
      color: gemsColor(GemsTheme.text),
      colorPlaceholder: gemsColor(GemsTheme.textDim),
      colorCursor: gemsColor(GemsTheme.accent),
      colorSelection: gemsColor(GemsTheme.accent),
      onChange: opts.onChange,
      onConfirm: opts.onConfirm,
      onCancel: opts.onCancel,
    }),
  );
  return gemsAttachTooltip(el, opts);
};

// Slot grid with hover + single selection (inventory foundation). `items` is a flat
// array of slot data ({ sprite, subimg, count, color }) or null for an empty slot;
// `sprite` must be raster (SVG faults on GMRT). The element is sized to exactly the
// grid (cols × cellSize + gaps) so it can be dropped into a gemsScroll for overflow.
// `onSelect(index, item)` fires on click.
globalThis.gemsSlots = function gemsSlots(items, opts = {}) {
  const cols = opts.cols ?? 4;
  const cellSize = opts.cellSize ?? 64;
  const gap = opts.gap ?? GemsTheme.gapSm;
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
      draggable: opts.draggable ?? false,
      font: opts.font ?? -1,
      slotColor: gemsColor(opts.slotColor ?? GemsTheme.btnPress),
      slotHover: gemsColor(GemsTheme.btnHover),
      borderColor: gemsColor(GemsTheme.border),
      selectColor: gemsColor(GemsTheme.accent),
      countColor: gemsColor(GemsTheme.text),
    }),
  );
  return gemsAttachTooltip(el, opts);
};

// Key-rebinding row for an Input action (UIRebind). Shows the action's current
// keyboard binding; click to arm "press a key…" capture, then the next key rebinds
// the action's first button (Esc / mouse click cancels). `actionKey` must already be
// registered via Input.register/bindAll. `opts.prompt` (string / () => string) is the
// capture label; `opts.onRebind(code)` fires after a successful rebind.
globalThis.gemsRebind = function gemsRebind(actionKey, opts = {}) {
  const el = new UIElement({
    height: opts.height ?? GemsTheme.rowH,
    width: opts.width ?? "100%",
  });
  el.addComponent(
    new UIPanel({
      color: gemsColor(GemsTheme.btn),
      rad: GemsTheme.radiusSm,
      border: 1,
      borderColor: gemsColor(GemsTheme.border),
      highlight: 1,
      highlightAlpha: 0.07,
    }),
  );
  el.addComponent(
    new UIRebind({
      actionKey,
      prompt: gemsTextRef(opts.prompt ?? "Press a key…"),
      onRebind: opts.onRebind,
      color: gemsColor(GemsTheme.text),
      captureColor: gemsColor(GemsTheme.accent),
      rad: GemsTheme.radiusSm,
      font: opts.font ?? -1,
    }),
  );
  return gemsAttachTooltip(el, opts);
};

// Settings-bound select. `items` are { name, value }; the current Settings value
// picks the starting index.
globalThis.gemsSelect = function gemsSelect(key, items, opts = {}) {
  return gemsSelectCustom(
    items,
    gemsSettingsIndex(key, items),
    (_i, value) => {
      Settings.set(key, value);
      if (opts.onChange !== undefined) opts.onChange(value);
    },
    opts,
  );
};

// Data table (UITable): sortable columns, filtering, single selection, a sticky
// header, row scrolling, and keyboard/gamepad browse mode. `columns` is the UITable
// column spec — { label, width?/flex?, align?, text(row), color?(row), sprite?(row),
// sortable?, sortValue?(row) }. The element is sized to show `opts.rows` (8) whole rows
// (no partial rows). Reach the component via `el.getComponent(UITable)` to setRows /
// setFilter / read `.selected`. `opts`: { data, rows, rowH, headerH, width, sortBy,
// sortDir, onSelect, onActivate, emptyText, font, headerFont, tooltip }. This is the
// intended foundation for the table-based RPG inventory (filter + advanced sort).
globalThis.gemsTable = function gemsTable(columns, opts = {}) {
  const rowH = opts.rowH ?? GemsTheme.rowH;
  const headerH = opts.headerH ?? 30;
  const visible = opts.rows ?? 8;
  const pad = GemsTheme.padSm;
  const el = new UIElement({
    width: opts.width ?? "100%",
    height: headerH + visible * rowH + pad * 2,
    flexShrink: 0,
  });
  el.addComponent(
    new UIPanel({
      color: gemsColor(GemsTheme.panelLo),
      rad: GemsTheme.radiusSm,
      border: 1,
      borderColor: gemsColor(GemsTheme.border),
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
      colorText: gemsColor(GemsTheme.text),
      colorMuted: gemsColor(GemsTheme.textMuted),
      colorHeader: gemsColor(GemsTheme.textMuted),
      colorHeaderBg: gemsColor(GemsTheme.panel),
      colorRow: gemsColor(GemsTheme.panelLo),
      colorRowAlt: gemsColor(GemsTheme.panel),
      colorRowHover: gemsColor(GemsTheme.btnHover),
      colorSel: gemsColor(GemsTheme.accent),
      colorBorder: gemsColor(GemsTheme.border),
      colorArrow: gemsColor(GemsTheme.accent),
      colorArrow2: gemsColor(GemsTheme.textMuted),
      trackColor: gemsColor(GemsTheme.panelLo),
      thumbColor: gemsColor(GemsTheme.border),
      thumbHover: gemsColor(GemsTheme.borderHi),
    }),
  );
  return gemsAttachTooltip(el, opts);
};
