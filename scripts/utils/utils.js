globalThis.noop = function noop() {};

globalThis.uuid = function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

globalThis.rem = function rem(value) {
  const font = draw_get_font();
  const info = font_get_info(font);
  if (info === undefined) return value * 16;
  return value * info.size;
};
