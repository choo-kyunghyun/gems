// See GemsTheme.js for the kit overview + the GMRT globalThis-assignment rule.

/**
 * Standalone text node, auto-fitting to the string (UIText). Pass `opts.font` as an I18n
 * font KEY (string), NOT a pre-resolved handle — the widget re-resolves it each draw so it
 * survives a language switch (resolve-at-draw GMRT-Safe Idiom); a raw handle also works.
 * `opts.wrap` (px) wraps to that width; omit for a single auto-fit line.
 */
globalThis.gemsLabel = function gemsLabel(label, opts = {}) {
  const el = new UIElement();
  el.addComponent(
    new UIText({
      textRef: gemsTextRef(label),
      color: gemsColor(opts.color ?? GemsTheme.text),
      halign: opts.halign ?? fa_left,
      font: opts.font ?? -1,
      w: opts.wrap ?? -1,
    }),
  );
  return gemsAttachTooltip(el, opts);
};

/**
 * Rich text node: markup with colored spans + inline icons (UIRichText), auto-fitting
 * like gemsLabel. `opts.palette` maps `[c=name]` tags to colors; the kit's semantic
 * names (accent/muted/dim) are merged in. `opts.iconSize` overrides the icon size.
 */
globalThis.gemsRichText = function gemsRichText(markup, opts = {}) {
  const palette = {};
  const src = opts.palette ?? {};
  for (const name in src) palette[name] = gemsColor(src[name]);
  if (palette.accent == null) palette.accent = gemsColor(GemsTheme.accent);
  if (palette.muted == null) palette.muted = gemsColor(GemsTheme.textMuted);
  if (palette.dim == null) palette.dim = gemsColor(GemsTheme.textDim);

  const el = new UIElement();
  el.addComponent(
    new UIRichText({
      textRef: gemsTextRef(markup),
      color: gemsColor(opts.color ?? GemsTheme.text),
      halign: opts.halign ?? fa_left,
      font: opts.font ?? -1,
      iconSize: opts.iconSize ?? -1,
      palette,
    }),
  );
  return gemsAttachTooltip(el, opts);
};

/**
 * Quest tracker: a live HUD list bound to opts.source (a quest log; the RPG passes its
 * QuestLog) — keeps this factory + Core's UIQuestTracker genre-agnostic. Sized to the
 * active quests by default (build it AFTER quests are registered/accepted — it measures
 * at construction); pass opts.height to fix it. opts.emptyText shows when empty.
 */
