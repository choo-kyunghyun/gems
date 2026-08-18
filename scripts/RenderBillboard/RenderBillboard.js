// world-Y bias between paper-doll layers so draw order beats coplanar float-rounding (see the
// doll-stack comment in draw); world px — invisible on screen, decisive in the depth buffer.
// Y, not Z: an UPRIGHT sprite's quad is a constant-y vertical plane, so a z offset just
// slides the layer WITHIN that plane (zero depth separation — the z-bias that worked for the
// old reclined billboards silently died with the upright adoption, and the bald-raider
// z-fight returned); ±y moves the plane itself toward/away from the south-side camera.
const BB_LAYER_DY = 0.05;

// Sprite sun response: STANDING sprites draw under sh_meshlit's textured mode with a fixed
// BENT normal riding the u_normal uniform — 30° south of straight-up, so a sprite nearly
// faces the noon sun (daylight = the authored colors, clamped), dims + warms toward
// dawn/dusk, and a point light prefers the camera-side face (a flame south of the sprite
// lights the face you see; behind it falls to the shader's wrap fill). Lighting is
// per-PIXEL: a tall sprite half inside a torch pool lights half-and-half.
const BB_NORMAL_Y = 0.5; // bent normal (0, 0.5, -0.866) — unit, up = -z
const BB_NORMAL_Z = -0.866;

/**
 * THE ART PROJECTION CONTRACT, of which this is the STANDING pass — how each category of art
 * reaches the pitched 2.5D screen, so everything shares one depth model:
 *   STANDING  upright sprites (here) — pawns, props with no volume
 *   VOLUME    baked vox meshes (RenderMesh over the `Mesh` component) — deep furniture
 *   WALLS     tile-layer boxes (RenderWalls) — the built environment
 * All three write depth and light through sh_meshlit; the ground stays painter-order.
 *
 * 2.5D STANDING pass: draws each foot-anchored sprite UPRIGHT (90° off the ground, Don't
 * Starve / Paper Mario) via a world matrix, under the pitch-by-zoom camera
 * (CameraFollow's `pitchCurve`). Upright — NOT perpendicular-to-view: a
 * camera-facing billboard under a mostly-top-down pitch reclines ~cos(pitch) of its height
 * along the ground, so at wall contact the body crosses the wall mesh's depth and buries
 * itself; an upright sprite's top is always camera-side of geometry it stands in front of. The camera pitch foreshortens
 * upright sprites to sin(pitch) of their height — the accepted look of the art rework.
 * Only geometry that writes depth — z-write on for this loop only so overlapping bodies
 * sort per-pixel; ground passes stay painter-order (z-write off) to avoid z-fighting.
 * requires hard-alpha sprites: soft edges write depth on transparent pixels and occlude
 * what's behind them.
 * Sprites draw under sh_meshlit (textured + texel cutout, bent normal via u_normal) — ONE
 * world shader: with `opt.lights` (the host RenderMesh pass) they share its sun + point
 * gather and light per-pixel like the meshes; unset → neutral uniforms (full-bright albedo,
 * cutout only — the flat default).
 * @implements {RenderPass}
 */
