/**
 * VOLUME pass of the art projection contract (RenderBillboard): draws each
 * `Mesh` + `Position` entity as real depth-writing geometry (z-write on for this loop
 * only, like RenderBillboard), so pawns sort against deep furniture per-pixel with zero
 * manual layering. Two paths per entity:
 * - `model` set → a MagicaVoxel mesh (meshes/<name>.vox, parsed + greedy-meshed by Vox on
 *   first use, frozen + cached — no texture). Vox emits the exposed faces as UNSHADED albedo
 *   with the face normal PACKED in the texcoord — shMeshlit lights them live: one
 *   directional sun (`opt.sun` provider, injected like RenderLighting's ambient — the demo
 *   wires WorldClock.sunDir; the default is a fixed neutral sun reproducing the old baked
 *   top/south look) + the nearest injected point lights (`opt.pointLights` provider — the
 *   demo gathers the `Light` entities; torch/lantern — faces toward a torch
 *   brighten, tops of tall meshes stay dark to a ground-level flame). This
 *   composes UNDER RenderLighting's screen-space multiply: the shader differentiates faces
 *   by direction, the light map owns absolute night darkness + the visible glow pools.
 *   No-shader fallback submits flat albedo.
 * - else → an analytic axis-aligned box: under the fixed-yaw pitched ortho camera only TWO
 *   faces are ever visible — the plan-view TOP (lying at -height over the footprint) and the
 *   elevation FRONT (a true vertical quad at the footprint's south edge) — so two quads.
 *   Face textures are authored in canonical views (top = plan, front = elevation); the
 *   pitched camera foreshortens them like the terrain. Faces must stay OPAQUE or alpha-test
 *   cutout: alpha-blended geometry that writes depth occludes what's behind its soft pixels
 *   (the billboard hard-alpha rule).
 * @implements {RenderPass}
 */