globalThis.gemsQuestTracker = function gemsQuestTracker(opts = {}) {
  const tracker = new UIQuestTracker({
    source: opts.source ?? null,
    titleFontKey: "default",
    bodyFontKey: "description",
    emptyText: opts.emptyText ?? "",
    titleColor: gemsColor(opts.titleColor ?? GemsTheme.text),
    readyColor: gemsColor(opts.readyColor ?? GemsTheme.warn),
    metColor: gemsColor(opts.metColor ?? GemsTheme.good),
    pendColor: gemsColor(opts.pendColor ?? GemsTheme.textMuted),
    emptyColor: gemsColor(opts.emptyColor ?? GemsTheme.textMuted),
  });
  const el = new UIElement({
    width: opts.width ?? "100%",
    height: opts.height ?? tracker.contentHeight(),
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
  el.addComponent(tracker);
  return gemsAttachTooltip(el, opts);
};

/**
 * Minimap / radar: a framed UINineSlice + a UIMinimap plotting a store's tagged entities
 * around a target. `opts`: { entities, target, range, size, rules ([{ tag, color }]),
 * frameSprite, frameColor, blipSize, playerColor }.
 */
globalThis.gemsMinimap = function gemsMinimap(opts = {}) {
  const size = opts.size ?? 160;
  const rules = [];
  const src = opts.rules ?? []; // [{ has: <component token>, color }] — presence rule per blip type
  for (let i = 0; i < src.length; i++)
    rules.push({ has: src[i].has, color: gemsColor(src[i].color) });

  const el = new UIElement({ width: size, height: size, flexShrink: 0 });
  el.addComponent(
    new UINineSlice({
      sprite: opts.frameSprite ?? asset_get_index("spr_uibox"),
      subimg: 0,
      color: opts.frameColor != null ? gemsColor(opts.frameColor) : c_white,
      alpha: opts.frameAlpha ?? 1,
    }),
  );
  el.addComponent(
    new UIMinimap({
      entities: opts.entities,
      target: opts.target,
      range: opts.range,
      rules,
      inset: opts.inset ?? GemsTheme.padSm,
      blipSize: opts.blipSize,
      playerColor:
        opts.playerColor != null ? gemsColor(opts.playerColor) : undefined,
    }),
  );
  return gemsAttachTooltip(el, opts);
};

/**
 * One-line hint text on a card backdrop — for overlays where a bare gemsLabel would
 * float as low-contrast text over a level's render.
 */
globalThis.gemsHint = function gemsHint(label, opts = {}) {
  const card = gemsCard({ padding: GemsTheme.padSm });
  card.insertChild(
    gemsLabel(label, {
      color: opts.color ?? GemsTheme.textMuted,
      halign: opts.halign ?? fa_left,
      font: opts.font,
    }),
  );
  return card;
};

/**
 * label:value row — label in a growing left cell, value pushed to the right edge by flex.
 * `label`/`value` are strings or live () => string (gemsLabel normalizes). `opts`:
 *   { height (26), gap (0), labelColor (textMuted), valueColor (text),
 *     grow: true — CELL mode: flexGrow/flexBasis instead of width/height, for packing
 *     two label:value pairs side-by-side in one row (WeaponModUI's stat grid) }.
 */
globalThis.gemsKeyValueRow = function gemsKeyValueRow(label, value, opts = {}) {
  const row = new UIElement(
    opts.grow
      ? {
          flexGrow: 1,
          flexBasis: 0,
          flexDirection: "row",
          alignItems: "center",
          gap: opts.gap ?? 0,
        }
      : {
          width: "100%",
          height: opts.height ?? 26,
          flexDirection: "row",
          alignItems: "center",
          gap: opts.gap ?? 0,
        },
  );
  const labelCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
  labelCell.insertChild(
    gemsLabel(label, { color: opts.labelColor ?? GemsTheme.textMuted }),
  );
  row.insertChild(labelCell);
  row.insertChild(
    gemsLabel(value, { color: opts.valueColor ?? GemsTheme.text }),
  );
  return row;
};

/**
 * Clear + refill a list host with one selectable gemsButton per entry, or a dim empty
 * notice. The refill shape shared by the workbench master lists (recipes / weapons):
 * `entries` is [{ label, onPick, selected: () => bool, textColor?, icon? }].
 */
globalThis.gemsFillList = function gemsFillList(host, entries, emptyLabel) {
  const kids = [...host.children];
  for (let i = 0; i < kids.length; i++) kids[i].destroy();
  if (entries.length === 0) {
    host.insertChild(gemsLabel(emptyLabel, { color: GemsTheme.textDim }));
    return;
  }
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    host.insertChild(
      gemsButton(e.label, e.onPick, {
        height: 32,
        selected: e.selected,
        textColor: e.textColor,
        icon: e.icon,
      }),
    );
  }
};

/**
 * Live, context-aware key-bind hint bar. `entries` is { label, contexts?, actions? | text? }:
 *   • label    i18n key or () => string — the action's human name.
 *   • actions  action keys whose CURRENT bindings are read LIVE each frame (a remap updates
 *              the hint with zero wiring). Joined "" if every key is one glyph (→ "WASD") else "/".
 *   • text     a literal label for a non-rebindable key (e.g. "LMB"/"Esc"), not an InputAction.
 *   • contexts InputContext names this entry shows in (omit = always); re-filtered each frame,
 *              so the bar tracks the active context (play / build / window).
 * Built on gemsLabel with a live composer, so it self-sizes and survives a language switch.
 */
globalThis.gemsKeyHints = function gemsKeyHints(entries, opts = {}) {
  const sep = opts.separator ?? "   ·   ";
  const compose = () => {
    const parts = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.contexts !== undefined && !InputContext.allows(e.contexts))
        continue;
      let keys = e.text;
      if (keys === undefined) {
        const labels = [];
        let allSingle = true;
        for (let k = 0; k < e.actions.length; k++) {
          const a = Input.get(e.actions[k]);
          const l = a !== undefined ? a.label() : "—";
          labels.push(l);
          if (l.length !== 1) allSingle = false;
        }
        keys = labels.join(allSingle ? "" : "/");
      }
      const name =
        typeof e.label === "function" ? e.label() : I18n.text(e.label);
      parts.push(keys + ": " + name);
    }
    return parts.join(sep);
  };
  return gemsLabel(compose, {
    color: opts.color ?? GemsTheme.textMuted,
    halign: opts.halign,
    font: opts.font,
  });
};

/**
 * Attach a hover tooltip to any element (chainable). Added at index 0 so a sibling
 * interactive component setting `block` while hovered doesn't suppress its own tooltip.
 * Most factories also accept `opts.tooltip` (+ `opts.tooltipDelay`) and call this for you.
 */
globalThis.gemsTooltip = function gemsTooltip(element, label, opts = {}) {
  element.addComponent(
    new UITooltip({ label: gemsTextRef(label), delay: opts.delay }),
    0,
  );
  return element;
};

/** Internal: honor `opts.tooltip` on a factory's element. No-op when unset. */
globalThis.gemsAttachTooltip = function gemsAttachTooltip(element, opts) {
  if (opts.tooltip != null) {
    gemsTooltip(element, opts.tooltip, { delay: opts.tooltipDelay });
  }
  return element;
};

/**
 * `opts.primary: true` paints the button accent (highlighted CTA). Centered label;
 * hover eases fill + border glow + shadow lift, press sinks it (see UIButton).
 */
