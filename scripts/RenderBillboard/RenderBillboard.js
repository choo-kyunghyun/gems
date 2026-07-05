// world-Y bias between paper-doll layers so draw order beats coplanar float-rounding (see the
// doll-stack comment in draw); world px — invisible on screen, decisive in the depth buffer.
// Y, not Z: an UPRIGHT sprite's quad is a constant-y vertical plane, so a z offset just
// slides the layer WITHIN that plane (zero depth separation — the z-bias that worked for the
// old reclined billboards silently died with the upright adoption, and the bald-raider
// z-fight returned); ±y moves the plane itself toward/away from the south-side camera.
const BB_LAYER_DY = 0.05;

// Sprite sun response (ROADMAP art rework): the sh_meshlit lighting model evaluated ONCE per
// entity on the CPU at a fixed BENT normal — no shader — so STANDING sprites dim/warm with the
// sun and catch torchlight like the mesh faces beside them. The normal leans 30° south of
// straight-up: it nearly faces the noon sun (daylight modulation ~1 → the authored colors,
// clamped), dims + warms toward dawn/dusk, and gives point lights a camera-side preference
// (a flame south of the sprite lights the face you see; behind it falls to the wrap fill).
const BB_SUN_NY = 0.5; // bent normal (0, 0.5, -0.866) — unit, up = -z
const BB_SUN_NZ = -0.866;
const BB_POINT_FILL = 0.4; // wrap-light fill share — must match sh_meshlit.fsh POINT_FILL
const BB_SAMPLE_Z = -8; // the one sample point per sprite: mid-body height

/**
 * 2.5D STANDING pass: draws each foot-anchored sprite UPRIGHT (90° off the ground, Don't
 * Starve / Paper Mario) via a world matrix, under the pitch-by-zoom camera
 * (CameraFollow.create2d `pitchCurve`). Upright — NOT perpendicular-to-view: a
 * camera-facing billboard under a mostly-top-down pitch reclines ~cos(pitch) of its height
 * along the ground, so at wall contact the body crossed the wall mesh's depth and buried
 * (adopted 2026-07-05, replacing the tilt = -cameraPitch tracking); an upright sprite's top
 * is always camera-side of geometry it stands in front of. The camera pitch foreshortens
 * upright sprites to sin(pitch) of their height — the accepted look of the art rework.
 * Only geometry that writes depth — z-write on for this loop only so overlapping bodies
 * sort per-pixel; ground passes stay painter-order (z-write off) to avoid z-fighting.
 * requires hard-alpha sprites: soft edges write depth on transparent pixels and occlude
 * what's behind them.
 * With `opt.lights` (the host RenderMesh pass) each sprite's tint is modulated by the
 * sh_meshlit model at a bent normal — the SPRITE SUN RESPONSE (see the consts above).
 * @implements {RenderPass}
 */
