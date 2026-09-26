/**
 * The facet kit's theme: every visual constant lives here, so a factory composes these keys, never
 * a literal color or spacing number. Colors are stored as hex and parsed lazily, since Color may
 * not be loaded at module scope. Kit files declare factories as `globalThis.X = function X(…)`
 * (docs/GMRT.md #15564).
 *
 * Opt conventions, kit-wide: a label takes a string or a live `() => string`; a button's
 * `disabled`/`selected` take a live `() => bool` re-read each frame; a color opt takes a theme key,
 * hex string or color int. UI motion runs on the wall clock (docs/ARCHITECTURE.md).
 *
 * The look is flat: a surface is a solid fill and a 1px border, never a shadow, sheen or tint. A
 * card is translucent (`cardAlpha`) so the world reads through it; everything inside a card is
 * opaque and never nests another card, so one card is one pane of glass. Feedback is color only.
 *
 * Theme modes: every color key and `cardAlpha` lives in two palettes. `setMode` copies the active
 * one onto the flat keys the factories read. Factories bake those values at build time, so a live
 * swap must rebuild the UI afterwards. Geometry and motion are mode-independent.
 */
globalThis.FacetTheme = {
  // ── Geometry ──
  radius: 10,
  radiusSm: 6,
  // sized to breathe under the 16px body font
  pad: 20,
  padSm: 14,
  gap: 14,
  gapSm: 10,
  // Row heights — every kit item is one of these, so a size change is a theme edit, not a sweep
  rowH: 56, // button / input / checkbox row / accordion header
  rowHSm: 40, // compact list button
  fieldH: 44, // boxed field: select / dropdown
  sliderH: 36, // the thumb and track scale from it
  lineH: 30, // text row
  tabH: 44,
  rowLabelW: 160, // label column of a label | control row
  menuWidth: 760, // centered max-width for menu scenes
  headerH: 64,
  // ── Motion ──
  animSpeed: 16, // hover/press easing rate

  // ── Palettes ──
  palettes: {
    dark: {
      // Surfaces
      panel: "#272b34", // card fill
      panelLo: "#1f222a", // well — the inset surface inside a card
      cardAlpha: 0.84, // the world reads through, the text still holds
      bg: "#222222", // scene backdrop
      // Buttons
      btn: "#323845",
      btnHover: "#3e4658",
      btnPress: "#23272f",
      // Accent — slider fills, focus glow, primary buttons
      accent: "#4a9eff",
      accentHi: "#74b6ff", // primary hover / glow
      accentPress: "#3174d4",
      onAccent: "#f7faff", // drawn on an accent fill; light in both modes
      // Text
      text: "#f1f4fa",
      textMuted: "#9aa3b2",
      textDim: "#6c7585",
      // Lines
      border: "#3c4350",
      borderHi: "#566173", // hover/active outline
      // Semantic status
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

  /** No-op on an unknown mode. Rebuild the UI after: colors are baked at build. */
  setMode: function setMode(mode) {
    const p = FacetTheme.palettes[mode];
    if (p === undefined) return;
    FacetTheme.mode = mode;
    for (const k in p) FacetTheme[k] = p[k];
    FacetTheme._applyCore();
  },

  /**
   * Pushes the palette onto the Core singletons that draw outside the UI tree, which no factory
   * can reach (the injection idiom, docs/ARCHITECTURE.md). No-op while those globals are still
   * loading, as they are for the seeding call at script load.
   */
  _applyCore: function _applyCore() {
    if (
      globalThis.Color === undefined ||
      globalThis.Tooltip === undefined ||
      globalThis.Toast === undefined ||
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

    FloatingText.colors.damage = text;
    FloatingText.colors.hurt = facetColor("bad");
    FloatingText.colors.heal = facetColor("good");
    FloatingText.colors.crit = facetColor("warn");
    FloatingText.colors.mana = accent;
  },
};
FacetTheme.setMode("dark");

/** Resolve a theme key, hex string, or raw color int into a GameMaker color int. */
globalThis.facetColor = function facetColor(c) {
  if (typeof c === "number") return c;
  if (FacetTheme[c] !== undefined) return Color.parse(FacetTheme[c]);
  return Color.parse(c);
};

/** Normalize a string or () => string into a live textRef. */
globalThis.facetTextRef = function facetTextRef(label) {
  return UIDraw.textRef(label);
};

