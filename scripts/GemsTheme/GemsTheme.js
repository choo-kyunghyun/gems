// ── GemsUI kit: theme + helpers ──────────────────────────────
// Themed factory library; gems* factories compose UIElement + UI* components.
// Split across small files — GMRT stops hoisting bare top-level declarations past
// a file-size threshold and faults at startup; use `globalThis.X = function X(…)`.
// Colors stored as hex and parsed lazily (Color may not be loaded at module scope).
//
// THEME MODES: every COLOR key lives in two palettes (dark = the original look, light).
// `GemsTheme.setMode(mode)` copies the active palette's colors onto the flat GemsTheme keys
// the factories read — so each `GemsTheme.<colorKey>` read resolves to the current mode. The
// factories bake those colors into UI components at BUILD time, so a LIVE swap must rebuild the
// UI afterwards (LevelManager.retheme → each scene's retheme()); it is NOT read live per frame.
// Geometry/motion below are theme-independent and stay flat on the object.

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
      // Lines & bevels
      border: "#3c4350",
      borderHi: "#566173", // hover/active outline glow
      highlight: "#ffffff", // inner top sheen (drawn at low alpha)
      // Semantic status (readouts/quest states/dialogue prompts)
      good: "#54c98a", // positive / met / confirm
      warn: "#ffd166", // caution / ready / attention
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
    },
  },
  mode: "dark",

  /** Swap the active color palette onto the flat color keys (no-op on an unknown mode). Rebuild the UI after — colors are baked at build. @param {"dark"|"light"} mode */
  setMode: function setMode(mode) {
    const p = GemsTheme.palettes[mode];
    if (p === undefined) return;
    GemsTheme.mode = mode;
    for (const k in p) GemsTheme[k] = p[k]; // for..in over a plain object is GMRT-safe
  },
};
GemsTheme.setMode("dark"); // seed the flat color keys with the default palette

/** Resolve a theme key, hex string, or raw color int → a GameMaker color int. @param {string|number} c @returns {number} */
globalThis.gemsColor = function gemsColor(c) {
  if (typeof c === "number") return c;
  if (GemsTheme[c] !== undefined) return Color.parse(GemsTheme[c]);
  return Color.parse(c);
};

/** Normalize a string or () => string into a live textRef. @param {string|(() => string)} label @returns {() => string} */
globalThis.gemsTextRef = function gemsTextRef(label) {
  return typeof label === "function" ? label : () => label;
};