globalThis.RenderBillboard = class RenderBillboard {
  constructor(opt) {
    opt = opt ?? {};
    this.enabled = true;
    this.tiltDeg = opt.tiltDeg ?? -90; // -90 = upright off the flat-on-ground default
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
    // sprite sun response: opt.lights = the host RenderMesh pass (like RenderWalls), which
    // supplies the sun provider + this frame's gathered point-light set (it draws first).
    // Unset → no modulation: sprites stay full-bright albedo (flat maps, kit default).
    this.lights = opt.lights;
    this._lmod = { r: 1, g: 1, b: 1 }; // reused per-entity light scratch
  }

  destroy() {}

  // evaluate this frame's light color at a sprite's foot (x, y): ambient + sun at the bent
  // normal + the point-light set RenderMesh gathered for the meshes this frame (view cull,
  // nearest-first budget, and flicker all shared, so a sprite and the mesh beside it can't
  // diverge). Fills + returns the reused scratch; null → draw unmodulated (no mesh pass
  // wired, or its shader unavailable — then meshes are flat albedo, sprites should match).
  _lightAt(x, y) {
    const mesh = this.lights;
    if (mesh === undefined || !mesh._litOk) return null;
    const sun = mesh.sun !== undefined ? mesh.sun() : RenderMesh.SUN_DEFAULT;
    const ambient = 1 - 0.9 * sun.strength; // the sun's complement — as _setupLights sends it
    const ndl = Math.max(0, BB_SUN_NY * sun.y + BB_SUN_NZ * sun.z);
    const sunK = sun.strength * ndl;
    const lm = this._lmod;
    lm.r = ambient + sun.r * sunK;
    lm.g = ambient + sun.g * sunK;
    lm.b = ambient + sun.b * sunK;
    const lp = mesh._lp;
    const lc = mesh._lc;
    const n = mesh._lightN;
    for (let i = 0; i < n; i++) {
      const dx = lp[i * 4] - x;
      const dy = lp[i * 4 + 1] - y;
      const dz = lp[i * 4 + 2] - BB_SAMPLE_Z;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz), 0.001);
      const atten = 1 - dist / lp[i * 4 + 3]; // linear falloff, like the shader/light map
      if (atten <= 0) continue;
      const pndl = Math.max(0, (BB_SUN_NY * dy + BB_SUN_NZ * dz) / dist);
      const k =
        lc[i * 4 + 3] * atten * (BB_POINT_FILL + (1 - BB_POINT_FILL) * pndl);
      lm.r += lc[i * 4] * k;
      lm.g += lc[i * 4 + 1] * k;
      lm.b += lc[i * 4 + 2] * k;
    }
    return lm;
  }

  // channel-multiply a packed color by the light modulation, clamped — a fresh one-shot
  // compute from the source color each frame, never an eased/fed-back packed int (the GMRT
  // merge_color drift trap only bites iterative easing).
  _tint(color, lm) {
    return make_colour_rgb(
      Math.min(255, Math.round(color_get_red(color) * lm.r)),
      Math.min(255, Math.round(color_get_green(color) * lm.g)),
      Math.min(255, Math.round(color_get_blue(color) * lm.b)),
    );
  }

  // one Appearance layer at the body's subimg/transform, depth-biased by `dy` along world Y
  // (+y = south = toward the camera; see the doll-stack comment in draw). Layers keep their
  // OWN color — the body's Visual.color is the SKIN tint of the white spr_human template, so
  // it must not bleed into outfit colors; whole-doll effects (downed dim) ride visual.alpha,
  // which layers share — with the entity's light modulation applied identically to each.
  _drawLayer(layer, visual, rp, tiltDeg, dy, lm) {
    matrix_set(
      matrix_world,
      matrix_build(rp.x, rp.y + dy, 0, tiltDeg, 0, 0, 1, 1, 1),
    );
    draw_sprite_ext(
      layer.sprite,
      visual.subimg,
      0,
      0,
      visual.xscale,
      visual.yscale,
      0,
      lm === null ? layer.color : this._tint(layer.color, lm),
      visual.alpha,
    );
  }

  draw(world) {
    const ident = matrix_build_identity();
    const tiltDeg = this.tiltDeg; // constant upright — no camera-pitch tracking
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
      if (visual.speed !== 0) {
        visual.time += visual.speed * Time.raw;
        visual.subimg = Math.floor(visual.time) % sprite_get_number(sprite);
        subimg = visual.subimg;
      }
      // sun response: one light evaluation per entity, shared by body + doll layers
      // (an object ref local, not a cached primitive bool — GMRT clobber trap)
      const lm = this._lightAt(rp.x, rp.y);
      // Paper-doll layers (Appearance) draw at the body's subimg/transform but CANNOT rely on
      // coplanar depth equality: sprites are auto-trimmed on the texture page, so each sheet's
      // quad has different vertices and the interpolated depth diverges by float rounding — a
      // later layer randomly loses the lessequal test (a raider bald under its bandana). Bias
      // each layer a hair along world Y instead (front toward the south-side camera = +y, back
      // away = -y — an upright quad is a constant-y plane, so only a Y offset separates depth;
      // a z offset slides within the plane), so stack order wins deterministically;
      // BB_LAYER_DY is far above fp error and far below a visible shift.
      const ap = world.get(Appearance, entity);
      if (ap !== undefined) {
        for (let i = 0; i < ap.back.length; i++)
          this._drawLayer(
            ap.back[i],
            visual,
            rp,
            tiltDeg,
            -(ap.back.length - i) * BB_LAYER_DY,
            lm,
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
        lm === null ? visual.color : this._tint(visual.color, lm),
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
            lm,
          );
      }
      matrix_set(matrix_world, ident);
    }
    matrix_set(matrix_world, ident);
    if (this._shaderOk) shader_reset();
    gpu_set_zwriteenable(false); // restore global default — only billboards write depth
  }
};
