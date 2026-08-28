// The overview the FacetContainers / FacetWidgets / FacetControls / FacetSettings buckets cite.

/**
 * Themed factory library: facet* factories compose UIElement + UI* components, and EVERY visual
 * constant lives here — a factory composes these keys, never a literal color or spacing number.
 * Colors are stored as hex and parsed lazily (Color may not be loaded at module scope). The kit
 * is split by what a factory does — FacetContainers hold children, FacetWidgets show a value,
 * FacetControls edit one or fire an action, FacetSettings bind them to Settings — each file
 * declaring factories as `globalThis.X = function X(…)` per the GMRT large-file hoisting rule
 * (#15564).
 *
 * Opt conventions (kit-wide): `label`/`onText`/`offText` take a string OR a live `() => string`
 * (I18n.textRef); `facetButton`'s `disabled`/`selected` take a live `() => bool` re-read each
 * frame; color opts take a theme key, hex string, or color int (facetColor). Hover/press easing
 * runs on Time.raw (the clock split, ARCHITECTURE.md).
 *
 * The look is FLAT: a surface is a solid fill + a 1px border, never a shadow, sheen or radial
 * tint. A card (facetCard — the HUD, overlay and modal chrome) is translucent (`cardAlpha`) so the
 * world reads through it; everything inside a card is opaque and never nests another card — a
 * section is a title over a rule, a well (`panelLo`) an inset, a control a solid fill — so one
 * card is one pane of glass. Feedback is color only (hover/press/selected fills + border).
 *
 * Theme modes: every COLOR key (and `cardAlpha`) lives in two palettes (dark, light).
 * `setMode(mode)` copies the active palette onto the flat FacetTheme keys the factories read, so
 * each `FacetTheme.<key>` resolves to the current mode. Factories bake those values into UI
 * components at BUILD time, so a LIVE swap must rebuild the UI afterwards (the Game object's
 * retheme() → each scene's retheme()); it is NOT read live per frame. Geometry/motion are
 * theme-independent and stay flat on the object.
 */
