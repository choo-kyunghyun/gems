/**
 * Volume pass: draws each `Mesh` + `Position` entity as depth-writing geometry, so pawns sort
 * against deep furniture per pixel with no manual layering. A `model` draws a baked mesh lit by
 * an injected sun and the nearest injected point lights; that lighting only tells faces apart by
 * direction, while absolute darkness belongs to the screen-space light map composed over it.
 * Without a model, an analytic box draws the only two faces the fixed-yaw pitched camera can
 * see, the plan-view top and the upright front, unlit and authored in canonical views. Faces
 * must stay opaque or alpha-test cutout: blended geometry that writes depth occludes what lies
 * behind its soft pixels.
 * @implements {RenderPass}
 */
globalThis.RenderMesh = class RenderMesh {
  static MAX_LIGHTS = 8; // must match shMeshlit.fsh MAX_LIGHTS
  static LIGHT_Z = -20; // point-light height off the ground plane (torch flame)
  // BUG: a literal, since a static initializer can't reference its own class (docs/GMRT.md)
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
    this.alphaRef = opt.alphaRef ?? 0.5; // texel cutout threshold (shape only, tint-safe)
    // model vertex layout; the texcoord carries the packed face normal, not UVs
    vertex_format_begin();
    vertex_format_add_position_3d();
    vertex_format_add_colour();
    vertex_format_add_texcoord();
    this._format = vertex_format_end();
    this._models = new Map(); // name -> { vb }
    this._vbs = []; // BUG: parallel cleanup list, Map iterators hang (docs/GMRT.md)
    // without the shader, models draw flat unlit albedo
    this._lit = shMeshlit;
    this.litOk = shaders_are_supported() && shader_is_compiled(this._lit);
    this._uAmbient = this.litOk
      ? shader_get_uniform(this._lit, "u_ambient")
      : -1;
    this._uSunDir = this.litOk ? shader_get_uniform(this._lit, "u_sunDir") : -1;
    this._uSunColor = this.litOk
      ? shader_get_uniform(this._lit, "u_sunColor")
      : -1;
    this._uChroma = this.litOk ? shader_get_uniform(this._lit, "u_chroma") : -1;
    // public: a flowing ground pass sets the wave uniforms after setupLights
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
    // public: textured mode reads real UVs and takes the normal per submit
    this.uUseTex = this.litOk ? shader_get_uniform(this._lit, "u_useTex") : -1;
    this.uNormal = this.litOk ? shader_get_uniform(this._lit, "u_normal") : -1;
    this._uAlphaRef = this.litOk
      ? shader_get_uniform(this._lit, "u_alphaRef")
      : -1;
    // () => { x, y, z (toward the sun, up = -z), strength, r, g, b }; unset = a fixed neutral
    // sun, so a bare consumer gets shaded meshes with no wiring
    this.sun = opt.sun;
    // () => 0..1 albedo saturation; unset = the authored colours
    this.chroma = opt.chroma;
    this.camera = opt.camera; // optional view record; when set, the lights nearest the view win
    // (entities) => [{ x, y, radius, color, intensity?, flicker?, seed? }]; color is a GM color
    // int, seed the flicker phase offset; unset = sun only
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
   * A `.mesh` bake wins over a `.vox`; a name missing both caches vb -1 so the warning fires
   * once, not per frame.
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
   * The shared light seam: a lit pass given this one gets `litOk`, this method and the public
   * uniform handles; everything else is private. It is the one light gather every lit pass
   * shares, so the level can't diverge. Binds the shader in model mode with no cutout, wave or
   * sway; the caller ends its own submits with shader_reset().
   */
  setupLights(entities) {
    shader_set(this._lit);
    shader_set_uniform_f(this.uUseTex, 0);
    shader_set_uniform_f(this._uAlphaRef, 0);
    const sun = this.sun !== undefined ? this.sun() : RenderMesh.SUN_DEFAULT;
    // ambient is the sun's complement, full at night, so meshes aren't darkened twice under
    // the light map
    shader_set_uniform_f(this._uAmbient, 1 - 0.9 * sun.strength);
    shader_set_uniform_f(this._uSunDir, sun.x, sun.y, sun.z, sun.strength);
    shader_set_uniform_f(this._uSunColor, sun.r, sun.g, sun.b);
    shader_set_uniform_f(
      this._uChroma,
      this.chroma !== undefined ? this.chroma() : 1,
    );
    shader_set_uniform_f(this.uWave, 0);
    shader_set_uniform_f(this._uSway, 0);

    const max = RenderMesh.MAX_LIGHTS;
    let recs = this.pointLights !== undefined ? this.pointLights(entities) : [];
    // cull first: a light whose radius misses the view must not spend a budget slot
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
    // nearest the view centre first when still over budget
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
      // wall-clock flicker matching the glow pools; the seed keeps torches out of sync
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
   * Local rect (0,0)-(w,h) under the current world matrix. A sprite face runs the shader with
   * neutral light only for the texel-alpha cutout, so soft pixels don't write depth; a color
   * fill stays outside it, since textured mode would read an untextured primitive as black.
   */
  _face(spr, color, alpha, w, h) {
    if (spr !== undefined && sprite_exists(spr)) {
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
    // depth writes are on for this pass only
    gpu_set_zwriteenable(true);
    if (this.litOk) this.setupLights(entities);
    entities.forEach([Mesh, Position], (entity, mesh, rp) => {
      if (mesh.model === undefined || mesh.model === "") return;
      const m = this._model(mesh.model);
      if (m.vb === -1) return;
      // scale and rotation are visual only, per world axis (zscale is height, a negative xscale
      // mirrors); rotation pivots on the footprint center and the lighting follows it
      const s = mesh.scale;
      matrix_set(
        matrix_world,
        matrix_build(
          rp.x,
          rp.y,
          0,
          mesh.pitch,
          mesh.roll,
          mesh.yaw,
          mesh.xscale ?? s,
          mesh.yscale ?? s,
          mesh.zscale ?? s,
        ),
      );
      vertex_submit(m.vb, pr_trianglelist, -1);
    });
    if (this.litOk) shader_reset();
    entities.forEach([Mesh, Position], (entity, mesh, rp) => {
      if (mesh.model !== undefined && mesh.model !== "") return;
      const alpha = mesh.alpha;
      // faces are placed center-relative, then the entity matrix, so rotation pivots on the
      // footprint center
      const entM = matrix_build(
        rp.x,
        rp.y,
        0,
        mesh.pitch,
        mesh.roll,
        mesh.yaw,
        1,
        1,
        1,
      );
      // top: flat at -height over the footprint (up = -z)
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
      // front: upright at the south edge, sharing the top quad's edge exactly so the seam
      // can't gap or z-fight
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
    gpu_set_zwriteenable(false); // ground passes stay painter-order
  }
};