globalThis.RenderBillboard = class RenderBillboard {
  constructor(opt) {
    opt = opt ?? {};
    this.enabled = true;
    this.tiltDeg = opt.tiltDeg ?? -90; // -90 = upright off the flat-on-ground default
    this._rp = { x: 0, y: 0 }; // reused lerp scratch
    // THE world shader (sh_meshlit) in textured + cutout mode: the texel-alpha discard keeps
    // transparent pixels from writing depth (GMRT's fixed-function alpha test is inert —
    // this replaced the retired sh_alphatest), and the mesh lighting model shades each
    // sprite per-pixel at the bent normal. Guarded: without it sprites draw plain
    // fixed-function (unlit, no cutout — the same degradation as RenderMesh).
    this._lit = asset_get_index("sh_meshlit");
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
    this.alphaRef = opt.alphaRef ?? 0.5; // texel cutout threshold (shape only, dim-safe)
    // opt.lights = the host RenderMesh pass: its setupLights supplies this frame's sun +
    // view-culled point lights (ONE shared gather — a sprite and the mesh beside it can't
    // diverge). Unset (flat maps, the default) → neutral uniforms: full-bright albedo with
    // the cutout only.
    this.lights = opt.lights;
  }

  destroy() {}

  /**
   * one Appearance layer at the body's subimg/transform, depth-biased by `dy` along world Y
   * (+y = south = toward the camera; see the doll-stack comment in draw). Layers keep their
   * OWN color — the body's Visual.color is the SKIN tint of the white spr_human template, so
   * it must not bleed into outfit colors; whole-doll effects (downed dim) ride visual.alpha,
   * which layers share — the shader lights every layer identically (same uniforms).
   */
  _drawLayer(layer, visual, rp, tiltDeg, dy) {
    matrix_set(
      matrix_world,
      matrix_build(rp.x, rp.y + dy, 0, tiltDeg, 0, 0, 1, 1, 1),
    );
    if (layer.anchor !== undefined) {
      // ANCHORED layer: a single-frame sprite (a held item's icon) drawn at the BODY
      // sheet's named per-frame attachment point (SpriteMeta `anchors`) instead of the
      // shared strip subimg — so any item sprite rides the hand with no dedicated held
      // sheet. Offset is origin-relative source px; the signed xscale mirrors both the
      // offset and the icon with the facing flip. No anchor table on the body sheet →
      // nothing drawn (an undeclared sheet is legal).
      const a = SpriteMeta.anchor(visual.sprite, layer.anchor, visual.subimg);
      if (a === undefined) return;
      const k = layer.scale ?? 1;
      draw_sprite_ext(
        layer.sprite,
        0,
        a[0] * visual.xscale,
        a[1] * visual.yscale,
        visual.xscale * k,
        visual.yscale * k,
        0,
        layer.color,
        visual.alpha,
      );
      return;
    }
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

  draw(entities) {
    const ident = matrix_build_identity();
    const tiltDeg = this.tiltDeg; // constant upright — no camera-pitch tracking
    // only pass that writes depth; global default is off (Game Create_0) to avoid z-fighting
    // in coplanar ground passes — restore after
    gpu_set_zwriteenable(true);
    if (this._litOk) {
      if (this.lights !== undefined && this.lights.litOk) {
        this.lights.setupLights(entities); // shader_set + the shared sun/point-light gather
      } else {
        // neutral light: full-bright albedo — the cutout is the only shader effect
        shader_set(this._lit);
        shader_set_uniform_f(this._uAmbient, 1);
        shader_set_uniform_f(this._uSunDir, 0, 0, -1, 0);
        shader_set_uniform_f(this._uSunColor, 1, 1, 1);
        shader_set_uniform_f(this._uLightCount, 0);
      }
      shader_set_uniform_f(this._uUseTex, 1); // sprites: real UVs, tint via the draw colour
      shader_set_uniform_f(this._uNormal, 0, BB_NORMAL_Y, BB_NORMAL_Z);
      shader_set_uniform_f(this._uAlphaRef, this.alphaRef);
    }
    for (const entity of entities.query(Visual, Position)) {
      const visual = entities.get(Visual, entity);
      const rp = InterpolationSystem.lerp(entities, entity, this._rp);
      // an invalid BODY sprite — or an SVG one, which exists but reports 0 frames on GMRT —
      // draws as the spr_missing placeholder; re-wrap subimg into the placeholder's frame
      // range. Appearance layers keep visual.subimg (their sheets mirror the body strip) and
      // are sprite_exists-guarded upstream by AppearanceSystem.
      let sprite = visual.sprite;
      let subimg = visual.subimg;
      if (!sprite_exists(sprite) || sprite_get_number(sprite) < 1) {
        sprite = spr_missing;
        subimg = subimg % sprite_get_number(sprite);
      }
      if (visual.speed !== 0) subimg = AnimationSystem.advance(visual, sprite);
      // Paper-doll layers (Appearance) draw at the body's subimg/transform but CANNOT rely on
      // coplanar depth equality: sprites are auto-trimmed on the texture page, so each sheet's
      // quad has different vertices and the interpolated depth diverges by float rounding — a
      // later layer randomly loses the lessequal test (a raider bald under its bandana). Bias
      // each layer a hair along world Y instead (front toward the south-side camera = +y, back
      // away = -y — an upright quad is a constant-y plane, so only a Y offset separates depth;
      // a z offset slides within the plane), so stack order wins deterministically;
      // BB_LAYER_DY is far above fp error and far below a visible shift.
      const ap = entities.get(Appearance, entity);
      if (ap !== undefined) {
        for (let i = 0; i < ap.back.length; i++)
          this._drawLayer(
            ap.back[i],
            visual,
            rp,
            tiltDeg,
            -(ap.back.length - i) * BB_LAYER_DY,
          );
      }
      matrix_set(
        matrix_world,
        matrix_build(rp.x, rp.y, 0, tiltDeg, 0, 0, 1, 1, 1),
      );
      draw_sprite_ext(
        sprite,
        subimg,
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
            (i + 1) * BB_LAYER_DY,
          );
      }
      matrix_set(matrix_world, ident);
    }
    matrix_set(matrix_world, ident);
    if (this._litOk) shader_reset();
    gpu_set_zwriteenable(false); // restore global default — only billboards write depth
  }
};
