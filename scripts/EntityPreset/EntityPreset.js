/**
 * Named entity templates with variant inheritance.
 * @typedef {Object} EntityPresetDef
 * @property {string} id
 * @property {string} [extends]  base preset id, resolved at register time (the base registers
 *   first; unknown throws). Per-component FIELD merge — this def's fields win.
 * @property {number} [scale]    design size factor, inherited from the base; scales the collider
 *   and the look together. A per-spawn `opts.size` multiplies on top.
 * @property {Object<string,Object>} [components]  component token -> data, authored at design
 *   scale 1 in world units; DEEP-copied per spawn so instances never share nested data. A field
 *   left out takes its component's blank. A look's xscale/yscale are derived, never authored.
 * @property {function} [post]   post(entities, id, ctx) spawn hook for what data can't express;
 *   ctx = { x, y, z, scale, opts }. Inherited unless overridden.
 * Any further field is stored as authored and inherited through `extends` the same way.
 */
globalThis.EntityPreset = {
  /** Register defs in order, so a chain works top-down. Re-registering an id replaces it. */
  register(presets) {
    Registry.register(EntityPreset, presets, EntityPreset.make);
  },

  /** The stored def is flattened against the already-stored base. */
  make(def) {
    if (def.extends === undefined) return def;
    const base = EntityPreset.get(def.extends);
    if (base === undefined)
      throw new Error(`Unknown base preset: ${def.extends}`);
    return {
      ...base,
      ...def,
      components: EntityPreset._merge(base.components, def.components),
    };
  },

  /**
   * Spawn a preset at (x, y, z); throws for an unknown id. `opts.size` multiplies the def's
   * `scale` uniformly over collider and look, so they never diverge; `opts.components` are
   * per-spawn field overrides merged like `extends`. Any further field reaches `post` untouched
   * as `ctx.opts`.
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
      const data = Plain.copy(components[token]);
      entities.add(id, token, data);
      if (token === Sprite) EntityPreset._bakeSprite(data, k);
      else if (token === BBox) EntityPreset._bakeBox(data, k);
      else if (token === Mesh) EntityPreset._bakeMesh(data, k);
    }

    if (preset.post !== undefined)
      preset.post(entities, id, { x, y, z, scale: k, opts });
    return id;
  },

  has(presetId) {
    return Registry.has(EntityPreset, presetId);
  },

  get(presetId) {
    return Registry.get(EntityPreset, presetId);
  },

  /**
   * Field-level merge, `over` winning. Nested values may still be shared with the defs — spawn
   * deep-clones per instance.
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
   * Bake a Sprite's size split: xscale/yscale fit the art to the design size, so art resolution
   * never touches the collider. `anim` has no blank — Core knows no rig's set names — so a
   * skeletal sheet without one throws, as does a strip with one.
   */
  _bakeSprite(spr, k) {
    if (Anim.skeletal(spr.sprite) !== (spr.anim !== undefined))
      throw new Error(
        `EntityPreset: Sprite ${sprite_get_name(spr.sprite)} authors anim only for a skeletal sheet`,
      );
    const f = AssetMeta.fit(spr.sprite, k);
    spr.xscale = f;
    spr.yscale = f;
  },

  _bakeBox(box, k) {
    box.x *= k;
    box.y *= k;
    box.width *= k;
    box.height *= k;
  },

  /**
   * Size a mesh with its collider's factor. A per-axis factor overrides `scale`, so both get
   * k, as do the world-px box dimensions.
   */
  _bakeMesh(mesh, k) {
    if (k === 1) return;
    mesh.scale *= k;
    if (mesh.xscale !== undefined) mesh.xscale *= k;
    if (mesh.yscale !== undefined) mesh.yscale *= k;
    if (mesh.zscale !== undefined) mesh.zscale *= k;
    if (mesh.width !== undefined) mesh.width *= k;
    if (mesh.depth !== undefined) mesh.depth *= k;
    if (mesh.height !== undefined) mesh.height *= k;
  },
};