globalThis.FacetTheme = {
  // ── Geometry ──
  radius: 10,
  radiusSm: 6,
  // bumped to breathe under the 16px body font (12px values read cramped)
  pad: 20,
  padSm: 14,
  gap: 14,
  gapSm: 10,
  // Row heights — every kit item is one of these, so a size change is a theme edit, not a sweep
  rowH: 56, // button / input / checkbox row / accordion header
  rowHSm: 40, // compact list button (facetFillList, quick-set rows, category items)
  fieldH: 44, // boxed field chassis (select / dropdown / stepper)
  sliderH: 36, // slider row (the thumb/track scale from it — UISlider)
  lineH: 30, // text row (facetKeyValueRow, table header, plain label rows)
  tabH: 44, // horizontal tab strip
  rowLabelW: 160, // facetRow label column width (label | control)
  menuWidth: 760, // centered max-width for menu scenes (lobby/settings/…)
  headerH: 64,
  // ── Motion ──
  animSpeed: 16, // hover/press easing rate

  // ── Palettes — colors + the card alpha differ between modes (geometry/motion are shared) ──
  palettes: {
    dark: {
      // Surfaces
      panel: "#272b34", // card fill
      panelLo: "#1f222a", // well — the inset surface (tracks, slots, list rows) inside a card
      cardAlpha: 0.84, // a card over the world: the world reads through, the text still holds
      bg: "#222222", // scene backdrop (draw_clear)
      // Buttons
      btn: "#323845",
      btnHover: "#3e4658",
      btnPress: "#23272f",
      // Accent — slider fills, focus glow, primary buttons
      accent: "#4a9eff",
      accentHi: "#74b6ff", // brighter (primary hover / glow)
      accentPress: "#3174d4",
      onAccent: "#f7faff", // label/glyph color drawn ON an accent fill (stays light both modes)
      // Text
      text: "#f1f4fa",
      textMuted: "#9aa3b2",
      textDim: "#6c7585",
      // Lines
      border: "#3c4350",
      borderHi: "#566173", // hover/active outline
      // Semantic status (readouts/quest states/dialogue prompts)
      good: "#54c98a", // positive / met / confirm
      warn: "#ffd166", // caution / ready / attention — the kit's gold
      bad: "#e0584f", // failure / damage taken / refused
    },
    light: {
      // Surfaces
      panel: "#f4f6fa",
      panelLo: "#e7ebf1",
      cardAlpha: 0.94, // a light card goes milky over a green world — nearly opaque
      bg: "#e7eaef",
      // Buttons
      btn: "#e9edf3",
      btnHover: "#dbe1ea", // darker on hover (interactive cue on a light surface)
      btnPress: "#cbd3df",
      // Accent — deepened so it carries contrast on light + keeps onAccent text legible
      accent: "#2f7fe6",
      accentHi: "#4a9eff",
      accentPress: "#1f60c0",
      onAccent: "#f7faff",
      // Text
      text: "#1b2230",
      textMuted: "#55606f",
      textDim: "#8792a1",
      // Lines
      border: "#cfd6e0",
      borderHi: "#9aa6b6", // darker = a visible outline over a light card
      // Semantic status — darkened so they read on light surfaces
      good: "#2f9e6a",
      warn: "#b8790a",
      bad: "#c0392f",
    },
  },
  mode: "dark",

  /** Swap the active color palette ("dark"|"light"; no-op on an unknown mode). Rebuild the UI after — colors are baked at build. */
  setMode: function setMode(mode) {
    const p = FacetTheme.palettes[mode];
    if (p === undefined) return;
    FacetTheme.mode = mode;
    for (const k in p) FacetTheme[k] = p[k]; // for..in over a plain object is GMRT-safe
    FacetTheme._applyCore();
  },

  /**
   * THE seam that carries a palette swap to the Core singletons that draw themselves outside the
   * UIElement tree — Tooltip/Toast/Dialogue (GUI chrome) and FloatingText (world-space numbers).
   * No facet* factory can reach them, so the kit pushes instead (the injection idiom,
   * ARCHITECTURE.md); their own field defaults are only what shows before the first setMode.
   * No-op while the globals are still loading: the seeding setMode below runs at script load,
   * where neither Color nor the singletons exist yet (GMRT load order) — the boot call in
   * Game Create_0 is the one that lands.
   */
  _applyCore: function _applyCore() {
    if (
      globalThis.Color === undefined ||
      globalThis.Tooltip === undefined ||
      globalThis.Toast === undefined ||
      globalThis.Dialogue === undefined ||
      globalThis.FloatingText === undefined
    )
      return;
    const panel = facetColor("panelLo"); // the darkest surface — an overlay sits above the cards
    const border = facetColor("border");
    const text = facetColor("text");
    const accent = facetColor("accent");

    Tooltip.panelColor = panel;
    Tooltip.borderColor = border;
    Tooltip.textColor = text;

    Toast.panelColor = panel;
    Toast.borderColor = border;
    Toast.textColor = text;
    Toast.accents.info = accent;
    Toast.accents.success = facetColor("good");
    Toast.accents.warn = facetColor("warn");
    Toast.accents.error = facetColor("bad");

    Dialogue.panelColor = panel;
    Dialogue.panelAlpha = FacetTheme.cardAlpha; // a card over the world (Tooltip/Toast sit over UI: opaque)
    Dialogue.borderColor = border;
    Dialogue.textColor = text;
    Dialogue.plateColor = facetColor("panel");
    Dialogue.plateBorder = accent;
    Dialogue.speakerColor = facetColor("accentHi");
    Dialogue.chevronColor = facetColor("accentHi");

    FloatingText.colors.damage = text;
    FloatingText.colors.hurt = facetColor("bad");
    FloatingText.colors.heal = facetColor("good");
    FloatingText.colors.crit = facetColor("warn");
    FloatingText.colors.mana = accent;
  },
};
FacetTheme.setMode("dark"); // seed the flat color keys with the default palette

/** Resolve a theme key, hex string, or raw color int into a GameMaker color int. */
globalThis.facetColor = function facetColor(c) {
  if (typeof c === "number") return c;
  if (FacetTheme[c] !== undefined) return Color.parse(FacetTheme[c]);
  return Color.parse(c);
};

/** Normalize a string or () => string into a live textRef — kit-facing alias of Core's uiTextRef. */
globalThis.facetTextRef = function facetTextRef(label) {
  return uiTextRef(label);
};

