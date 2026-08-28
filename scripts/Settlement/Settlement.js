/**
 * A settlement IS a level: the map it stands on is its territory whole, and the level's id is
 * its identity (Resident.settlementId matches it). Its record — { factionId, name, color, comp }:
 * the owner faction, a display name, a tint, and a SettlementComponent id array — is the level's
 * whole-map record under KEY (LevelMeta), pooled with the Level and saved beside its store, the
 * way the climate record pins the sky. A level carries at most one, authored by `meta.settlement`
 * (ColonyMap._buildWorld — a faction hub, a raider camp) or founded at a Survey Post
 * (BuildMode.claim); until then it is unsettled.
 *
 * Free functions over the level (composition; GMRT has no usable class inheritance) holding NO
 * policy about which faction is "the player" — the consumer decides (BuildMode gates on
 * FactionSystem.isAlly). The RECORD lives here; a settlement's INHABITANTS live in the level's
 * store as entities carrying Resident{ settlementId: <level id> } — resolved by SettlementSystem.
 * The seed for the planned Farming + "Defend the settlement" raids.
 */
globalThis.Settlement = {
  KEY: "settlement", // its LevelMeta key — a data key (a save holds it)
  DEFAULT_COLOR: "#55aa55", // fallback tint (matches the legacy build-zone green)

  /** The level's settlement record, or undefined while it is unsettled. */
  of(level) {
    return level.meta.get(Settlement.KEY);
  },

  /** The settlement's identity — its level's id (Resident.settlementId matches this). */
  id(level) {
    return level.id;
  },

  /** Owner faction id: "" = unfactioned; undefined = the level is unsettled. */
  owner(level) {
    const s = level.meta.get(Settlement.KEY);
    return s === undefined ? undefined : s.factionId;
  },

  /**
   * Found a settlement over the whole level: sets its record and returns it, or returns
   * undefined without touching an already-settled level. opt: `factionId` (the owner), `name`,
   * `color`, `comp` (the initial SettlementComponent id array — copied, so the caller's def stays
   * its own).
   */
  found(level, opt = {}) {
    if (level.meta.has(Settlement.KEY)) return undefined;
    const s = {
      factionId: opt.factionId ?? "",
      name: opt.name ?? "",
      color: opt.color ?? Settlement.DEFAULT_COLOR,
      comp: Array.isArray(opt.comp) ? opt.comp.slice() : [],
    };
    level.meta.set(Settlement.KEY, s);
    return s;
  },

  // ── capability components (a SettlementComponent id array in the record's comp) ──

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
