globalThis.noop = function noop() {}

globalThis.byte_to_hex = function byte_to_hex(value) {
  const hexs = "0123456789abcdef";
  const hi = hexs.charAt(Math.floor(value / 16));
  const lo = hexs.charAt(value % 16);
  return hi + lo;
}

globalThis.uuid = function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

globalThis.rem = function rem(value) {
  const font = draw_get_font();
  const info = font_get_info(font);
  if (info === undefined) return value * 16;
  return value * info.size;
}
