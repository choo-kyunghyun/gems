// ── GemsUI kit: theme palettes + kit-wide factory conventions ──
// The overview the GemsContainers / GemsWidgets / GemsControls buckets cite.

/**
 * Themed factory library: gems* factories compose UIElement + UI* components, and EVERY visual
 * constant lives here — a factory composes these keys, never a literal color or spacing number.
 * Colors are stored as hex and parsed lazily (Color may not be loaded at module scope). The kit
 * is split across small files, each declaring factories as `globalThis.X = function X(…)` per the
 * GMRT large-file hoisting rule (#15564).
 *
 * Opt conventions (kit-wide): `label`/`onText`/`offText` take a string OR a live `() => string`
 * (I18n.textRef); `gemsButton`'s `disabled`/`selected` take a live `() => bool` re-read each
 * frame; color opts take a theme key, hex string, or color int (gemsColor). Hover/press easing
 * runs on Time.raw (the clock split, ARCHITECTURE.md).
 *
 * Theme modes: every COLOR key lives in two palettes (dark = the original look, light).
 * `setMode(mode)` copies the active palette's colors onto the flat GemsTheme keys the factories
 * read, so each `GemsTheme.<colorKey>` resolves to the current mode. Factories bake those colors
 * into UI components at BUILD time, so a LIVE swap must rebuild the UI afterwards
 * (LevelManager.retheme → each level's retheme()); it is NOT read live per frame. Geometry/motion
 * are theme-independent and stay flat on the object.
 */
globalThis.GemsTheme = {
  // ── Geometry ──
  radius: 14,
  radiusSm: 9,
  // bumped to breathe under the 16px body font (12px values read cramped)
  pad: 20,
  padSm: 14,
  gap: 14,
  gapSm: 10,
  rowH: 50, // button / control height
  rowLabelW: 160, // gemsRow label column width (label | control)
  titleH: 26, // gemsSection title host height (keeps it off the card border)
  menuWidth: 760, // centered max-width for menu scenes (lobby/settings/…)
  headerH: 64,
  // ── Motion ──
  animSpeed: 16, // hover/press easing rate

  // ── Color palettes — ONLY colors differ between modes (geometry/motion are shared) ──
  palettes: {
    dark: {
      // Surfaces
      panel: "#272b34", // section / card fill (roundrect center)
      panelLo: "#1f222a", // card edge — darker, reads as depth
      bg: "#222222", // level backdrop (draw_clear)
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
      // Lines & bevels
      border: "#3c4350",
      borderHi: "#566173", // hover/active outline glow
      highlight: "#ffffff", // inner top sheen (drawn at low alpha)
      // Semantic status (readouts/quest states/dialogue prompts)
      good: "#54c98a", // positive / met / confirm
      warn: "#ffd166", // caution / ready / attention — the kit's gold
      bad: "#e0584f", // failure / damage taken / refused
    },
    light: {
      // Surfaces
      panel: "#f4f6fa",
      panelLo: "#e7ebf1",
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
      // Lines & bevels
      border: "#cfd6e0",
      borderHi: "#9aa6b6", // darker = a visible outline over a light card
      highlight: "#ffffff",
      // Semantic status — darkened so they read on light surfaces
      good: "#2f9e6a",
      warn: "#b8790a",
      bad: "#c0392f",
    },
  },
  mode: "dark",

  /** Swap the active color palette onto the flat color keys (no-op on an unknown mode). Rebuild the UI after — colors are baked at build. @param {"dark"|"light"} mode */
  setMode: function setMode(mode) {
    const p = GemsTheme.palettes[mode];
    if (p === undefined) return;
    GemsTheme.mode = mode;
    for (const k in p) GemsTheme[k] = p[k]; // for..in over a plain object is GMRT-safe
    GemsTheme._applyCore();
  },

  /**
   * THE seam that carries a palette swap to the Core singletons that draw themselves outside the
   * UIElement tree — Tooltip/Toast/Dialogue (GUI chrome) and FloatingText (world-space numbers).
   * No gems* factory can reach them, so the kit pushes instead (the injection idiom,
   * ARCHITECTURE.md); their own field defaults are only what shows before the first setMode.
   * No-op while the globals are still loading: the seeding setMode below runs at script load,
   * where neither Color nor the singletons exist yet (GMRT load order) — the boot call in
   * obj_game Create_0 is the one that lands.
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
    const panel = gemsColor("panelLo"); // the darkest surface — an overlay sits above the cards
    const border = gemsColor("border");
    const text = gemsColor("text");
    const accent = gemsColor("accent");

    Tooltip.panelColor = panel;
    Tooltip.borderColor = border;
    Tooltip.textColor = text;

    Toast.panelColor = panel;
    Toast.borderColor = border;
    Toast.textColor = text;
    Toast.accents.info = accent;
    Toast.accents.success = gemsColor("good");
    Toast.accents.warn = gemsColor("warn");
    Toast.accents.error = gemsColor("bad");

    Dialogue.panelColor = panel;
    Dialogue.borderColor = border;
    Dialogue.textColor = text;
    Dialogue.plateColor = gemsColor("panel");
    Dialogue.plateBorder = accent;
    Dialogue.speakerColor = gemsColor("accentHi");
    Dialogue.chevronColor = gemsColor("accentHi");

    FloatingText.colors.damage = text;
    FloatingText.colors.hurt = gemsColor("bad");
    FloatingText.colors.heal = gemsColor("good");
    FloatingText.colors.crit = gemsColor("warn");
    FloatingText.colors.mana = accent;
  },
};
GemsTheme.setMode("dark"); // seed the flat color keys with the default palette

/** Resolve a theme key, hex string, or raw color int → a GameMaker color int. @param {string|number} c @returns {number} */
globalThis.gemsColor = function gemsColor(c) {
  if (typeof c === "number") return c;
  if (GemsTheme[c] !== undefined) return Color.parse(GemsTheme[c]);
  return Color.parse(c);
};

/** Normalize a string or () => string into a live textRef — kit-facing alias of Core's uiTextRef. @param {string|(() => string)} label @returns {() => string} */
globalThis.gemsTextRef = function gemsTextRef(label) {
  return uiTextRef(label);
};
