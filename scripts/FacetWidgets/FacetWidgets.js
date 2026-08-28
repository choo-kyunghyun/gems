// See FacetTheme.js for the kit overview + the GMRT globalThis-assignment rule.

/**
 * Standalone text node, auto-fitting to the string (UIText). Pass `opts.font` as an I18n
 * font KEY (string), NOT a pre-resolved handle — the widget re-resolves it each draw so it
 * survives a language switch (resolve-at-draw GMRT-Safe Idiom); a raw handle also works.
 * `opts.wrap` (px) wraps to that width; omit for a single auto-fit line.
 */
globalThis.facetLabel = function facetLabel(label, opts = {}) {
  const el = new UIElement();
  el.addComponent(
    new UIText({
      textRef: facetTextRef(label),
      color: facetColor(opts.color ?? FacetTheme.text),
      halign: opts.halign ?? fa_left,
      font: opts.font ?? -1,
      w: opts.wrap ?? -1,
    }),
  );
  return facetAttachTooltip(el, opts);
};

/**
 * Rich text node: markup with colored spans + inline icons (UIRichText), auto-fitting
 * like facetLabel. `opts.palette` maps `[c=name]` tags to colors; the kit's semantic
 * names (accent/muted/dim) are merged in. `opts.iconSize` overrides the icon size.
 */
globalThis.facetRichText = function facetRichText(markup, opts = {}) {
  const palette = {};
  const src = opts.palette ?? {};
  for (const name in src) palette[name] = facetColor(src[name]);
  if (palette.accent == null) palette.accent = facetColor(FacetTheme.accent);
  if (palette.muted == null) palette.muted = facetColor(FacetTheme.textMuted);
  if (palette.dim == null) palette.dim = facetColor(FacetTheme.textDim);

  const el = new UIElement();
  el.addComponent(
    new UIRichText({
      textRef: facetTextRef(markup),
      color: facetColor(opts.color ?? FacetTheme.text),
      halign: opts.halign ?? fa_left,
      font: opts.font ?? -1,
      iconSize: opts.iconSize ?? -1,
      palette,
    }),
  );
  return facetAttachTooltip(el, opts);
};

/**
 * Quest tracker: a live HUD list bound to opts.source (a quest log; the colony passes its
 * Tracker) — keeps this factory + Core's UIQuestTracker genre-agnostic. Sized to the
 * active quests by default (build it AFTER quests are registered/accepted — it measures
 * at construction); pass opts.height to fix it. opts.emptyText shows when empty.
 */
globalThis.facetQuestTracker = function facetQuestTracker(opts = {}) {
  const tracker = new UIQuestTracker({
    source: opts.source ?? null,
    titleFontKey: "default",
    bodyFontKey: "description",
    emptyText: opts.emptyText ?? "",
    titleColor: facetColor(opts.titleColor ?? FacetTheme.text),
    readyColor: facetColor(opts.readyColor ?? FacetTheme.warn),
    metColor: facetColor(opts.metColor ?? FacetTheme.good),
    pendColor: facetColor(opts.pendColor ?? FacetTheme.textMuted),
    emptyColor: facetColor(opts.emptyColor ?? FacetTheme.textMuted),
  });
  const el = new UIElement({
    width: opts.width ?? "100%",
    height: opts.height ?? tracker.contentHeight(),
    flexShrink: 0,
  });
  el.addComponent(
    new UIPanel({
      color: facetColor(FacetTheme.panelLo),
      rad: FacetTheme.radiusSm,
      border: 1,
      borderColor: facetColor(FacetTheme.border),
    }),
  );
  el.addComponent(tracker);
  return facetAttachTooltip(el, opts);
};

/**
 * Non-interactive themed progress / fill bar. `getValue` is () => 0..1 (read live).
 * `opts.label` (string or () => string) draws centered; `opts.fillColor`/`trackColor`
 * accept a theme key/hex/int.
 */
