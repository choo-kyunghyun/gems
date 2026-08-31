// Sprite sun response: STANDING sprites draw under shMeshlit's textured mode with a fixed
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
 *   STANDING  upright sprites (here) — pawns, and the organic props (trees, crops, boulders,
 *             the beacon): anything whose silhouette reads and whose top face doesn't
 *   VOLUME    baked vox meshes (RenderMesh over the `Mesh` component) — deep furniture
 *   WALLS     tile-layer boxes (RenderWalls; RenderFence's post-and-rail boxes) — the built environment
 * All three write depth and light through shMeshlit; the ground stays painter-order.
 *
 * 2.5D STANDING pass: draws each foot-anchored sprite UPRIGHT (90° off the ground, Don't
 * Starve / Paper Mario) via a world matrix, under the pitch-by-zoom camera
 * (CameraFollow's `pitchCurve`). Upright — NOT perpendicular-to-view: a
 * camera-facing billboard under a mostly-top-down pitch reclines ~cos(pitch) of its height
 * along the ground, so at wall contact the body crosses the wall mesh's depth and buries
 * itself; an upright sprite's top is always camera-side of geometry it stands in front of.
 * PITCH COMPENSATION: the ortho pitch projects an upright quad to sin(pitch) of its height,
 * which resamples every sprite row at a non-integer step (1.32 screen px per source px at
 * zoom 2 — the "dirty" doll). The quad is drawn 1/sin(pitch) TALL instead, so the screen
 * height is exactly source × zoom and the texel grid stays whole; the foot stays put, and the
 * quad stands ~1.3× taller in world space (it occludes a little more of what's behind it).
 * `opt.camera` supplies the live pitch (ColonyMap._buildCamera assigns it).
 * Only geometry that writes depth — z-write on for this loop only so overlapping bodies
 * sort per-pixel; ground passes stay painter-order (z-write off) to avoid z-fighting.
 * A Spine puppet is the one body that can z-fight ITSELF — its attachments are coplanar —
 * so it draws twice: colour without depth, then depth without colour (see the loop).
 * requires hard-alpha sprites: soft edges write depth on transparent pixels and occlude
 * what's behind them.
 * Sprites draw under shMeshlit (textured + texel cutout, bent normal via u_normal) — ONE
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
    // THE world shader (shMeshlit) in textured + cutout mode: the texel-alpha discard keeps
    // transparent pixels from writing depth (GMRT's fixed-function alpha test is inert —
    // this replaced the retired sh_alphatest), and the mesh lighting model shades each
    // sprite per-pixel at the bent normal. Guarded: without it sprites draw plain
    // fixed-function (unlit, no cutout — the same degradation as RenderMesh).
    this._lit = asset_get_index("shMeshlit");
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
    this.alphaRef = opt.alphaRef ?? 0.5; // texel cutout threshold (shape only, dim-safe)
    // opt.lights = the host RenderMesh pass: its setupLights supplies this frame's sun +
    // view-culled point lights (ONE shared gather — a sprite and the mesh beside it can't
    // diverge). Unset (flat maps, the default) → neutral uniforms: full-bright albedo with
    // the cutout only.
    this.lights = opt.lights;
    this.camera = opt.camera; // a Camera instance: its pitch drives the height compensation
  }

  destroy() {}

  draw(entities) {
    const ident = matrix_build_identity();
    const tiltDeg = this.tiltDeg; // constant upright — no camera-pitch tracking
    const pitch = this.camera !== undefined ? this.camera.pitch : 0;
    // the pitch compensation (header) — on the world z (matrix_build scales on the WORLD
    // axes, and the tilt has already stood the sprite's height along z)
    const tall = pitch > 0 ? 1 / Math.sin(pitch) : 1;
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
        shader_set_uniform_f(this._uChroma, 1);
        shader_set_uniform_f(this._uWave, 0);
        shader_set_uniform_f(this._uLightCount, 0);
      }
      shader_set_uniform_f(this._uUseTex, 1); // sprites: real UVs, tint via the draw colour
      shader_set_uniform_f(this._uNormal, 0, BB_NORMAL_Y, BB_NORMAL_Z);
      shader_set_uniform_f(this._uAlphaRef, this.alphaRef);
    }
    entities.forEach([Visual, Position], (entity, visual) => {
      const rp = InterpolationSystem.lerp(entities, entity, this._rp);
      // an invalid sprite — or an SVG one, which exists but reports 0 frames on GMRT — draws as
      // the pixMissing placeholder; re-wrap subimg into the placeholder's frame range.
      let sprite = visual.sprite;
      let subimg = visual.subimg;
      if (!sprite_exists(sprite) || sprite_get_number(sprite) < 1) {
        sprite = pixMissing;
        subimg = subimg % sprite_get_number(sprite);
      }
      if (visual.speed !== 0) subimg = AnimationSystem.advance(visual, sprite);
      matrix_set(
        matrix_world,
        matrix_build(rp.x, rp.y, 0, tiltDeg, 0, 0, 1, 1, tall),
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
      matrix_set(matrix_world, ident);
    });
    // SKELETAL category: a Spine body poses in its own instance's scope, so it draws through
    // the stored handle — `draw_self` is the only path that BOTH poses and honours matrix_world
    // (GMRT.md), and it beats draw_skeleton ~4x (PERF.md). A separate scan rather than a branch
    // inside the loop above: the pair is rare, so the scan is nearly free, and a skeletal entity
    // carries no Visual — one that did would draw its body twice.
    // Two passes per puppet: its attachments share one plane, and two overlapping quads on a
    // plane interpolate depths a bit apart, so one depth-writing draw makes each dress piece
    // win or lose the test against the body part under it WHOLE — a hat swallowed by the
    // head, flipping as the doll moves. Colour first with z-write off (tested against the
    // scene, never against itself), then depth only, so what draws later still sorts against
    // the silhouette. Depth first would keep the lower of the two coplanar depths, and the
    // colour pass would lose the same lottery against it.
    entities.forEach([Skeleton, Instance, Position], (entity, sk, held) => {
      const rp = InterpolationSystem.lerp(entities, entity, this._rp);
      matrix_set(
        matrix_world,
        matrix_build(rp.x, rp.y, 0, tiltDeg, 0, 0, 1, 1, tall),
      );
      gpu_set_zwriteenable(false);
      held.inst.draw_self();
      gpu_set_zwriteenable(true);
      gpu_set_colourwriteenable(false, false, false, false);
      held.inst.draw_self();
      gpu_set_colourwriteenable(true, true, true, true);
    });
    matrix_set(matrix_world, ident);
    if (this._litOk) shader_reset();
    gpu_set_zwriteenable(false); // restore global default — only billboards write depth
  }
};