globalThis.gemsButton = function gemsButton(label, onClick, opts = {}) {
  const primary = opts.primary ?? false;
  const base = opts.color ?? (primary ? GemsTheme.accent : GemsTheme.btn);
  const hover =
    opts.colorHover ?? (primary ? GemsTheme.accentHi : GemsTheme.btnHover);
  const press =
    opts.colorPress ?? (primary ? GemsTheme.accentPress : GemsTheme.btnPress);
  const bdr =
    opts.borderColor ?? (primary ? GemsTheme.accentHi : GemsTheme.border);
  const bdrHover = primary ? GemsTheme.onAccent : GemsTheme.borderHi;
  // label sits ON the accent fill for a primary button, so it takes onAccent (light in both
  // modes) — plain `text` would go dark in light mode and vanish against the blue.
  const labelColor =
    opts.textColor ?? (primary ? GemsTheme.onAccent : GemsTheme.text);

  // opts.icon: optional sprite drawn left of the label; only then does the layout become a
  // row (no-icon path unchanged)
  const hasIcon = opts.icon != null && sprite_exists(opts.icon);
  const style = {
    height: opts.height ?? GemsTheme.rowH,
    width: opts.width ?? "100%",
    justifyContent: "center",
    alignItems: "center",
  };
  if (hasIcon) {
    style.flexDirection = "row";
    style.gap = GemsTheme.gapSm;
  }
  const btn = new UIElement(style);
  btn.addComponent(
    new UIPanel({
      color: gemsColor(base),
      rad: opts.rad ?? GemsTheme.radiusSm,
      border: opts.border ?? 1,
      borderColor: gemsColor(bdr),
      shadow: opts.shadow ?? 5,
      shadowAlpha: 0.3,
      highlight: 1,
      highlightAlpha: primary ? 0.16 : 0.07,
    }),
  );
  const labelEl = gemsLabel(label, {
    halign: fa_center,
    color: labelColor,
    font: opts.font,
  });
  btn.addComponent(
    new UIButton({
      colorNormal: gemsColor(base),
      colorHover: gemsColor(hover),
      colorPress: gemsColor(press),
      borderColorNormal: gemsColor(bdr),
      borderColorHover: gemsColor(bdrHover),
      animSpeed: GemsTheme.animSpeed,
      // opts.disabled: bool or a live () => bool
      disabled: opts.disabled === true,
      getDisabled: typeof opts.disabled === "function" ? opts.disabled : null,
      // opts.selected: a live () => bool marking the active choice (category bar / palette);
      // tints toward the accent
      getSelected: typeof opts.selected === "function" ? opts.selected : null,
      colorSelected: gemsColor(opts.colorSelected ?? GemsTheme.accentPress),
      borderColorSelected: gemsColor(
        opts.borderColorSelected ?? GemsTheme.accentHi,
      ),
      // grey the label alongside the panel when disabled
      label: labelEl.getComponent(UIText),
      textColorNormal: gemsColor(labelColor),
      textColorDisabled: gemsColor(GemsTheme.textDim),
      onClick,
    }),
  );
  if (hasIcon) {
    const isz = opts.iconSize ?? (opts.height ?? GemsTheme.rowH) - 8;
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
  return gemsAttachTooltip(btn, opts);
};

/** Square button holding a sprite (OBJECT_FIT.CONTAIN inside padding). */
globalThis.gemsIconButton = function gemsIconButton(
  sprite,
  onClick,
  opts = {},
) {
  const sz = opts.size ?? GemsTheme.rowH;
  const btn = new UIElement({ width: sz, height: sz });
  btn.addComponent(
    new UIPanel({
      color: gemsColor(GemsTheme.btn),
      rad: opts.rad ?? GemsTheme.radiusSm,
      border: 1,
      borderColor: gemsColor(GemsTheme.border),
      shadow: opts.shadow ?? 5,
      shadowAlpha: 0.3,
      highlight: 1,
      highlightAlpha: 0.07,
    }),
  );
  btn.addComponent(
    new UIButton({
      colorNormal: gemsColor(GemsTheme.btn),
      colorHover: gemsColor(GemsTheme.btnHover),
      colorPress: gemsColor(GemsTheme.btnPress),
      borderColorNormal: gemsColor(GemsTheme.border),
      borderColorHover: gemsColor(GemsTheme.borderHi),
      animSpeed: GemsTheme.animSpeed,
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
      color: gemsColor(opts.iconColor ?? GemsTheme.text),
    }),
  );
  btn.insertChild(icon);
  return gemsAttachTooltip(btn, opts);
};

/**
 * Boolean button: renders `label: ON/OFF`, live from getValue(); click → onToggle.
 * onText/offText may be strings or () => string (for live i18n).
 */
globalThis.gemsToggle = function gemsToggle(
  label,
  getValue,
  onToggle,
  opts = {},
) {
  const ref = gemsTextRef(label);
  const onRef = gemsTextRef(opts.onText ?? "ON");
  const offRef = gemsTextRef(opts.offText ?? "OFF");
  return gemsButton(
    () => `${ref()}: ${getValue() ? onRef() : offRef()}`,
    onToggle,
    opts,
  );
};
