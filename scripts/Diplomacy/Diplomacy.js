// Faction roster + relation matrix — two layers: id-level config (register/setRelation/isHostile/isAlly)
// and entity-level glue (factionOf/hostile/allied/nearestHostile) that AI and combat call.
/**
 * Relations are symmetric, default "neutral"; same id → "ally" always. GMRT: a plain object, which
 * also avoids the 50-method class ceiling (see CLAUDE.md).
 */
globalThis.Diplomacy = {
  // ── Roster — a Registry facade (Registry owns the store's contract) ──
  _defs: new Map(), // id → { id, name, color }
  _order: [], // insertion order of ids
  _rel: new Map(), // canonical pair key → "ally" | "neutral" | "hostile"

  register(defs) {
    Registry.register(Diplomacy, defs, (def) => ({
      id: def.id,
      name: def.name ?? "",
      color:
        typeof def.color === "string"
          ? Color.parse(def.color)
          : (def.color ?? c_white),
    }));
    return Diplomacy;
  },

  get(id) {
    return Registry.get(Diplomacy, id);
  },

  has(id) {
    return Registry.has(Diplomacy, id);
  },

  all() {
    return Registry.all(Diplomacy);
  },

  // ── Relations (faction-id level)
  // order-independent pair key so relations are symmetric; "|" is safe since ids are simple tokens
  _key(a, b) {
    return a < b ? a + "|" + b : b + "|" + a;
  },

  /**
   * Set the (symmetric) relation between two factions. rel: "ally" | "neutral" | "hostile".
   */
  setRelation(a, b, rel) {
    Diplomacy._rel.set(Diplomacy._key(a, b), rel);
    return Diplomacy;
  },

  /**
   * Relation between two faction ids. Same id → "ally"; otherwise stored value or "neutral".
   */
  relation(a, b) {
    if (a === b) return "ally";
    const r = Diplomacy._rel.get(Diplomacy._key(a, b));
    return r === undefined ? "neutral" : r;
  },

  isHostile(a, b) {
    return Diplomacy.relation(a, b) === "hostile";
  },

  isAlly(a, b) {
    return Diplomacy.relation(a, b) === "ally";
  },

  // ── Entity level (reads the Faction component)
  /**
   * faction id, or undefined with no Faction component.
   */
  factionOf(entities, id) {
    const f = entities.get(id, Faction);
    return f === undefined ? undefined : f.id;
  },

  /**
   * true only when both have factions and they're hostile.
   */
  hostile(entities, a, b) {
    const fa = Diplomacy.factionOf(entities, a);
    const fb = Diplomacy.factionOf(entities, b);
    if (fa === undefined || fb === undefined) return false;
    return Diplomacy.isHostile(fa, fb);
  },

  /** true only when both have factions and they're allied. combat skips these (no friendly fire);
   *  a factionless entity is NOT allied, so it's still hit.
   */
  allied(entities, a, b) {
    const fa = Diplomacy.factionOf(entities, a);
    const fb = Diplomacy.factionOf(entities, b);
    if (fa === undefined || fb === undefined) return false;
    return Diplomacy.isAlly(fa, fb);
  },

  /** nearest hostile within `range` px of (x,y), or -1. opt.needsHealth (default true) limits to
   *  attackable bodies, so AI targets combatants not props/beacons. CombatAI's aggro acquisition.
   */
  nearestHostile(entities, id, x, y, range, opt = {}) {
    const fa = Diplomacy.factionOf(entities, id);
    if (fa === undefined) return -1;
    const needsHealth = opt.needsHealth !== false;
    let bestId = -1;
    let bestD = range * range;
    // Faction LEADS the query: a factionless candidate was never a match, and the lead's carriers
    // are what the walk visits (ComponentStore). This scan is per idle actor (throttled by
    // Brain.aggroRate), so it is the crowd's dominant cost.
    const consider = (oid, pos, fac) => {
      if (oid === id) return;
      if (!Diplomacy.isHostile(fa, fac.id)) return;
      const d = (pos.x - x) ** 2 + (pos.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        bestId = oid;
      }
    };
    if (needsHealth) {
      entities.forEach([Faction, Health, Position], (oid, fac, hp, pos) => {
        consider(oid, pos, fac);
      });
    } else {
      entities.forEach([Faction, Position], (oid, fac, pos) => {
        consider(oid, pos, fac);
      });
    }
    return bestId;
  },
};
