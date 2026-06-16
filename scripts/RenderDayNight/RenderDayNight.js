// NOTE: CURRENTLY UNUSED — superseded by RenderLighting (the 2D light-map pass, which absorbs
// day/night as its ambient term and adds point lights). Kept as a cheaper flat-tint fallback / for
// reuse; sh_daynight is likewise unused. Re-add with renderer.insert for a scene that wants the
// flat day/night tint without the light-map surface work.
//
// World-space render pass that tints the visible world by the WorldClock's day/night
// cycle. Inserted LAST in the RPG renderer so it darkens the tiles + entities, while the
// cues the scene draws AFTER the renderer (station highlight, build cursor, floating
// combat numbers) stay bright. A no-op in full daylight (alpha 0).
//
// Preferred path is the `sh_daynight` shader (a flat tint + a soft screen-space vignette
// that deepens toward the edges); if it isn't supported/compiled — GMRT 0.19 has had
// shader trouble — it falls back to a plain flat-tint rectangle, so the cycle still reads.
// The shader draws an UNtextured full-view rectangle and computes color purely from
// uniforms (no texture sample → no black-primitive issue; see the Shaders guide).
//
// The view rect is read from the held Camera's own fields, NOT camera_get_view_*(id):
// Camera.update() drives the view through camera_set_view_mat/proj_mat and never sets
// camera_set_view_pos/size, so camera_get_view_width returns 0. cameraFollow2d is an ORTHO
// camera centered on (toX, toY) spanning width × height world units (1 unit = 1 px), so
// that rect is the visible view. The scene assigns `pass.camera` after building the camera.
//
// @implements {RenderPass}
globalThis.RenderDayNight = class RenderDayNight {
  constructor(opt = {}) {
    this.enabled = true;
    this.camera = opt.camera; // a Camera instance; assigned by RpgMap.load
    this.vignette = opt.vignette ?? 0.28; // extra tint alpha at the corners

    // Resolve the shader once. shader_is_compiled validates the opaque asset ref (a >= 0
    // test is meaningless on GMRT — see CLAUDE.md); false → use the flat-rect fallback.
    this.shader = asset_get_index("sh_daynight");
    this.shaderOk = shaders_are_supported() && shader_is_compiled(this.shader);
    if (this.shaderOk) {
      this._uTint = shader_get_uniform(this.shader, "u_tint");
      this._uIntensity = shader_get_uniform(this.shader, "u_intensity");
      this._uVignette = shader_get_uniform(this.shader, "u_vignette");
    }
  }

  destroy() {}

  draw(_world) {
    if (this.camera === undefined) return;
    const tint = WorldClock.tint();
    if (tint.alpha <= 0) return; // full daylight — nothing to draw

    const w = this.camera.width;
    const h = this.camera.height;
    // Test > 0 (not <= 0): an uninitialized size could be NaN, and NaN <= 0 is false.
    if (!(w > 0)) return;
    const x1 = this.camera.toX - w / 2;
    const y1 = this.camera.toY - h / 2;
    // Inflate by 2px so camera pixel-rounding can't leave a seam at the screen edge.
    const rx1 = x1 - 2;
    const ry1 = y1 - 2;
    const rx2 = x1 + w + 2;
    const ry2 = y1 + h + 2;

    const color = draw_get_color();
    const alpha = draw_get_alpha();

    if (this.shaderOk) {
      const c = tint.color; // GM color int is 0xBBGGRR — unpack to 0..1 RGB
      shader_set(this.shader);
      shader_set_uniform_f(
        this._uTint,
        (c & 255) / 255,
        ((c >> 8) & 255) / 255,
        ((c >> 16) & 255) / 255,
      );
      shader_set_uniform_f(this._uIntensity, tint.alpha);
      shader_set_uniform_f(this._uVignette, this.vignette);
      draw_rectangle(rx1, ry1, rx2, ry2, false);
      shader_reset();
    } else {
      draw_set_color(tint.color);
      draw_set_alpha(tint.alpha);
      draw_rectangle(rx1, ry1, rx2, ry2, false);
    }

    draw_set_color(color);
    draw_set_alpha(alpha);
  }
};
