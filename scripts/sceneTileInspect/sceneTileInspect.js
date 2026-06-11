// spr_tile16 inspector — lays out all 16 blob4 frames so the sprite art can be
// checked against the autotile rule (frame index = neighbor mask, N=1 E=2 S=4 W=8).
// Each case draws frame f in the center cell; the gray cells mark the neighbors
// that mask f implies. If the art's open/closed edges match the gray neighbors,
// the frame order is correct.

SceneRegistry.add(
  () => new _SceneTileInspectClass(),
  { label: I18n.textRef("TILEINS_NAME"), category: "SCENE_CAT_MAP" },
);

class _SceneTileInspectClass extends Scene {
  label = "TileInspect";

  create(openScene) {
    this.sprite = asset_get_index("spr_tile16");
    this.camera = cameraPan();
    this.camera.assign(0);

    this.ui = gemsRoot({ gap: GemsTheme.gapSm });
    UI.insert(this.ui);
    this.ui.insertChild(gemsLabel(I18n.textRef("TILEINS_HINT"), { color: "#cccccc" }));
    this.ui.insertChild(gemsButton(I18n.textRef("TILEINS_BACK"), () => openScene(SCENES.lobby)));
  }

  step() {
    this.camera.update();
  }

  draw() {
    const spr = this.sprite;
    const frames = sprite_get_number(spr);

    const sw = surface_get_width(application_surface);
    const sh = surface_get_height(application_surface);

    const CELL = 36;             // one mini-grid cell (display px)
    const caseW = CELL * 3;
    const caseH = CELL * 3 + 12; // + label row
    const cols = 4;
    const rows = 4;

    // Reserve the top strip for the UI hint + back button.
    const top = 130;
    const bottom = 16;
    const areaW = sw;
    const areaH = sh - top - bottom;
    const gapX = (areaW - cols * caseW) / (cols + 1);
    const gapY = (areaH - rows * caseH) / (rows + 1);

    const color = draw_get_color();
    const alpha = draw_get_alpha();
    const halign = draw_get_halign();
    const valign = draw_get_valign();
    const font = draw_get_font();

    const labelFont = I18n.font("default");
    if (labelFont !== undefined) draw_set_font(labelFont);
    const neighborCol = Color.parse("#3a3a3a");
    const cellCol = Color.parse("#1c1c1c");
    const scale = CELL / 16;

    for (let f = 0; f < 16; f++) {
      const col = f % cols;
      const row = Math.floor(f / cols);
      const cx = gapX + col * (caseW + gapX);
      const cy = top + gapY + row * (caseH + gapY);

      const midX = cx + CELL; // center cell top-left
      const midY = cy + CELL;

      // Neighbor markers — gray where mask bit f implies a connection.
      draw_set_alpha(1);
      draw_set_color(neighborCol);
      if (f & 1) draw_rectangle(midX, cy, midX + CELL, cy + CELL, false);             // N
      if (f & 2) draw_rectangle(midX + CELL, midY, midX + 2 * CELL, midY + CELL, false); // E
      if (f & 4) draw_rectangle(midX, midY + CELL, midX + CELL, midY + 2 * CELL, false); // S
      if (f & 8) draw_rectangle(cx, midY, cx + CELL, midY + CELL, false);             // W

      // Center cell backdrop + the sprite frame.
      draw_set_color(cellCol);
      draw_rectangle(midX, midY, midX + CELL, midY + CELL, false);
      if (f < frames) {
        draw_sprite_ext(spr, f, midX, midY, scale, scale, 0, c_white, 1);
      }
      draw_set_color(c_white);
      draw_rectangle(midX, midY, midX + CELL, midY + CELL, true);

      // Label: index + which neighbor bits are set.
      const letters =
        (f & 1 ? "N" : "") + (f & 2 ? "E" : "") + (f & 4 ? "S" : "") + (f & 8 ? "W" : "");
      draw_set_halign(fa_center);
      draw_set_valign(fa_top);
      draw_set_color(f < frames ? c_white : c_red);
      draw_text(cx + caseW * 0.5, cy + CELL * 3 + 4, `${f}  ${letters === "" ? "—" : letters}`);
    }

    draw_set_color(color);
    draw_set_alpha(alpha);
    draw_set_halign(halign);
    draw_set_valign(valign);
    if (labelFont !== undefined) draw_set_font(font);
  }

  destroy() {
    UI.remove(this.ui);
    this.ui.destroy();
    this.camera.destroy();
  }
}
