// Named entity templates with variant inheritance and a spawn-time size/art bake — the
// declarative side of entity construction (behavioral wiring stays code, via `post`).
/**
 * @typedef {Object} EntityPresetDef
 * @property {string} id
 * @property {string} [extends]  base preset id, resolved at REGISTER time (base registers first;
 *   unknown base throws). Per-component FIELD merge — this def's fields win, new components add.
 * @property {number} [scale]    DESIGN size factor (default 1; inherited from the base) — scales
 *   the BBox and the Visual. A per-spawn `opts.scale` multiplies on top (the Alpha/boss knob).
 * @property {Object<string,Object>} [components]  component token -> data, authored at design
 *   scale 1 in world units; DEEP-copied per spawn so instances never share nested data.
 *   Visual.xscale/yscale are DERIVED (design scale / ArtDensity), never authored.
 * @property {function} [post]   post(world, id, ctx) spawn hook for what data can't express
 *   (AI attach, computed colors…); ctx = { x, y, z, scale, opts }. Inherited unless overridden.
 */
globalThis.EntityPreset = class EntityPreset {
  /** @type {Map<string, EntityPresetDef>} */
  static presets = new Map(); // id → FLATTENED def (string keys — never key a Map by a ref)

  /** Register defs in order; `extends` flattens against the already-registered base, so a
   *  chain works top-down. Re-registering an id replaces it. @param {EntityPresetDef[]} presets */
  static register(presets) {
    for (const def of presets) {
      let flat = def;
      if (def.extends !== undefined) {
        const base = this.presets.get(def.extends);
        if (base === undefined)
          throw new Error(`Unknown base preset: ${def.extends}`);
        flat = {
          id: def.id,
          scale: def.scale ?? base.scale,
          post: def.post ?? base.post,
          components: EntityPreset._merge(base.components, def.components),
        };
      }
      this.presets.set(flat.id, flat);
    }
  }

  /**
   * Spawn a preset at (x, y, z). Throws for unknown ids.
   * `opts`: { scale?, components? } — scale multiplies the preset's design scale; components
   * are per-spawn field overrides merged like `extends` (e.g. { Health: { hp: 12 } }).
   * @param {string} presetId @param {ECS} world @param {number} x @param {number} y
   * @param {number} [z=0] @param {Object} [opts] @returns {number} entity id
   */
  static spawn(presetId, world, x, y, z = 0, opts = {}) {
    const preset = this.presets.get(presetId);
    if (preset === undefined)
      throw new Error(`Unknown entity preset: ${presetId}`);

    const k = (preset.scale ?? 1) * (opts.scale ?? 1);
    const id = world.create();
    world.add(id, Position, { x, y, z });

    const components =
      opts.components !== undefined
        ? EntityPreset._merge(preset.components, opts.components)
        : (preset.components ?? {});

    const keys = Object.keys(components);
    for (let i = 0; i < keys.length; i++) {
      const token = keys[i];
      const data = EntityPreset._clone(components[token]);
      if (token === Visual) EntityPreset._bakeVisual(data, k);
      else if (token === BBox) EntityPreset._bakeBox(data, k);
      world.add(id, token, data);
    }

    if (preset.post !== undefined)
      preset.post(world, id, { x, y, z, scale: k, opts });
    return id;
  }

  /** @param {string} presetId @returns {boolean} */
  static has(presetId) {
    return this.presets.has(presetId);
  }

  /** @param {string} presetId @returns {EntityPresetDef|undefined} */
  static get(presetId) {
    return this.presets.get(presetId);
  }

  // Field-level component merge: `over`'s components merge INTO `base`'s per field (over wins),
  // unseen components add. Returns fresh per-component objects; nested values may still be
  // shared with the defs — fine, spawn deep-clones per instance.
  static _merge(base, over) {
    const out = {};
    for (const token in base ?? {}) out[token] = base[token];
    for (const token in over ?? {}) {
      out[token] =
        out[token] !== undefined
          ? { ...out[token], ...over[token] }
          : over[token];
    }
    return out;
  }

  // GMRT-safe deep copy. Recurses arrays and PLAIN data objects only: a GM asset ref (sprite
  // handle) also reports typeof "object", but its constructor !== Object (probed on 0.20;
  // Object.keys(ref) is 0 without throwing, so recursing would silently turn it into {}) —
  // refs, scalars, and functions pass through BY REFERENCE.
  static _clone(v) {
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
  }

  // Normalize an authored Visual (sprite/color + optional overrides) into the full runtime
  // shape and bake the size split: `scale` = design size (also on the BBox), xscale/yscale =
  // scale / ArtDensity (see ArtDensity — art resolution never touches the BBox).
  static _bakeVisual(vis, k) {
    vis.visible = vis.visible ?? true;
    vis.subimg = vis.subimg ?? 0;
    vis.rot = vis.rot ?? 0;
    vis.color = vis.color ?? c_white;
    vis.alpha = vis.alpha ?? 1;
    vis.speed = vis.speed ?? 0;
    vis.time = vis.time ?? 0;
    vis.scale = k;
    const f = ArtDensity.fit(k, vis.sprite);
    vis.xscale = f;
    vis.yscale = f;
  }

  // Design scale on the collision footprint (authored world units at scale 1).
  static _bakeBox(box, k) {
    box.x *= k;
    box.y *= k;
    box.width *= k;
    box.height *= k;
  }
};
