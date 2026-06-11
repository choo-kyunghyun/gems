// spr dual-grid inspector — lays out all 16 dual-grid frames so a corner tileset
// can be checked against the rule used by RenderTileMap's autotile:"dual" mode:
//   frame index = corner mask, TL=1 TR=2 BR=4 BL=8.
// Each case fills the quadrants gray where that frame's mask bit is set and draws
// the sprite frame on top. If the art's opaque quadrants match the gray markers,
// the frame order is correct and the tileset is valid for dual-grid stacking.

SceneRegistry.add(() => new _SceneTileInspectDualClass(), {
  label: I18n.textRef("TILEINSDUAL_NAME"),
  category: "SCENE_CAT_MAP",
});

class _SceneTileInspectDualClass extends Scene {
  label = "TileInspectDual";

  create(openScene) {
    this.sprite = asset_get_index("spr_tiledual"); // 16-frame corner tileset
    this.camera = cameraPan();
    this.camera.assign(0);

    this.ui = new UIElement({
      width: "100%",
      height: "100%",
      padding: 16,
      gap: 8,
    });
    UI.insert(this.ui);
    const hint = new UIElement();
    hint.addComponent(
      new UIText({
        textRef: I18n.textRef("TILEINSDUAL_HINT"),
        color: Color.parse("#cccccc"),
      }),
    );
    this.ui.insertChild(hint);
    this.ui.insertChild(
      makeButton(I18n.textRef("TILEINS_BACK"), () => openScene(SCENES.lobby)),
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

    const SW2 = 60; // size of each swatch (expected | actual)
    const HALF = SW2 * 0.5;
    const GAP2 = 8; // gap between the expected and actual swatches
    const caseW = SW2 * 2 + GAP2;
    const caseH = SW2 + 26; // + label row
    const COLS = 4;
    const ROWS = 4;

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

    const labelFont = I18n.font("normal_24");
    if (labelFont !== undefined) draw_set_font(labelFont);
    const cornerCol = Color.parse("#3a3a3a");
    const cellCol = Color.parse("#1c1c1c");
    const scale = SW2 / 16;

    for (let f = 0; f < 16; f++) {
      const col = f % COLS;
      const row = Math.floor(f / COLS);
      const tx = gapX + col * (caseW + gapX);
      const ty = top + gapY + row * (caseH + gapY);

      // Left swatch — EXPECTED: gray quadrants where the corner bit is set.
      const ex = tx;
      const ax = tx + SW2 + GAP2;
      draw_set_alpha(1);
      draw_set_color(cellCol);
      draw_rectangle(ex, ty, ex + SW2, ty + SW2, false);
      draw_set_color(cornerCol);
      if (f & 1) draw_rectangle(ex, ty, ex + HALF, ty + HALF, false); // TL
      if (f & 2) draw_rectangle(ex + HALF, ty, ex + SW2, ty + HALF, false); // TR
      if (f & 4)
        draw_rectangle(ex + HALF, ty + HALF, ex + SW2, ty + SW2, false); // BR
      if (f & 8) draw_rectangle(ex, ty + HALF, ex + HALF, ty + SW2, false); // BL
      draw_set_color(c_white);
      draw_rectangle(ex, ty, ex + SW2, ty + SW2, true);

      // Right swatch — ACTUAL: the sprite frame.
      draw_set_color(cellCol);
      draw_rectangle(ax, ty, ax + SW2, ty + SW2, false);
      if (f < frames) {
        draw_sprite_ext(spr, f, ax, ty, scale, scale, 0, c_white, 1);
      }
      draw_set_color(c_white);
      draw_rectangle(ax, ty, ax + SW2, ty + SW2, true);

      // Label: frame index + filled corners.
      let bits = "";
      if (f & 1) bits += "TL ";
      if (f & 2) bits += "TR ";
      if (f & 4) bits += "BR ";
      if (f & 8) bits += "BL";
      const label = bits.trim();

      draw_set_halign(fa_center);
      draw_set_valign(fa_top);
      draw_set_color(f < frames ? c_white : c_red);
      draw_text(
        tx + caseW * 0.5,
        ty + SW2 + 4,
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
