// Faction roster + relation matrix — two layers: id-level config (register/setRelation/isHostile/isAlly)
// and entity-level glue (factionOf/hostile/allied/nearestHostile) that AI and combat call.
/**
 * Relations are symmetric, default "neutral"; same id → "ally" always. GMRT: a plain object, which
 * also avoids the 50-method class ceiling (see CLAUDE.md).
 */
globalThis.FactionSystem = {
  // ── Roster — a Registry facade (Registry owns the store's contract) ──
  _defs: new Map(), // id → { id, name, color }
  _order: [], // insertion order of ids
  _rel: new Map(), // canonical pair key → "ally" | "neutral" | "hostile"

  /** @param {{id:string,name?:string,color?:number|string}[]} defs */
  register(defs) {
    Registry.register(FactionSystem, defs, (def) => ({
      id: def.id,
      name: def.name ?? "",
      color:
        typeof def.color === "string"
          ? Color.parse(def.color)
          : (def.color ?? c_white),
    }));
    return this;
  },

  get(id) {
    return Registry.get(FactionSystem, id);
  },

  has(id) {
    return Registry.has(FactionSystem, id);
  },

  all() {
    return Registry.all(FactionSystem);
  },

  // ── Relations (faction-id level)
  // order-independent pair key so relations are symmetric; "|" is safe since ids are simple tokens
  _key(a, b) {
    return a < b ? a + "|" + b : b + "|" + a;
  },

  /** Set the (symmetric) relation between two factions. rel: "ally" | "neutral" | "hostile". */
  setRelation(a, b, rel) {
    this._rel.set(this._key(a, b), rel);
    return this;
  },

  /** Relation between two faction ids. Same id → "ally"; otherwise stored value or "neutral". */
  relation(a, b) {
    if (a === b) return "ally";
    const r = this._rel.get(this._key(a, b));
    return r === undefined ? "neutral" : r;
  },

  isHostile(a, b) {
    return this.relation(a, b) === "hostile";
  },

  isAlly(a, b) {
    return this.relation(a, b) === "ally";
  },

  // ── Entity level (reads the Faction component)
  /** faction id, or undefined with no Faction component. */
  factionOf(entities, id) {
    const f = entities.get(Faction, id);
    return f === undefined ? undefined : f.id;
  },

  /** true only when both have factions and they're hostile. */
  hostile(entities, a, b) {
    const fa = this.factionOf(entities, a);
    const fb = this.factionOf(entities, b);
    if (fa === undefined || fb === undefined) return false;
    return this.isHostile(fa, fb);
  },

  /** true only when both have factions and they're allied. combat skips these (no friendly fire);
   *  a factionless entity is NOT allied, so it's still hit. */
  allied(entities, a, b) {
    const fa = this.factionOf(entities, a);
    const fb = this.factionOf(entities, b);
    if (fa === undefined || fb === undefined) return false;
    return this.isAlly(fa, fb);
  },

  /** nearest hostile within `range` px of (x,y), or -1. opt.needsHealth (default true) limits to
   *  attackable bodies, so AI targets combatants not props/portals. CombatAI's aggro acquisition. */
  nearestHostile(entities, id, x, y, range, opt = {}) {
    const fa = this.factionOf(entities, id);
    if (fa === undefined) return -1;
    const needsHealth = opt.needsHealth !== false;
    const ids = needsHealth
      ? entities.query(Health, Position)
      : entities.query(Position);
    let bestId = -1;
    let bestD = range * range;
    for (const oid of ids) {
      if (oid === id) continue;
      const fb = this.factionOf(entities, oid);
      if (fb === undefined || !this.isHostile(fa, fb)) continue;
      const p = entities.get(Position, oid);
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        bestId = oid;
      }
    }
    return bestId;
  },
};
