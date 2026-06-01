draw_text(8, 64, `[Q] Faster\n[E] Slower\nScale: ${Time.scale}\nRaw: ${this.rawAcc}\nAcc: ${this.deltaAcc}`);

const rawCol = make_color_hsv((this.rawAcc * 10) % 0xff, 256, 256);
const accCol = make_color_hsv((this.deltaAcc * 10) % 0xff, 256, 256);

draw_circle_color(192, 256, 64, rawCol, rawCol, false);
draw_circle_color(360, 256, 64, accCol, accCol, false);
