/**
 * A settlement IS a level: the map is its whole territory and the level's id is its identity.
 * Its record { factionId, name, color, comp } sits on the level's own entity and saves with it;
 * a level carries at most one, authored or founded in play, and is unsettled until then.
 *
 * Free functions over the level (docs/GMRT.md) holding no policy about which faction is the
 * player's — the consumer decides. Only the record lives here; the inhabitants are entities in
 * the level's store whose Resident settlementId is the level id.
 */
globalThis.Settlement = {
  KEY: "settlement", // saved
  DEFAULT_COLOR: "#55aa55",

  /** Undefined while the level is unsettled. */
  of(level) {
    return level.entities.get(level.self, Settlement.KEY);
  },

  id(level) {
    return level.id;
  },

  /** Owner faction id: "" = unfactioned; undefined = the level is unsettled. */
  owner(level) {
    const s = level.entities.get(level.self, Settlement.KEY);
    return s === undefined ? undefined : s.factionId;
  },

  /**
   * Returns the new record, or undefined without touching an already-settled level. `opt.comp`
   * is copied, so the caller's def stays its own.
   */
  found(level, opt = {}) {
    if (level.entities.has(level.self, Settlement.KEY)) return undefined;
    const s = {
      factionId: opt.factionId ?? "",
      name: opt.name ?? "",
      color: opt.color ?? Settlement.DEFAULT_COLOR,
      comp: Array.isArray(opt.comp) ? opt.comp.slice() : [],
    };
    level.entities.add(level.self, Settlement.KEY, s);
    return s;
  },

  components(s) {
    return s.comp; // the live array
  },

  hasComponent(s, id) {
    return s.comp.indexOf(id) >= 0;
  },

  /** No-op if already present. */
  addComponent(s, id) {
    if (s.comp.indexOf(id) >= 0) return false;
    s.comp.push(id);
    return true;
  },

  /** No-op if absent. */
  removeComponent(s, id) {
    const i = s.comp.indexOf(id);
    if (i < 0) return false;
    s.comp.splice(i, 1);
    return true;
  },
};
