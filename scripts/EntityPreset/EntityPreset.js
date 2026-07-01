// Named entity templates. Each spawn shallow-copies every component so instances don't share-and-mutate the template.
/** @typedef {Object} EntityPresetDef @property {string} id @property {Object<string,Object>} [components] component token -> data */
globalThis.EntityPreset = class EntityPreset {
  /** @type {Map<string, EntityPresetDef>} */
  static presets = new Map();

  /** @param {EntityPresetDef[]} presets */
  static register(presets) {
    for (const preset of presets) {
      this.presets.set(preset.id, preset);
    }
  }

  /** Spawn a preset at (x, y, z). Throws for unknown ids. @param {string} presetId @param {ECS} world @param {number} x @param {number} y @param {number} [z=0] @returns {number} entity id */
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

  /** @param {string} presetId @returns {boolean} */
  static has(presetId) {
    return this.presets.has(presetId);
  }

  /** @param {string} presetId @returns {EntityPresetDef|undefined} */
  static get(presetId) {
    return this.presets.get(presetId);
  }
};
