/**
 * named, tagged region; membership lives in a ZoneMap.
 * @typedef {Object} ZoneOpt
 * @property {number} [id]      small positive int, unique within its ZoneMap
 * @property {string} [name]
 * @property {string[]} [tags]  category tokens, e.g. ["faction"], ["weather"]
 * @property {Object} [data]    JSON payload, e.g. { factionId, weather, color } (nested OK, no Set)
 */
globalThis.Zone = class Zone {
  /** @param {ZoneOpt} opt */
  constructor(opt = {}) {
    this.id = opt.id;
    this.name = opt.name ?? "";
    // tags must be string[], NOT a Set — Set iteration crashes GMRT (see CLAUDE.md)
    this.tags = opt.tags ?? [];
    // arbitrary JSON payload — nesting OK (persisted via json_stringify / the Json codec), but
    // no Set: GMRT Set iteration crashes (see CLAUDE.md)
    this.data = opt.data ?? {};
  }

  /** @param {string} t @returns {boolean} whether this zone carries tag `t`. */
  hasTag(t) {
    return this.tags.indexOf(t) >= 0;
  }
};
