// Named entity templates with variant inheritance and a spawn-time size/art bake — the
// declarative side of entity construction (behavioral wiring stays code, via `post`).
/**
 * @typedef {Object} EntityPresetDef
 * @property {string} id
 * @property {string} [extends]  base preset id, resolved at REGISTER time (base registers first;
 *   unknown base throws). Per-component FIELD merge — this def's fields win, new components add.
 * @property {number} [scale]    DESIGN size factor (default 1; inherited from the base) — the
 *   preset's BASIC factor, scaling BBox + Visual + Mesh. A per-spawn `opts.size` scalar
 *   multiplies on top (the dedicated Alpha/boss knob — see spawn()).
 * @property {Object<string,Object>} [components]  component token -> data, authored at design
 *   scale 1 in world units; DEEP-copied per spawn so instances never share nested data.
 *   Visual.xscale/yscale are DERIVED (design scale / SpriteMeta density), never authored.
 * @property {function} [post]   post(entities, id, ctx) spawn hook for what data can't express
 *   (AI attach, computed colors…); ctx = { x, y, z, scale, opts }. Inherited unless overridden.
 */
globalThis.EntityPreset = {
  _defs: new Map(), // id → FLATTENED def (string keys — never key a Map by a ref)
  _order: [],

  /** Register defs in order; `extends` flattens against the already-registered base, so a
   *  chain works top-down. Re-registering an id replaces it. */
  register(presets) {
    Registry.register(this, presets, EntityPreset._flatten);
  },

  /** Registry `make` hook: resolve `extends` against what is already stored (defs land in list
   *  order, so a base registered earlier in the same call is visible here). */
  _flatten(def) {
    if (def.extends === undefined) return def;
    const base = EntityPreset.get(def.extends);
    if (base === undefined)
      throw new Error(`Unknown base preset: ${def.extends}`);
    return {
      id: def.id,
      scale: def.scale ?? base.scale,
      post: def.post ?? base.post,
      components: EntityPreset._merge(base.components, def.components),
    };
  },

  /**
   * Spawn a preset at (x, y, z). Throws for unknown ids.
   * `opts`: { size?, components? } — `size` is the per-spawn SCALAR for special entities
   * (bosses/alpha mobs), multiplying the def's basic `scale` factor; it bakes BBox + Visual +
   * Mesh uniformly, so a sized entity's look never diverges from its collider. `components`
   * are per-spawn field overrides merged like `extends` (e.g. { Health: { hp: 12 } }).
   * Returns the entity id.
   */
  spawn(entities, presetId, x, y, z = 0, opts = {}) {
    const preset = EntityPreset.get(presetId);
    if (preset === undefined)
      throw new Error(`Unknown entity preset: ${presetId}`);

    const k = (preset.scale ?? 1) * (opts.size ?? 1);
    const id = entities.create();
    entities.add(id, Position, { x, y, z });

    const components =
      opts.components !== undefined
        ? EntityPreset._merge(preset.components, opts.components)
        : (preset.components ?? {});

    const keys = Object.keys(components);
    for (let i = 0; i < keys.length; i++) {
      const token = keys[i];
      const data = EntityPreset._clone(components[token]);
      if (token === Visual) EntityPreset._bakeVisual(data, k);
      else if (token === Skeleton) EntityPreset._bakeSkeleton(data, k);
      else if (token === BBox) EntityPreset._bakeBox(data, k);
      else if (token === Mesh) EntityPreset._bakeMesh(data, k);
      entities.add(id, token, data);
    }

    if (preset.post !== undefined)
      preset.post(entities, id, { x, y, z, scale: k, opts });
    return id;
  },

  has(presetId) {
    return Registry.has(this, presetId);
  },

  get(presetId) {
    return Registry.get(this, presetId);
  },

  /**
   * Field-level component merge: `over`'s components merge INTO `base`'s per field (over wins),
   * unseen components add. Returns fresh per-component objects; nested values may still be
   * shared with the defs — fine, spawn deep-clones per instance.
   */
  _merge(base, over) {
    const out = {};
    for (const token in base ?? {}) out[token] = base[token];
    for (const token in over ?? {}) {
      out[token] =
        out[token] !== undefined
          ? { ...out[token], ...over[token] }
          : over[token];
    }
    return out;
  },

  /**
   * GMRT-safe deep copy. Recurses arrays and PLAIN data objects only: a GM asset ref (sprite
   * handle) also reports typeof "object", but its constructor !== Object (Object.keys(ref) is 0
   * without throwing, so recursing would silently turn it into {}) —
   * refs, scalars, and functions pass through BY REFERENCE.
   */
  _clone(v) {
    if (Array.isArray(v)) {
      const out = [];
      for (let i = 0; i < v.length; i++) out.push(EntityPreset._clone(v[i]));
      return out;
    }
    if (v !== null && typeof v === "object" && v.constructor === Object) {
      const out = {};
      for (const key in v) out[key] = EntityPreset._clone(v[key]);
      return out;
    }
    return v;
  },

  /**
   * Normalize an authored Visual (sprite/color + optional overrides) into the full runtime
   * shape and bake the size split: `scale` = design size (also on the BBox), xscale/yscale =
   * scale / density (see SpriteMeta — art resolution never touches the BBox).
   */
  _bakeVisual(vis, k) {
    vis.visible = vis.visible ?? true;
    vis.subimg = vis.subimg ?? 0;
    vis.rot = vis.rot ?? 0;
    vis.color = vis.color ?? c_white;
    vis.alpha = vis.alpha ?? 1;
    vis.speed = vis.speed ?? 0;
    vis.time = vis.time ?? 0;
    vis.scale = k;
    const f = SpriteMeta.fit(k, vis.sprite);
    vis.xscale = f;
    vis.yscale = f;
  },

  /**
   * Normalize an authored Skeleton (sprite + optional overrides) and bake the same size split a
   * Visual gets. No strip fields — SkeletonSystem owns `frame`, and 30 fps is the rate Spine
   * authors at.
   */
  _bakeSkeleton(sk, k) {
    sk.anim = sk.anim ?? "idle";
    sk.loop = sk.loop ?? true;
    sk.fps = sk.fps ?? 30;
    sk.frame = sk.frame ?? 0;
    sk.color = sk.color ?? c_white;
    sk.alpha = sk.alpha ?? 1;
    const f = SpriteMeta.fit(k, sk.sprite);
    sk.xscale = f;
    sk.yscale = f;
  },

  /**
   * Design scale on the collision footprint (authored world units at scale 1).
   */
  _bakeBox(box, k) {
    box.x *= k;
    box.y *= k;
    box.width *= k;
    box.height *= k;
  },

  /**
   * Size a mesh look with the same factor as its BBox, so a sized (boss/alpha) mesh entity's
   * model never diverges from its collider. The authored Mesh fields stay the preset's
   * basic per-axis factor; k folds in exactly once per render axis (a per-axis override wins
   * over `scale` in RenderMesh, so both get it) plus the analytic-box world-px dimensions.
   */
  _bakeMesh(mesh, k) {
    if (k === 1) return;
    mesh.scale = (mesh.scale ?? 1) * k;
    if (mesh.xscale !== undefined) mesh.xscale *= k;
    if (mesh.yscale !== undefined) mesh.yscale *= k;
    if (mesh.zscale !== undefined) mesh.zscale *= k;
    if (mesh.width !== undefined) mesh.width *= k;
    if (mesh.depth !== undefined) mesh.depth *= k;
    if (mesh.height !== undefined) mesh.height *= k;
  },
};
