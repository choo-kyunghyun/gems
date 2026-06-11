// ── GemsUI kit: theme + helpers ───────────────────────────────
// The GemsUI kit is a themed factory library for building scene UIs declaratively:
// the gems* factories compose UIElement + the UI* components so scenes never
// hand-wire panels/text/colors. It is split across GemsTheme / GemsContainers /
// GemsWidgets / GemsControls so no single file grows large enough to trip GMRT's
// large-file handling (see the globalThis note below).
//
// Every visual constant lives in GemsTheme; colors are stored as hex strings and
// parsed lazily in gemsColor (Color may not be loaded when this script's top level
// runs, so we never call Color.parse at module scope).
//
// GMRT note: every factory across these files is assigned via
// `globalThis.X = function X(...)`, NOT a bare `function X(...)` declaration. Past a
// certain file size GMRT 0.19 stops hoisting some bare top-level declarations into
// global scope and faults at startup ("cannot coerce undefined or null value into
// object"). Explicit globalThis assignment plus keeping each file small is reliable.

globalThis.GemsTheme = {
  // ── Surfaces (cool slate; `panelLo` is the darker edge of the card vignette) ──
  panel: "#272b34", // section / card fill (roundrect center)
  panelLo: "#1f222a", // card edge — darker, reads as depth
  // ── Buttons ──
  btn: "#323845",
  btnHover: "#3e4658",
  btnPress: "#23272f",
  // ── Accent — slider fills, focus glow, primary buttons ──
  accent: "#4a9eff",
  accentHi: "#74b6ff", // brighter accent (primary hover / glow)
  accentPress: "#3174d4",
  // ── Text ──
  text: "#f1f4fa",
  textMuted: "#9aa3b2",
  textDim: "#6c7585",
  // ── Lines & bevels ──
  border: "#3c4350",
  borderHi: "#566173", // hover/active outline glow
  highlight: "#ffffff", // inner top sheen (drawn at low alpha)
  // ── Geometry ──
  radius: 14,
  radiusSm: 9,
  pad: 18,
  padSm: 12,
  gap: 12,
  gapSm: 8,
  rowH: 50, // button / control height
  headerH: 64,
  // ── Motion ──
  animSpeed: 16, // hover/press easing rate
};

// Accept a theme key, hex string, or raw color int → color int.
globalThis.gemsColor = function gemsColor(c) {
  if (typeof c === "number") return c;
  if (GemsTheme[c] !== undefined) return Color.parse(GemsTheme[c]);
  return Color.parse(c);
};

// Accept a string or a () => string → a live textRef.
globalThis.gemsTextRef = function gemsTextRef(label) {
  return typeof label === "function" ? label : () => label;
};
