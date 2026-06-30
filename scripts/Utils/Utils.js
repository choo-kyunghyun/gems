// Standalone helpers shared across the codebase.

/** No-op default callback. */
globalThis.noop = function noop() {};

/** @returns {string} a random RFC-4122 v4 UUID. */
globalThis.uuid = function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/** @param {number} value @returns {number} `value` × current font pixel size (rem-like; falls back to 16px). */
globalThis.rem = function rem(value) {
  const font = draw_get_font();
  const info = font_get_info(font);
  if (info === undefined) return value * 16;
  return value * info.size;
};
