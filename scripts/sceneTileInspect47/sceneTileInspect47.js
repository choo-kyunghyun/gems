// spr_tile47 inspector — lays out all 47 blob8 frames so the sprite art can be
// checked against the autotile rule (frame = _BLOB8[mask],
// N=1 E=2 S=4 W=8 NE=16 SE=32 SW=64 NW=128).
// Each case draws a 3×3 neighbor grid; gray cells mark the neighbors implied by
// the canonical (first-seen) mask for that frame. Corners only appear when both
// adjacent cardinals are set in that canonical mask.

// Canonical 8-bit mask for each frame index 0–46 (first mask that maps to frame f
// via the _BLOB8 LUT in RenderTileMap, precomputed to avoid the GMRT IIFE bug).
const _CANON47 = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 19, 23, 27, 31, 38, 39,
  46, 47, 55, 63, 76, 77, 78, 79, 95, 110, 111, 127, 137, 139, 141, 143, 155,
  159, 175, 191, 205, 207, 223, 239, 255,
];

SceneRegistry.add(() => new _SceneTileInspect47Class(), {
  label: I18n.textRef("TILEINS47_NAME"),
  category: "SCENE_CAT_MAP",
});

class _SceneTileInspect47Class extends Scene {
  label = "TileInspect47";

  create(openScene) {
    this.sprite = asset_get_index("spr_tile47");
    this.camera = cameraPan();
    this.camera.assign(0);

    this.ui = gemsRoot({ gap: GemsTheme.gapSm });
    UI.insert(this.ui);
    this.ui.insertChild(gemsHint(I18n.textRef("TILEINS47_HINT")));
    this.ui.insertChild(
      gemsButton(I18n.textRef("TILEINS_BACK"), () => openScene(SCENES.lobby)),
    );
  }

  step() {
    this.camera.update();
  }

  draw() {
    const spr = this.sprite;
    const frames = sprite_get_number(spr);

    const sw = surface_get_width(application_surface);
    const sh = surface_get_height(application_surface);

    const CELL = 32;
    const COLS = 8;
    const ROWS = 6;
    const caseW = CELL * 3;
    const caseH = CELL * 3 + 26;

    const top = 130;
    const bottom = 16;
    const areaW = sw;
    const areaH = sh - top - bottom;
    const gapX = (areaW - COLS * caseW) / (COLS + 1);
    const gapY = (areaH - ROWS * caseH) / (ROWS + 1);

    const prevColor = draw_get_color();
    const prevAlpha = draw_get_alpha();
    const prevHalign = draw_get_halign();
    const prevValign = draw_get_valign();
    const prevFont = draw_get_font();

    const labelFont = I18n.font("default");
    if (labelFont !== undefined) draw_set_font(labelFont);
    const neighborCol = Color.parse("#3a3a3a");
    const cellCol = Color.parse("#1c1c1c");
    const scale = CELL / 16;

    for (let f = 0; f < 47; f++) {
      const col = f % COLS;
      const row = Math.floor(f / COLS);
      const cx = gapX + col * (caseW + gapX);
      const cy = top + gapY + row * (caseH + gapY);

      const m = _CANON47[f];

      // 3×3 grid — highlight each occupied neighbor cell gray.
      // Cell positions (top-left of each CELL×CELL box):
      //   NW=(cx, cy)        N=(cx+CELL, cy)        NE=(cx+2*CELL, cy)
      //   W =(cx, cy+CELL)   C=(cx+CELL, cy+CELL)   E =(cx+2*CELL, cy+CELL)
      //   SW=(cx, cy+2*CELL) S=(cx+CELL, cy+2*CELL) SE=(cx+2*CELL, cy+2*CELL)
      draw_set_alpha(1);
      draw_set_color(neighborCol);
      if (m & 1) draw_rectangle(cx + CELL, cy, cx + 2 * CELL, cy + CELL, false); // N
      if (m & 2)
        draw_rectangle(
          cx + 2 * CELL,
          cy + CELL,
          cx + 3 * CELL,
          cy + 2 * CELL,
          false,
        ); // E
      if (m & 4)
        draw_rectangle(
          cx + CELL,
          cy + 2 * CELL,
          cx + 2 * CELL,
          cy + 3 * CELL,
          false,
        ); // S
      if (m & 8) draw_rectangle(cx, cy + CELL, cx + CELL, cy + 2 * CELL, false); // W
      if (m & 16)
        draw_rectangle(cx + 2 * CELL, cy, cx + 3 * CELL, cy + CELL, false); // NE
      if (m & 32)
        draw_rectangle(
          cx + 2 * CELL,
          cy + 2 * CELL,
          cx + 3 * CELL,
          cy + 3 * CELL,
          false,
        ); // SE
      if (m & 64)
        draw_rectangle(cx, cy + 2 * CELL, cx + CELL, cy + 3 * CELL, false); // SW
      if (m & 128) draw_rectangle(cx, cy, cx + CELL, cy + CELL, false); // NW

      // Center cell: dark background + sprite frame.
      draw_set_color(cellCol);
      draw_rectangle(cx + CELL, cy + CELL, cx + 2 * CELL, cy + 2 * CELL, false);
      if (f < frames) {
        draw_sprite_ext(
          spr,
          f,
          cx + CELL,
          cy + CELL,
          scale,
          scale,
          0,
          c_white,
          1,
        );
      }
      draw_set_color(c_white);
      draw_rectangle(cx + CELL, cy + CELL, cx + 2 * CELL, cy + 2 * CELL, true);

      // Label: frame index + active neighbor directions.
      let bits = "";
      if (m & 1) bits += "N ";
      if (m & 16) bits += "NE ";
      if (m & 2) bits += "E ";
      if (m & 32) bits += "SE ";
      if (m & 4) bits += "S ";
      if (m & 64) bits += "SW ";
      if (m & 8) bits += "W ";
      if (m & 128) bits += "NW";
      const label = bits.trim();

      draw_set_halign(fa_center);
      draw_set_valign(fa_top);
      draw_set_color(f < frames ? c_white : c_red);
      draw_text(
        cx + caseW * 0.5,
        cy + CELL * 3 + 4,
        `${f}  ${label === "" ? "—" : label}`,
      );
    }

    draw_set_color(prevColor);
    draw_set_alpha(prevAlpha);
    draw_set_halign(prevHalign);
    draw_set_valign(prevValign);
    if (labelFont !== undefined) draw_set_font(prevFont);
  }

  destroy() {
    UI.remove(this.ui);
    this.ui.destroy();
    this.camera.destroy();
  }
}
