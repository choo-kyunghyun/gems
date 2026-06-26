/**
 * 2.5D entity renderer (the adopted RPG default): a drop-in alternative to RenderEntity that
 * STANDS each foot-anchored sprite UP in 3D via a world matrix, so front-view art reads correctly
 * under a pitched follow camera (cameraFollow2d `pitch`). Same Visual/Position query, interp, and
 * looped-anim advance as RenderEntity; only the draw is matrixed — matrix_set(matrix_world,
 * matrix_build(...)) → draw_sprite_ext at the local origin (the sprite's foot) → reset to identity.
 *
 * Depth sorting: this pass is the ONLY geometry that writes depth (gpu_set_zwriteenable on for its
 * loop, restored to off after — see obj_game Create_0), so overlapping bodies sort per-pixel by
 * their stood-up depth (nearer foot wins), retiring the manual Y-sort. The flat ground passes draw
 * with z-write off (painter order) so they don't z-fight as the camera moves. Needs HARD-alpha
 * sprites — soft edges break z-buffer order (a faded edge pixel still writes depth, occluding what's
 * behind it). gpu_set_ztestenable + gpu_set_alphatestenable are both on in obj_game Create_0.
 *
 * @implements {RenderPass}
 */
globalThis.RenderBillboard = class RenderBillboard {
  constructor(opt) {
    opt = opt ?? {};
    this.enabled = true;
    // X-rotation that stands the sprite up FACING the camera = the NEGATIVE of the camera's
    // pitch (verified by an in-engine rotation sweep). Pass the same pitch the follow camera uses.
    this.tiltDeg = -(opt.pitchDeg ?? 0);
    // Optional Camera: when assigned, the tilt TRACKS the camera's live pitch each frame (so a
    // runtime pitch change — the Debug Camera panel — keeps sprites standing toward the camera),
    // overriding the constructor tiltDeg. Assigned by RpgMap.build like RenderLighting/Weather.
    this.camera = opt.camera;
    this._rp = { x: 0, y: 0 }; // reused interp scratch (no per-entity alloc)
    // Manual alpha-test-discard shader: GMRT's fixed-function alpha test (gpu_set_alphatestref) is
    // unreliable on the runtime, so a sprite's transparent pixels still wrote depth and occluded
    // what was behind them. sh_alphatest discards sub-threshold TEXEL pixels in the fragment shader
    // (no depth write). Cached + GUARDED (shaders_are_supported + shader_is_compiled, asset_get_index
    // returns an opaque ref); falls back to no shader (the fixed-function ref) if unavailable.
    this._shader = asset_get_index("sh_alphatest");
    this._shaderOk =
      shaders_are_supported() && shader_is_compiled(this._shader);
    this._uAlphaRef = this._shaderOk
      ? shader_get_uniform(this._shader, "u_alphaRef")
      : -1;
    this.alphaRef = opt.alphaRef ?? 0.5; // texel-alpha cutout (sprite shape; dim-safe)
  }

  destroy() {}

  draw(world) {
    const ident = matrix_build_identity();
    // Track the camera's live pitch when one is assigned (else the fixed constructor tilt).
    const tiltDeg =
      this.camera !== undefined ? -(this.camera.pitchDeg ?? 0) : this.tiltDeg;
    // Billboards are the ONLY depth-sorted geometry: enable z-write for this pass so overlapping
    // bodies sort by their stood-up depth (nearer foot wins). The global default is z-write OFF
    // (obj_game Create_0) so the coplanar flat ground passes don't z-fight as the camera moves —
    // restore it after this pass.
    gpu_set_zwriteenable(true);
    // Manual alpha-test discard (sh_alphatest) so a sprite's transparent pixels skip the depth
    // write — the reliable replacement for GMRT's fixed-function alpha test. Guarded; no-op fallback.
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
      // Foot at (rp.x, rp.y, 0); the X tilt stands the sprite up toward the pitched camera.
      const m = matrix_build(rp.x, rp.y, 0, tiltDeg, 0, 0, 1, 1, 1);
      matrix_set(matrix_world, m);
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
      matrix_set(matrix_world, ident);
    }
    matrix_set(matrix_world, ident);
    if (this._shaderOk) shader_reset();
    gpu_set_zwriteenable(false); // restore the global default (off); only billboards write depth
  }
};
