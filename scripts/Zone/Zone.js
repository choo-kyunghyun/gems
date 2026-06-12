/**
 * A named, tagged spatial region of a level. Zones back build-mode buildable
 * area, faction territory, in-game events, quest regions, weather areas, etc.
 * A Zone is a plain definition object; its cell membership lives in a ZoneMap.
 *
 * @typedef {Object} ZoneOpt
 * @property {number} [id]      small positive int, unique within its ZoneMap
 * @property {string} [name]
 * @property {string[]} [tags]  category tokens, e.g. ["faction"], ["weather"]
 * @property {Object} [data]    flat scalar payload, e.g. { factionId, weather, color }
 */
globalThis.Zone = class Zone {
  /** @param {ZoneOpt} opt */
  constructor(opt = {}) {
    this.id = opt.id;
    this.name = opt.name ?? "";
    // Tags are a plain string[] (indexOf/includes), NOT a Set — Set iteration
    // hard-crashes the GMRT runtime (see CLAUDE.md GMRT-Safe Idioms).
    this.tags = opt.tags ?? [];
    // Keep `data` flat scalars: a save layer serializing it hits the GMRT
    // JSON.stringify nested-object fault.
    this.data = opt.data ?? {};
  }

  hasTag(t) {
    return this.tags.indexOf(t) >= 0;
  }
};
