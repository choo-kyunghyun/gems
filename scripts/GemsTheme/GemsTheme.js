// ── GemsUI kit: theme + helpers ──────────────────────────────
// Themed factory library; gems* factories compose UIElement + UI* components.
// Split across small files — GMRT stops hoisting bare top-level declarations past
// a file-size threshold and faults at startup; use `globalThis.X = function X(…)`.
// Colors stored as hex and parsed lazily (Color may not be loaded at module scope).

globalThis.GemsTheme = {
  // Surfaces
  panel: "#272b34", // section / card fill (roundrect center)
  panelLo: "#1f222a", // card edge — darker, reads as depth
  // Buttons
  btn: "#323845",
  btnHover: "#3e4658",
  btnPress: "#23272f",
  // Accent — slider fills, focus glow, primary buttons
  accent: "#4a9eff",
  accentHi: "#74b6ff", // brighter (primary hover / glow)
  accentPress: "#3174d4",
  // Text
  text: "#f1f4fa",
  textMuted: "#9aa3b2",
  textDim: "#6c7585",
  // Lines & bevels
  border: "#3c4350",
  borderHi: "#566173", // hover/active outline glow
  highlight: "#ffffff", // inner top sheen (drawn at low alpha)
  // Geometry
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
  // Motion
  animSpeed: 16, // hover/press easing rate
};

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
