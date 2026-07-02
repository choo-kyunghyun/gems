// world-z bias between paper-doll layers so draw order beats coplanar float-rounding (see the
// doll-stack comment in draw); world px — invisible on screen, decisive in the depth buffer
const BB_LAYER_DZ = 0.05;

/**
 * 2.5D entity renderer: stands each foot-anchored sprite up in 3D via a world matrix so
 * front-view art reads correctly under a pitched camera (CameraFollow.create2d `pitch`).
 * only geometry that writes depth — z-write on for this loop only so overlapping bodies
 * sort per-pixel; ground passes stay painter-order (z-write off) to avoid z-fighting.
 * requires hard-alpha sprites: soft edges write depth on transparent pixels and occlude
 * what's behind them.
 * @implements {RenderPass}
 */
globalThis.RenderBillboard = class RenderBillboard {
  constructor(opt) {
    opt = opt ?? {};
    this.enabled = true;
    // negated camera pitch stands the sprite facing the lens (verified by in-engine sweep)
    this.tiltDeg = -(opt.pitchDeg ?? 0);
    // when set, tracks live camera pitch each frame so debug pitch tweaks stay in sync
    this.camera = opt.camera;
    this._rp = { x: 0, y: 0 }; // reused lerp scratch
    // GMRT's fixed-function alpha test (gpu_set_alphatestref) is inert — transparent pixels still
    // write depth and occlude geometry behind them. sh_alphatest discards sub-threshold TEXEL
    // alpha in the fragment shader so no depth write occurs. guarded: asset_get_index returns an
    // opaque ref (not a number), so use shaders_are_supported + shader_is_compiled to validate.
    this._shader = asset_get_index("sh_alphatest");
    this._shaderOk =
      shaders_are_supported() && shader_is_compiled(this._shader);
    this._uAlphaRef = this._shaderOk
      ? shader_get_uniform(this._shader, "u_alphaRef")
      : -1;
    this.alphaRef = opt.alphaRef ?? 0.5; // texel cutout threshold (shape only, dim-safe)
  }

  destroy() {}

  // one Appearance layer at the body's subimg/transform, z-biased by `dz` (see the doll-stack
  // comment in draw). Layers keep their OWN color — the body's Visual.color is the SKIN tint of
  // the white spr_human template, so it must not bleed into outfit colors; whole-doll effects
  // (downed dim) ride visual.alpha, which layers share.
  _drawLayer(layer, visual, rp, tiltDeg, dz) {
    matrix_set(
      matrix_world,
      matrix_build(rp.x, rp.y, dz, tiltDeg, 0, 0, 1, 1, 1),
    );
    draw_sprite_ext(
      layer.sprite,
      visual.subimg,
      0,
      0,
      visual.xscale,
      visual.yscale,
      0,
      layer.color,
      visual.alpha,
    );
  }

  draw(world) {
    const ident = matrix_build_identity();
    // live pitch tracks debug camera tweaks; fallback to constructor tilt
    const tiltDeg =
      this.camera !== undefined ? -(this.camera.pitchDeg ?? 0) : this.tiltDeg;
    // only pass that writes depth; global default is off (obj_game Create_0) to avoid z-fighting
    // in coplanar ground passes — restore after
    gpu_set_zwriteenable(true);
    // sh_alphatest discards transparent texels so they don't write depth (GMRT fixed-function alpha
    // test is inert — see constructor comment). guarded; falls back to no shader if unavailable.
    if (this._shaderOk) {
      shader_set(this._shader);
      shader_set_uniform_f(this._uAlphaRef, this.alphaRef);
    }
    for (const entity of world.query(Visual, Position)) {
      const visual = world.get(Visual, entity);
      const rp = InterpolationSystem.lerp(world, entity, this._rp);
      if (visual.speed !== 0) {
        visual.time += visual.speed * Time.raw;
        visual.subimg =
          Math.floor(visual.time) % sprite_get_number(visual.sprite);
      }
      // Paper-doll layers (Appearance) draw at the body's subimg/transform but CANNOT rely on
      // coplanar depth equality: sprites are auto-trimmed on the texture page, so each sheet's
      // quad has different vertices and the interpolated depth diverges by float rounding — a
      // later layer randomly loses the lessequal test (a raider bald under its bandana). Bias
      // each layer a hair along world z instead (front toward the camera = -z under the pitched
      // view, back away), so stack order wins deterministically; BB_LAYER_DZ is far above fp
      // error and far below a visible shift.
      const ap = world.get(Appearance, entity);
      if (ap !== undefined) {
        for (let i = 0; i < ap.back.length; i++)
          this._drawLayer(
            ap.back[i],
            visual,
            rp,
            tiltDeg,
            (ap.back.length - i) * BB_LAYER_DZ,
          );
      }
      matrix_set(
        matrix_world,
        matrix_build(rp.x, rp.y, 0, tiltDeg, 0, 0, 1, 1, 1),
      );
      draw_sprite_ext(
        visual.sprite,
        visual.subimg,
        0,
        0,
        visual.xscale,
        visual.yscale,
        0,
        visual.color,
        visual.alpha,
      );
      if (ap !== undefined) {
        for (let i = 0; i < ap.front.length; i++)
          this._drawLayer(
            ap.front[i],
            visual,
            rp,
            tiltDeg,
            -(i + 1) * BB_LAYER_DZ,
          );
      }
      matrix_set(matrix_world, ident);
    }
    matrix_set(matrix_world, ident);
    if (this._shaderOk) shader_reset();
    gpu_set_zwriteenable(false); // restore global default — only billboards write depth
  }
};
