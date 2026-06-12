// ── GemsUI kit: text / tooltip / buttons ──────────────────────
// See GemsTheme.js for the kit overview + the GMRT globalThis-assignment rule.

// Standalone text node. Width/height auto-fit to the string (UIText).
globalThis.gemsLabel = function gemsLabel(label, opts = {}) {
  const el = new UIElement();
  el.addComponent(
    new UIText({
      textRef: gemsTextRef(label),
      color: gemsColor(opts.color ?? GemsTheme.text),
      halign: opts.halign ?? fa_left,
      font: opts.font ?? -1,
    }),
  );
  return gemsAttachTooltip(el, opts);
};

// Rich text node: a markup string with colored spans + inline icons (UIRichText).
// Width/height auto-fit to the parsed content, like gemsLabel. `opts.palette` maps
// `[c=name]` tags to colors (theme key / hex / int, parsed via gemsColor); the kit's
// semantic names (`accent`, `textMuted`, …) are merged in for free. `opts.iconSize`
// overrides the inline-icon size (defaults to the line height).
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

// Quest tracker: a live HUD list bound to the global QuestLog (UIQuestTracker), on a
// fixed-size panel. Sized to the currently-active quests by default so an enclosing
// gemsScroll can reveal overflow; pass opts.height to fix it. Build it AFTER the quests
// are registered + accepted (it measures QuestLog at construction). opts.emptyText
// (string or () => string) shows when no quest is active.
globalThis.gemsQuestTracker = function gemsQuestTracker(opts = {}) {
  const tracker = new UIQuestTracker({
    titleFontKey: "default",
    bodyFontKey: "description",
    emptyText: opts.emptyText ?? "",
    titleColor: gemsColor(opts.titleColor ?? GemsTheme.text),
    readyColor: gemsColor(opts.readyColor ?? "#ffd166"),
    metColor: gemsColor(opts.metColor ?? "#54c98a"),
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

// Minimap / radar: a framed UINineSlice panel (the frame) + a UIMinimap (the blips)
// that plots a World's tagged entities around a target. `opts`: { world, target (center
// entity id), range (world units to the edge), size (px, square), rules ([{ tag, color }],
// color = theme key / hex / int), frameSprite, frameColor, blipSize, playerColor }.
globalThis.gemsMinimap = function gemsMinimap(opts = {}) {
  const size = opts.size ?? 160;
  const rules = [];
  const src = opts.rules ?? [];
  for (let i = 0; i < src.length; i++)
    rules.push({ tag: src[i].tag, color: gemsColor(src[i].color) });

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
      world: opts.world,
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

// One-line help/hint text on a readable card backdrop. Use instead of a bare
// gemsLabel for overlays that would otherwise float as low-contrast text over a
// scene's render (e.g. the tile-inspector "press X to…" lines).
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

// Attach a hover tooltip to any element and return it (chainable). `label` is a
// string or () => string (live I18n.textRef). Added at index 0 so a sibling
// interactive component (e.g. the UIButton this describes) setting `block` while
// hovered doesn't suppress its own tooltip. `opts.delay` overrides the dwell time.
//
// The widget factories also take this directly: pass `opts.tooltip` (string or
// () => string) — and optionally `opts.tooltipDelay` — to gemsButton/gemsToggle/
// gemsIconButton/gemsSlider/gemsSelect(Custom)/gemsInput/gemsLabel and they call this
// for you, so callers rarely wrap by hand.
globalThis.gemsTooltip = function gemsTooltip(element, label, opts = {}) {
  element.addComponent(
    new UITooltip({ label: gemsTextRef(label), delay: opts.delay }),
    0,
  );
  return element;
};

// Internal: honor `opts.tooltip` on a factory's element. No-op when unset.
globalThis.gemsAttachTooltip = function gemsAttachTooltip(element, opts) {
  if (opts.tooltip != null) {
    gemsTooltip(element, opts.tooltip, { delay: opts.tooltipDelay });
  }
  return element;
};

// `opts.primary: true` paints the button in the accent color for a highlighted
// call-to-action. The label is centered both axes; hover eases the fill + a border
// glow + a shadow lift (see UIButton), press sinks it.
globalThis.gemsButton = function gemsButton(label, onClick, opts = {}) {
  const primary = opts.primary ?? false;
  const base = opts.color ?? (primary ? GemsTheme.accent : GemsTheme.btn);
  const hover =
    opts.colorHover ?? (primary ? GemsTheme.accentHi : GemsTheme.btnHover);
  const press =
    opts.colorPress ?? (primary ? GemsTheme.accentPress : GemsTheme.btnPress);
  const bdr =
    opts.borderColor ?? (primary ? GemsTheme.accentHi : GemsTheme.border);
  const bdrHover = primary ? GemsTheme.text : GemsTheme.borderHi;

  const btn = new UIElement({
    height: opts.height ?? GemsTheme.rowH,
    width: opts.width ?? "100%",
    justifyContent: "center",
    alignItems: "center",
  });
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
  btn.addComponent(
    new UIButton({
      colorNormal: gemsColor(base),
      colorHover: gemsColor(hover),
      colorPress: gemsColor(press),
      borderColorNormal: gemsColor(bdr),
      borderColorHover: gemsColor(bdrHover),
      animSpeed: GemsTheme.animSpeed,
      onClick,
    }),
  );
  btn.insertChild(
    gemsLabel(label, {
      halign: fa_center,
      color: opts.textColor ?? GemsTheme.text,
      font: opts.font,
    }),
  );
  return gemsAttachTooltip(btn, opts);
};

// Square button holding a sprite (OBJECT_FIT.CONTAIN inside padding).
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

// Boolean button: renders `label: ON/OFF`, live from getValue(); click → onToggle.
// onText/offText may be strings or () => string (for live i18n).
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
