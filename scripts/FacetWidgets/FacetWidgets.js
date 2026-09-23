/**
 * Auto-fitting text node. Pass `opts.font` as an I18n font key rather than a resolved handle so
 * it survives a language switch. `opts.wrap` (px) wraps to that width; omit for one line.
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
 * Auto-fitting markup with colored spans and inline icons. `opts.palette` maps `[c=name]` tags to
 * colors, over the kit's semantic names.
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
 * Live quest list bound to `opts.source`, a quest log. Without `opts.height` it measures the
 * active quests at construction, so build it after they are accepted.
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

/** Non-interactive fill bar; `getValue` is () => 0..1, read live. */
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

/** Hint text on a card backdrop, where a bare label would be low-contrast over the scene. */
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
 * label:value row with the value at the right edge. `opts.grow` makes it a flexing cell, for
 * packing pairs side by side in one row.
 */
globalThis.facetKeyValueRow = function facetKeyValueRow(
  label,
  value,
  opts = {},
) {
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

globalThis.facetClear = function facetClear(host) {
  const kids = [...host.children];
  for (let i = 0; i < kids.length; i++) kids[i].destroy();
};

/**
 * One selectable button per entry, or a dim empty notice. `entries` is
 * [{ label, onPick, selected: () => bool, textColor?, icon? }].
 */
globalThis.facetFillList = function facetFillList(host, entries, emptyLabel) {
  facetClear(host);
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
 * Key-bind hint bar, recomposed each frame so it tracks remaps and the active input context.
 * `entries` is { label, contexts?, actions? | text? }: `actions` read their live bindings, `text`
 * is a literal for a non-rebindable key, and `contexts` omitted means always shown.
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
 * Chainable. Added first so a sibling that blocks the pointer while hovered doesn't suppress its
 * own tooltip.
 */
globalThis.facetTooltip = function facetTooltip(element, label, opts = {}) {
  element.addComponent(
    new UITooltip({ label: facetTextRef(label), delay: opts.delay }),
    0,
  );
  return element;
};

globalThis.facetAttachTooltip = function facetAttachTooltip(element, opts) {
  if (opts.tooltip != null) {
    facetTooltip(element, opts.tooltip, { delay: opts.tooltipDelay });
  }
  return element;
};
