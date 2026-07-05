/**
 * VOLUME pass of the art projection contract (ROADMAP.md — Art Rework): draws each
 * `Volume` + `Position` entity as real depth-writing geometry (z-write on for this loop
 * only, like RenderBillboard), so pawns sort against deep furniture per-pixel with zero
 * manual layering. Two paths per entity:
 * - `model` set → a baked MagicaVoxel mesh (tools/vox-kit vox2vbuf.py → volumes/<name>.vbuf,
 *   loaded via buffer_load + vertex_create_buffer_from_buffer, frozen + cached, vertex-color
 *   shaded — no texture). The converter emits only the faces this camera can see (top+south).
 * - else → an analytic axis-aligned box: under the fixed-yaw pitched ortho camera only TWO
 *   faces are ever visible — the plan-view TOP (lying at -height over the footprint) and the
 *   elevation FRONT (a true vertical quad at the footprint's south edge) — so two quads.
 *   Face textures are authored in canonical views (top = plan, front = elevation); the
 *   pitched camera foreshortens them like the terrain. Faces must stay OPAQUE or alpha-test
 *   cutout: alpha-blended geometry that writes depth occludes what's behind its soft pixels
 *   (the billboard hard-alpha rule).
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
    // baked-mesh models (tools/vox-kit): position_3d + colour + texcoord, 24 bytes/vertex —
    // this declaration and the converter's byte layout are a lockstep pair
    vertex_format_begin();
    vertex_format_add_position_3d();
    vertex_format_add_colour();
    vertex_format_add_texcoord();
    this._format = vertex_format_end();
    this._models = new Map(); // name -> { vb } (string keys only — ref-keyed Maps crash GMRT)
    this._vbs = []; // parallel cleanup list (no for...of over Map iterators on GMRT)
  }

  destroy() {
    for (let i = 0; i < this._vbs.length; i++)
      vertex_delete_buffer(this._vbs[i]);
    this._vbs.length = 0;
    this._models.clear();
    vertex_format_delete(this._format);
  }

  // baked model lookup: volumes/<name>.vbuf (included file) -> frozen vertex buffer, cached;
  // a missing file caches vb -1 so the warning fires once, not per frame
  _model(name) {
    let m = this._models.get(name);
    if (m !== undefined) return m;
    m = { vb: -1 };
    const buf = buffer_load(`volumes/${name}.vbuf`);
    if (buffer_exists(buf)) {
      m.vb = vertex_create_buffer_from_buffer(buf, this._format);
      buffer_delete(buf);
      vertex_freeze(m.vb);
      this._vbs.push(m.vb);
    } else {
      Log.warn(`RenderVolume: missing model volumes/${name}.vbuf`);
    }
    this._models.set(name, m);
    return m;
  }

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
      // baked-mesh path: a vox-kit model replaces the two analytic quads entirely
      if (vol.model !== undefined && vol.model !== "") {
        const m = this._model(vol.model);
        if (m.vb !== -1) {
          matrix_set(
            matrix_world,
            matrix_build(rp.x, rp.y, 0, 0, 0, 0, 1, 1, 1),
          );
          vertex_submit(m.vb, pr_trianglelist, -1);
        }
        continue;
      }
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
