/**
 * Faction roster and relation matrix.
 *
 * Relations are symmetric, default "neutral"; same id → "ally" always. GMRT: a plain object, which
 * also avoids the 50-method class ceiling (docs/GMRT.md).
 */
globalThis.Diplomacy = {
  _rel: new Map(), // canonical pair key → "ally" | "neutral" | "hostile"

  // ── Roster — a Registry facade
  register(defs) {
    Registry.register(Diplomacy, defs, Diplomacy.make);
  },

  /** { id, name, color } — color a colour int or "#rrggbb" hex. */
  make(def) {
    return {
      id: def.id,
      name: def.name ?? "",
      color:
        typeof def.color === "string"
          ? Color.parse(def.color)
          : (def.color ?? c_white),
    };
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

  /**
   * The nearest hostile Health carrier whose mask reaches within `range` px of (x,y), or -1 —
   * the runtime's ordered circle query (Query.maskCircle), so a body whose box crosses the ring
   * counts, nearness is its box centre's, and a solid-off body never answers. CombatAI's aggro
   * acquisition.
   */
  nearestHostile(entities, id, x, y, range) {
    const fa = Diplomacy.factionOf(entities, id);
    if (fa === undefined) return -1;
    const ids = Query.maskCircle(entities, x, y, range, { has: Health, ignore: id, ordered: true });
    for (let i = 0; i < ids.length; i++) {
      const oid = ids[i];
      const fb = Diplomacy.factionOf(entities, oid);
      if (fb === undefined) continue;
      if (Diplomacy.isHostile(fa, fb)) return oid;
    }
    return -1;
  },
};
