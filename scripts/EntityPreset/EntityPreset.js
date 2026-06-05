globalThis.EntityPreset = class EntityPreset {
  static presets = new Map();

  static register(presets) {
    for (const preset of presets) {
      this.presets.set(preset.id, preset);
    }
  }

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

  static has(presetId) {
    return this.presets.has(presetId);
  }

  static get(presetId) {
    return this.presets.get(presetId);
  }
};
