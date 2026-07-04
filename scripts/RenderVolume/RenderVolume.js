/**
 * VOLUME pass of the art projection contract (ROADMAP.md — Art Rework): draws each
 * `Volume` + `Position` entity as an axis-aligned box. Under the fixed-yaw pitched ortho
 * camera only TWO faces are ever visible — the plan-view TOP (lying at -height over the
 * footprint) and the elevation FRONT (a true vertical quad at the footprint's south edge) —
 * so a box is exactly two quads. Real geometry in the depth buffer (z-write on for this loop
 * only, like RenderBillboard), so pawns sort against deep furniture per-pixel with zero
 * manual layering. Face textures are authored in canonical views (top = plan, front =
 * elevation, north/top row first); the pitched camera foreshortens them like the terrain.
 * Faces must stay OPAQUE or alpha-test cutout: alpha-blended geometry that writes depth
 * occludes what's behind its soft pixels (the billboard hard-alpha rule).
 * @implements {RenderPass}
 */
globalThis.RenderVolume = class RenderVolume {
  constructor(opt) {
    opt = opt ?? {};
    this.enabled = true;
    this._rp = { x: 0, y: 0 }; // reused lerp scratch
    // same guarded texel-alpha cutout as RenderBillboard (GMRT's fixed-function alpha test is
    // inert). Set ONLY around sprite faces: sh_alphatest samples gm_BaseTexture, which reads
    // BLACK on an untextured primitive and would discard the flat-fill faces entirely.
    this._shader = asset_get_index("sh_alphatest");
    this._shaderOk =
      shaders_are_supported() && shader_is_compiled(this._shader);
    this._uAlphaRef = this._shaderOk
      ? shader_get_uniform(this._shader, "u_alphaRef")
      : -1;
    this.alphaRef = opt.alphaRef ?? 0.5; // texel cutout threshold (shape only, tint-safe)
  }

  destroy() {}

  // one face under the current world matrix — local rect (0,0)-(w,h): the sprite stretched
  // over it when the NAME resolves (asset_get_index returns an opaque ref — validate with
  // sprite_exists, never >= 0), else a flat color fill
  _face(name, color, alpha, w, h) {
    const spr = name ? asset_get_index(name) : -1;
    if (name && sprite_exists(spr)) {
      if (this._shaderOk) {
        shader_set(this._shader);
        shader_set_uniform_f(this._uAlphaRef, this.alphaRef);
      }
      draw_sprite_stretched_ext(spr, 0, 0, 0, w, h, color, alpha);
      if (this._shaderOk) shader_reset();
    } else {
      draw_rectangle_color(0, 0, w, h, color, color, color, color, false);
    }
  }

  draw(world) {
    const ident = matrix_build_identity();
    // depth-writing like RenderBillboard (global default is off — obj_game Create_0)
    gpu_set_zwriteenable(true);
    for (const entity of world.query(Volume, Position)) {
      const vol = world.get(Volume, entity);
      const rp = InterpolationSystem.lerp(world, entity, this._rp);
      const x0 = rp.x - vol.width / 2;
      const y0 = rp.y - vol.depth / 2;
      const alpha = vol.alpha ?? 1;
      // TOP: plan-view quad lying flat at -height over the footprint (up = -z)
      matrix_set(
        matrix_world,
        matrix_build(x0, y0, -vol.height, 0, 0, 0, 1, 1, 1),
      );
      this._face(vol.topSprite, vol.topColor, alpha, vol.width, vol.depth);
      // FRONT: true vertical quad at the south edge — xrot -90 maps local +y to world +z
      // (the billboard tilt extended to fully upright), so anchoring the local origin at
      // -height spans the face from its top edge down to the ground; it shares that top
      // edge with the TOP quad exactly, so the seam can't gap or z-fight
      matrix_set(
        matrix_world,
        matrix_build(x0, y0 + vol.depth, -vol.height, -90, 0, 0, 1, 1, 1),
      );
      this._face(vol.frontSprite, vol.frontColor, alpha, vol.width, vol.height);
    }
    matrix_set(matrix_world, ident);
    gpu_set_zwriteenable(false); // restore global default — ground passes stay painter-order
  }
};