globalThis.facetProgress = function facetProgress(getValue, opts = {}) {
  const el = new UIElement({
    height: opts.height ?? 16,
    width: opts.width ?? "100%",
  });
  el.addComponent(
    new UIProgress({
      getValue,
      label: opts.label,
      color: facetColor(opts.textColor ?? FacetTheme.text),
      font: opts.font ?? -1,
      track: {
        color: facetColor(opts.trackColor ?? FacetTheme.btnPress),
        rad: opts.rad,
        border: 1,
        borderColor: facetColor(FacetTheme.border),
      },
      fill: { color: facetColor(opts.fillColor ?? FacetTheme.accent) },
    }),
  );
  return facetAttachTooltip(el, opts);
};

/**
 * One-line hint text on a card backdrop — for overlays where a bare facetLabel would
 * float as low-contrast text over the scene's render.
 */
globalThis.facetHint = function facetHint(label, opts = {}) {
  const card = facetCard({ padding: FacetTheme.padSm });
  card.insertChild(
    facetLabel(label, {
      color: opts.color ?? FacetTheme.textMuted,
      halign: opts.halign ?? fa_left,
      font: opts.font,
    }),
  );
  return card;
};

/**
 * label:value row — label in a growing left cell, value pushed to the right edge by flex.
 * `label`/`value` are strings or live () => string (facetLabel normalizes). `opts`:
 *   { height (lineH), gap (0), labelColor (textMuted), valueColor (text),
 *     grow: true — CELL mode: flexGrow/flexBasis instead of width/height, for packing
 *     two label:value pairs side-by-side in one row (WeaponModUI's stat grid) }.
 */
globalThis.facetKeyValueRow = function facetKeyValueRow(label, value, opts = {}) {
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
          height: opts.height ?? FacetTheme.lineH,
          flexDirection: "row",
          alignItems: "center",
          gap: opts.gap ?? 0,
        },
  );
  const labelCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
  labelCell.insertChild(
    facetLabel(label, { color: opts.labelColor ?? FacetTheme.textMuted }),
  );
  row.insertChild(labelCell);
  row.insertChild(
    facetLabel(value, { color: opts.valueColor ?? FacetTheme.text }),
  );
  return row;
};

/**
 * Clear + refill a list host with one selectable facetButton per entry, or a dim empty
 * notice. The refill shape shared by the workbench master lists (recipes / weapons):
 * `entries` is [{ label, onPick, selected: () => bool, textColor?, icon? }].
 */
globalThis.facetFillList = function facetFillList(host, entries, emptyLabel) {
  const kids = [...host.children];
  for (let i = 0; i < kids.length; i++) kids[i].destroy();
  if (entries.length === 0) {
    host.insertChild(facetLabel(emptyLabel, { color: FacetTheme.textDim }));
    return;
  }
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    host.insertChild(
      facetButton(e.label, e.onPick, {
        height: FacetTheme.rowHSm,
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
 * Built on facetLabel with a live composer, so it self-sizes and survives a language switch.
 */
globalThis.facetKeyHints = function facetKeyHints(entries, opts = {}) {
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
  return facetLabel(compose, {
    color: opts.color ?? FacetTheme.textMuted,
    halign: opts.halign,
    font: opts.font,
  });
};

/**
 * Attach a hover tooltip to any element (chainable). Added at index 0 so a sibling
 * interactive component setting `block` while hovered doesn't suppress its own tooltip.
 * Most factories also accept `opts.tooltip` (+ `opts.tooltipDelay`) and call this for you.
 */
globalThis.facetTooltip = function facetTooltip(element, label, opts = {}) {
  element.addComponent(
    new UITooltip({ label: facetTextRef(label), delay: opts.delay }),
    0,
  );
  return element;
};

/** Internal: honor `opts.tooltip` on a factory's element. No-op when unset. */
globalThis.facetAttachTooltip = function facetAttachTooltip(element, opts) {
  if (opts.tooltip != null) {
    facetTooltip(element, opts.tooltip, { delay: opts.tooltipDelay });
  }
  return element;
};
