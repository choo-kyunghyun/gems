// A sprite's fixed normal, bent 30° south of up: it nearly faces the noon sun and prefers
// point lights on the camera side. Unit, up = -z.
const BB_NORMAL_Y = 0.5;
const BB_NORMAL_Z = -0.866;

/**
 * The standing pass of the pitched 2.5D view: each foot-anchored sprite drawn upright, writing
 * depth so overlapping bodies sort per-pixel against the rest of the depth-writing world.
 * Upright rather than camera-facing, so a body's top stays camera-side of the geometry it stands
 * in front of instead of reclining into a wall. The quad is drawn 1/sin(pitch) tall so its screen
 * height is exactly source × zoom and the texel grid stays whole. Sprites need hard alpha: a soft
 * edge writes depth on transparent pixels. Lit per-pixel with the meshes when given a light
 * source; otherwise full-bright with the texel cutout only.
 * @implements {RenderPass}
 */
globalThis.RenderBillboard = class RenderBillboard {
  constructor(opt) {
    opt = opt ?? {};
    this.enabled = true;
    this.tiltDeg = opt.tiltDeg ?? -90; // upright
    // The texel cutout keeps transparent pixels from writing depth (docs/GMRT.md). Without the
    // shader, sprites draw unlit with no cutout.
    this._lit = shMeshlit;
    this._litOk = shaders_are_supported() && shader_is_compiled(this._lit);
    this._uAmbient = this._litOk
      ? shader_get_uniform(this._lit, "u_ambient")
      : -1;
    this._uSunDir = this._litOk
      ? shader_get_uniform(this._lit, "u_sunDir")
      : -1;
    this._uSunColor = this._litOk
      ? shader_get_uniform(this._lit, "u_sunColor")
      : -1;
    this._uChroma = this._litOk
      ? shader_get_uniform(this._lit, "u_chroma")
      : -1;
    this._uWave = this._litOk ? shader_get_uniform(this._lit, "u_wave") : -1;
    this._uLightCount = this._litOk
      ? shader_get_uniform(this._lit, "u_lightCount")
      : -1;
    this._uUseTex = this._litOk
      ? shader_get_uniform(this._lit, "u_useTex")
      : -1;
    this._uNormal = this._litOk
      ? shader_get_uniform(this._lit, "u_normal")
      : -1;
    this._uAlphaRef = this._litOk
      ? shader_get_uniform(this._lit, "u_alphaRef")
      : -1;
    this.alphaRef = opt.alphaRef ?? 0.5; // texel cutout threshold
    // one shared light gather, so a sprite and the mesh beside it can't diverge
    this.lights = opt.lights;
    this.camera = opt.camera; // its live pitch drives the height compensation
  }

  destroy() {}

  /**
   * The pitch compensation, also the silhouette-to-world-z rate: a point `a` silhouette px up a
   * standing sprite stands at world z = −a·tall(pitch).
   */
  static tall(pitch) {
    return pitch > 0 ? 1 / Math.sin(pitch) : 1;
  }

  draw(entities) {
    const ident = matrix_build_identity();
    const tiltDeg = this.tiltDeg;
    const pitch = this.camera !== undefined ? this.camera.pitch : 0;
    // scaled on world z: the tilt has already stood the sprite's height along z
    const tall = RenderBillboard.tall(pitch);
    // z-write is off by default so coplanar ground passes don't z-fight — restored after
    gpu_set_zwriteenable(true);
    if (this._litOk) {
      if (this.lights !== undefined && this.lights.litOk) {
        this.lights.setupLights(entities);
      } else {
        // neutral light: the cutout is the only shader effect
        shader_set(this._lit);
        shader_set_uniform_f(this._uAmbient, 1);
        shader_set_uniform_f(this._uSunDir, 0, 0, -1, 0);
        shader_set_uniform_f(this._uSunColor, 1, 1, 1);
        shader_set_uniform_f(this._uChroma, 1);
        shader_set_uniform_f(this._uWave, 0);
        shader_set_uniform_f(this._uLightCount, 0);
      }
      shader_set_uniform_f(this._uUseTex, 1);
      shader_set_uniform_f(this._uNormal, 0, BB_NORMAL_Y, BB_NORMAL_Z);
      shader_set_uniform_f(this._uAlphaRef, this.alphaRef);
    }
    const held = entities.column(Instance); // one index read per sprite, not a get
    const slots = Handle.SLOTS;
    entities.forEach([Sprite, Position], (entity, spr, rp) => {
      if (!spr.visible) return;
      const h = held[entity % slots];
      if (h !== undefined && h.rigged) {
        RenderBillboard._rig(h, spr, rp, tiltDeg, tall);
        return;
      }
      // a missing or frameless (SVG, docs/GMRT.md) sprite draws as the placeholder
      let sprite = spr.sprite;
      let index = spr.index;
      if (!sprite_exists(sprite) || sprite_get_number(sprite) < 1) {
        sprite = pixMissing;
        index = index % sprite_get_number(sprite);
      }
      matrix_set(
        matrix_world,
        matrix_build(rp.x, rp.y, 0, tiltDeg, 0, 0, 1, 1, tall),
      );
      draw_sprite_ext(
        sprite,
        index,
        0,
        0,
        spr.xscale,
        spr.yscale,
        spr.angle,
        spr.blend,
        spr.alpha,
      );
    });
    matrix_set(matrix_world, ident);
    if (this._litOk) shader_reset();
    gpu_set_zwriteenable(false);
  }

  /**
   * A skeletal body draws through its puppet's `draw_self`, the only path that both poses and
   * honours matrix_world (docs/SPINE.md). Its coplanar attachments would z-fight each other, so it
   * draws colour first with z-write off, then depth only, so what draws later still sorts against
   * the silhouette.
   */
  static _rig(h, spr, rp, tiltDeg, tall) {
    matrix_set(
      matrix_world,
      matrix_multiply(Anim.pose(h, spr, rp), matrix_build(rp.x, rp.y, 0, tiltDeg, 0, 0, 1, 1, tall)),
    );
    gpu_set_zwriteenable(false);
    h.inst.draw_self();
    gpu_set_zwriteenable(true);
    gpu_set_colourwriteenable(false, false, false, false);
    h.inst.draw_self();
    gpu_set_colourwriteenable(true, true, true, true);
  }
};