globalThis.RenderMesh = class RenderMesh {
  static MAX_LIGHTS = 8; // must match shMeshlit.fsh MAX_LIGHTS
  static LIGHT_Z = -20; // point lights lifted off the ground plane (torch flame height)
  // literal (a static initializer can't reference its own class name — GMRT)
  static SUN_DEFAULT = {
    x: 0,
    y: 0.33,
    z: -0.94,
    strength: 0.5,
    r: 1,
    g: 1,
    b: 1,
  };

  constructor(opt) {
    opt = opt ?? {};
    this.enabled = true;
    this._rp = { x: 0, y: 0 }; // reused lerp scratch
    this.alphaRef = opt.alphaRef ?? 0.5; // texel cutout threshold (shape only, tint-safe)
    // vox models: position_3d + colour + texcoord, 24 bytes/vertex — this declaration and
    // Vox's emitted layout are a lockstep pair (the texcoord carries the PACKED FACE
    // NORMAL, not UVs — see Vox / shMeshlit.vsh)
    vertex_format_begin();
    vertex_format_add_position_3d();
    vertex_format_add_colour();
    vertex_format_add_texcoord();
    this._format = vertex_format_end();
    this._models = new Map(); // name -> { vb } (string keys only — ref-keyed Maps crash GMRT)
    this._vbs = []; // parallel cleanup list (no for...of over Map iterators on GMRT)
    // THE world shader (guarded — without it models draw flat unlit albedo)
    this._lit = asset_get_index("shMeshlit");
    this.litOk = shaders_are_supported() && shader_is_compiled(this._lit);
    this._uAmbient = this.litOk
      ? shader_get_uniform(this._lit, "u_ambient")
      : -1;
    this._uSunDir = this.litOk ? shader_get_uniform(this._lit, "u_sunDir") : -1;
    this._uSunColor = this.litOk
      ? shader_get_uniform(this._lit, "u_sunColor")
      : -1;
    this._uChroma = this.litOk ? shader_get_uniform(this._lit, "u_chroma") : -1;
    // wave mode — public like uUseTex/uNormal: a ground pass whose material flows sets them
    // after setupLights (which pins u_wave 0)
    this.uWave = this.litOk ? shader_get_uniform(this._lit, "u_wave") : -1;
    this.uWaveColor = this.litOk
      ? shader_get_uniform(this._lit, "u_waveColor")
      : -1;
    this.uTime = this.litOk ? shader_get_uniform(this._lit, "u_time") : -1;
    this._uSway = this.litOk ? shader_get_uniform(this._lit, "u_sway") : -1;
    this._uLightCount = this.litOk
      ? shader_get_uniform(this._lit, "u_lightCount")
      : -1;
    this._uLightPos = this.litOk
      ? shader_get_uniform(this._lit, "u_lightPos")
      : -1;
    this._uLightCol = this.litOk
      ? shader_get_uniform(this._lit, "u_lightCol")
      : -1;
    // textured mode (RenderWalls/RenderBillboard/ground passes): texcoord = real UVs, normal
    // via u_normal per submit. setupLights resets u_useTex to 0 so the vox models always
    // draw in packed-normal mode, and u_alphaRef to 0 (no cutout) so they never discard.
    this.uUseTex = this.litOk ? shader_get_uniform(this._lit, "u_useTex") : -1;
    this.uNormal = this.litOk ? shader_get_uniform(this._lit, "u_normal") : -1;
    this._uAlphaRef = this.litOk
      ? shader_get_uniform(this._lit, "u_alphaRef")
      : -1;
    // (no ambient field: ambient is derived per frame as the sun's complement — see setupLights)
    // sun provider: () => flat { x, y, z (toward the sun, up = -z), strength, r, g, b }.
    // Default = fixed neutral sun ≈ the old baked look (top ~1.0, south ~0.72), so a bare
    // consumer gets shaded meshes with zero wiring; the demo injects WorldClock.sunDir.
    this.sun = opt.sun;
    // albedo chroma provider, injected like `sun`: () => 0..1 (shMeshlit's u_chroma — the
    // world's saturation as an atmosphere dial; the demo injects ColonyMap.chroma). Unset = 1,
    // the authored colours.
    this.chroma = opt.chroma;
    this.camera = opt.camera; // optional; when set, the nearest lights to the view center win
    // point-light provider, injected like `sun` (this pass takes records, never the query): (entities) => [{ x, y, radius, color, intensity?,
    // flicker?, seed? }] — color a GM color int, seed the flicker phase offset (the demo passes
    // the entity id so the mesh term stays in phase with RenderLighting's glow pools).
    // Unset = sun-only.
    this.pointLights = opt.pointLights;
    this._lp = new Array(RenderMesh.MAX_LIGHTS * 4).fill(0); // reused uniform scratch
    this._lc = new Array(RenderMesh.MAX_LIGHTS * 4).fill(0);
  }

  destroy() {
    for (let i = 0; i < this._vbs.length; i++)
      vertex_delete_buffer(this._vbs[i]);
    this._vbs.length = 0;
    this._models.clear();
    vertex_format_delete(this._format);
  }

  /**
   * model lookup: meshes/<name>.mesh (poly-kit bake, Poly) first, else meshes/<name>.vox
   * (Vox-meshed) -> frozen vertex buffer, cached; a name missing BOTH caches vb -1 so the
   * warning fires once, not per frame
   */
  _model(name) {
    let m = this._models.get(name);
    if (m !== undefined) return m;
    m = { vb: Poly.mesh(name, this._format) };
    if (m.vb === -1) m.vb = Vox.mesh(name, this._format);
    if (m.vb !== -1) {
      vertex_freeze(m.vb);
      this._vbs.push(m.vb);
    } else {
      Log.warn(`RenderMesh: missing model meshes/${name}.mesh|.vox`);
    }
    this._models.set(name, m);
    return m;
  }

  /**
   * THE SHARED-LIGHT SEAM — the public surface a sibling pass gets by taking this pass as
   * `opt.lights` (RenderBillboard / RenderWalls / RenderTileMap): `litOk`
   * (is the shader usable at all), this method, and the `uUseTex` / `uNormal` uniform handles
   * each caller overrides for its own submits. Everything else here is private.
   *
   * Sets shMeshlit + this frame's lighting uniforms: the injected sun, then the nearest
   * MAX_LIGHTS injected point-light records (same flicker formula as RenderLighting so the
   * mesh response tracks the visible glow pools). Arrays are reused scratch. This is the ONE
   * light gather every lit pass shares, so the whole level can't diverge; it leaves u_useTex
   * at 0 (vox mode) and u_alphaRef at 0 (no cutout). A caller ends its own submits with
   * shader_reset().
   */
  setupLights(entities) {
    shader_set(this._lit);
    shader_set_uniform_f(this.uUseTex, 0); // vox mode; textured callers flip it
    shader_set_uniform_f(this._uAlphaRef, 0); // no cutout; billboards/sprite faces raise it
    const sun = this.sun !== undefined ? this.sun() : RenderMesh.SUN_DEFAULT;
    // ambient = the sun's complement: 0.55 in full daylight (sun fills the rest), 1.0 at
    // night so unlit meshes match the map-lit world around them (see shMeshlit.fsh) —
    // a constant ambient double-darkened meshes at night vs sprites/ground
    shader_set_uniform_f(this._uAmbient, 1 - 0.9 * sun.strength);
    shader_set_uniform_f(this._uSunDir, sun.x, sun.y, sun.z, sun.strength);
    shader_set_uniform_f(this._uSunColor, sun.r, sun.g, sun.b);
    shader_set_uniform_f(
      this._uChroma,
      this.chroma !== undefined ? this.chroma() : 1,
    );
    shader_set_uniform_f(this.uWave, 0); // no crests; a flowing ground pass raises it
    shader_set_uniform_f(this._uSway, 0); // rigid; the grass pass raises it (shMeshlit.vsh)

    const max = RenderMesh.MAX_LIGHTS;
    let recs = this.pointLights !== undefined ? this.pointLights(entities) : [];
    // CPU cull first: only a light whose RADIUS reaches the view can affect a visible mesh
    // pixel, so off-screen lights must not eat a MAX_LIGHTS slot (a build zone can hold far
    // more torches than the budget; the overflow's glow pool still draws — RenderLighting has
    // no cap — only the per-face mesh term is budgeted). The view rect is Camera.groundRect,
    // which owns the pitch stretch.
    if (this.camera !== undefined) {
      const view = this.camera.groundRect();
      const vis = [];
      for (let i = 0; i < recs.length; i++) {
        const rec = recs[i];
        if (
          rec.x + rec.radius >= view.x1 &&
          rec.x - rec.radius <= view.x2 &&
          rec.y + rec.radius >= view.y1 &&
          rec.y - rec.radius <= view.y2
        )
          vis.push(rec);
      }
      recs = vis;
    }
    // nearest-first when still over budget (view center from the assigned camera)
    if (recs.length > max && this.camera !== undefined) {
      const cx = this.camera.toX;
      const cy = this.camera.toY;
      const scored = [];
      for (let i = 0; i < recs.length; i++) {
        const dx = recs[i].x - cx;
        const dy = recs[i].y - cy;
        scored.push({ rec: recs[i], d: dx * dx + dy * dy });
      }
      // BUG: [#15593] sign comparator, never a raw difference.
      scored.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
      recs = [];
      for (let i = 0; i < scored.length; i++) recs.push(scored[i].rec);
    }
    const n = Math.min(recs.length, max);
    for (let i = 0; i < n; i++) {
      const rec = recs[i];
      let intensity = rec.intensity ?? 1;
      // flicker: same wall-clock sine as RenderLighting, seed-offset so torches don't sync
      if (rec.flicker)
        intensity *=
          1 -
          rec.flicker *
            (0.5 + 0.5 * Math.sin(current_time / 90 + (rec.seed ?? i)));
      this._lp[i * 4] = rec.x;
      this._lp[i * 4 + 1] = rec.y;
      this._lp[i * 4 + 2] = RenderMesh.LIGHT_Z;
      this._lp[i * 4 + 3] = rec.radius;
      this._lc[i * 4] = color_get_red(rec.color) / 255;
      this._lc[i * 4 + 1] = color_get_green(rec.color) / 255;
      this._lc[i * 4 + 2] = color_get_blue(rec.color) / 255;
      this._lc[i * 4 + 3] = intensity;
    }
    shader_set_uniform_f(this._uLightCount, n);
    if (n > 0) {
      shader_set_uniform_f_array(this._uLightPos, this._lp);
      shader_set_uniform_f_array(this._uLightCol, this._lc);
    }
  }

  /**
   * one face under the current world matrix — local rect (0,0)-(w,h): the sprite stretched
   * over it when the NAME resolves (asset_get_index returns an opaque ref — validate with
   * sprite_exists, never >= 0), else a flat color fill. A sprite face runs under shMeshlit
   * in textured mode with NEUTRAL light uniforms (ambient 1, sun/points 0 — the analytic box
   * stays unlit by contract) purely for the texel-alpha CUTOUT, so soft pixels don't write
   * depth; the color fill draws OUTSIDE the shader (textured mode reads gm_BaseTexture as
   * black on an untextured primitive and would blacken it).
   */
  _face(name, color, alpha, w, h) {
    const spr = name ? asset_get_index(name) : -1;
    if (name && sprite_exists(spr)) {
      if (this.litOk) {
        shader_set(this._lit);
        shader_set_uniform_f(this._uAmbient, 1);
        shader_set_uniform_f(this._uSunDir, 0, 0, -1, 0);
        shader_set_uniform_f(this._uSunColor, 1, 1, 1);
        shader_set_uniform_f(this._uChroma, 1);
        shader_set_uniform_f(this.uWave, 0);
        shader_set_uniform_f(this._uLightCount, 0);
        shader_set_uniform_f(this.uUseTex, 1);
        shader_set_uniform_f(this.uNormal, 0, 0, -1);
        shader_set_uniform_f(this._uAlphaRef, this.alphaRef);
      }
      draw_sprite_stretched_ext(spr, 0, 0, 0, w, h, color, alpha);
      if (this.litOk) shader_reset();
    } else {
      draw_rectangle_color(0, 0, w, h, color, color, color, color, false);
    }
  }

  draw(entities) {
    const ident = matrix_build_identity();
    // depth-writing like RenderBillboard (global default is off — Game Create_0)
    gpu_set_zwriteenable(true);
    // PASS 1 — baked models, lit by shMeshlit (albedo × sun + point lights over the packed
    // normals). The analytic quads draw OUTSIDE the shader: their texcoords are real UVs.
    if (this.litOk) this.setupLights(entities);
    entities.forEach([Mesh, Position], (entity, mesh) => {
      if (mesh.model === undefined || mesh.model === "") return;
      const m = this._model(mesh.model);
      if (m.vb === -1) return;
      const rp = InterpolationSystem.lerp(entities, entity, this._rp);
      // scale + rotation are visual-only (BBox stays authored); scale is per-axis in WORLD
      // axes — zscale is height; a negative xscale mirrors the model. `yaw` turns about the
      // footprint center (vox meshes carry all four side faces, so any facing is solid); the shader
      // re-derives flipped/rotated normals from the world matrix, so lighting follows.
      const s = mesh.scale ?? 1;
      matrix_set(
        matrix_world,
        matrix_build(
          rp.x,
          rp.y,
          0,
          mesh.pitch ?? 0,
          mesh.roll ?? 0,
          mesh.yaw ?? 0,
          mesh.xscale ?? s,
          mesh.yscale ?? s,
          mesh.zscale ?? s,
        ),
      );
      vertex_submit(m.vb, pr_trianglelist, -1);
    });
    if (this.litOk) shader_reset();
    // PASS 2 — analytic axis-aligned boxes (sprite/color faces, unlit)
    entities.forEach([Mesh, Position], (entity, mesh) => {
      if (mesh.model !== undefined && mesh.model !== "") return;
      const rp = InterpolationSystem.lerp(entities, entity, this._rp);
      const alpha = mesh.alpha ?? 1;
      // Face matrices are CENTER-relative and composed with an entity world matrix, so the
      // optional rotation pivots on the footprint center (matrix_multiply applies the left
      // matrix first — face placement, then entity rotate+translate). With no rotation this
      // reduces exactly to the old corner-anchored translate.
      const entM = matrix_build(
        rp.x,
        rp.y,
        0,
        mesh.pitch ?? 0,
        mesh.roll ?? 0,
        mesh.yaw ?? 0,
        1,
        1,
        1,
      );
      // TOP: plan-view quad lying flat at -height over the footprint (up = -z)
      matrix_set(
        matrix_world,
        matrix_multiply(
          matrix_build(
            -mesh.width / 2,
            -mesh.depth / 2,
            -mesh.height,
            0,
            0,
            0,
            1,
            1,
            1,
          ),
          entM,
        ),
      );
      this._face(mesh.topSprite, mesh.topColor, alpha, mesh.width, mesh.depth);
      // FRONT: true vertical quad at the (local) south edge — xrot -90 maps local +y to world
      // +z (the billboard tilt extended to fully upright), so anchoring the local origin at
      // -height spans the face from its top edge down to the ground; it shares that top
      // edge with the TOP quad exactly, so the seam can't gap or z-fight
      matrix_set(
        matrix_world,
        matrix_multiply(
          matrix_build(
            -mesh.width / 2,
            mesh.depth / 2,
            -mesh.height,
            -90,
            0,
            0,
            1,
            1,
            1,
          ),
          entM,
        ),
      );
      this._face(
        mesh.frontSprite,
        mesh.frontColor,
        alpha,
        mesh.width,
        mesh.height,
      );
    });
    matrix_set(matrix_world, ident);
    gpu_set_zwriteenable(false); // restore global default — ground passes stay painter-order
  }
};
