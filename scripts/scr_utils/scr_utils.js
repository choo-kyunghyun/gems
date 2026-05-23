function noop() {}

function byte_to_hex(value) {
  const hexs = "0123456789abcdef";
  const hi = hexs.charAt(Math.floor(value / 16));
  const lo = hexs.charAt(value % 16);
  return hi + lo;
}

function uuid() {
  const bytes = new Array(16).fill(0);
  for (let i = 0; i < 16; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  let result = "";
  for (let i = 0; i < 16; i++) {
    result += byte_to_hex(bytes[i]);
    if (i === 3 || i === 5 || i === 7 || i === 9) {
      result += "-";
    }
  }

  return result;
}

function rem(value) {
  const font = draw_get_font();
  const info = font_get_info(font);
  if (info === undefined) return value * 16;
  return value * info.size;
}
