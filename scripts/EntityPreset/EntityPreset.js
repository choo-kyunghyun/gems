// Named entity templates: register a preset once ({ id, components }), then spawn copies of it.
// Each spawn gets a fresh Position plus a shallow copy of every preset component, so instances
// never share-and-mutate the template's data objects.
/** @typedef {Object} EntityPresetDef @property {string} id @property {Object<string,Object>} [components] component token -> data */
globalThis.EntityPreset = class EntityPreset {
  /** @type {Map<string, EntityPresetDef>} */
  static presets = new Map();

  /** Register an array of preset definitions (keyed by `id`). @param {EntityPresetDef[]} presets */
  static register(presets) {
    for (const preset of presets) {
      this.presets.set(preset.id, preset);
    }
  }

  /**
   * Spawn an entity from a preset at (x, y, z). Throws if the preset is unknown.
   * @param {string} presetId @param {World} world @param {number} x @param {number} y @param {number} [z=0]
   * @returns {number} the new entity id
   */
  static spawn(presetId, world, x, y, z = 0) {
    const preset = this.presets.get(presetId);
    if (preset === undefined)
      throw new Error(`Unknown entity preset: ${presetId}`);

    const id = world.create();
    world.add(id, Position, { x, y, z });

    const components = preset.components ?? {};
    const keys = Object.keys(components);
    for (let i = 0; i < keys.length; i++) {
      world.add(id, keys[i], { ...components[keys[i]] });
    }

    return id;
  }

  /** @param {string} presetId @returns {boolean} whether a preset with that id is registered */
  static has(presetId) {
    return this.presets.has(presetId);
  }

  /** @param {string} presetId @returns {EntityPresetDef|undefined} */
  static get(presetId) {
    return this.presets.get(presetId);
  }
};
