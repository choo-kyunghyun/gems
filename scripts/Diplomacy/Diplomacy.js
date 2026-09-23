/**
 * Faction roster and relation matrix.
 *
 * Relations are symmetric and default to "neutral"; a faction is always its own ally. A plain
 * object, not a class (docs/GMRT.md).
 */
globalThis.Diplomacy = {
  _rel: new Map(), // pair key → "ally" | "neutral" | "hostile"

  register(defs) {
    Registry.register(Diplomacy, defs, Diplomacy.make);
  },

  /** `color` is a colour int or "#rrggbb". */
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

  // order-independent, so relations are symmetric; "|" is safe since ids are simple tokens
  _key(a, b) {
    return a < b ? a + "|" + b : b + "|" + a;
  },

  /** `rel` is "ally" | "neutral" | "hostile". */
  setRelation(a, b, rel) {
    Diplomacy._rel.set(Diplomacy._key(a, b), rel);
    return Diplomacy;
  },

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

  factionOf(entities, id) {
    const f = entities.get(id, Faction);
    return f === undefined ? undefined : f.id;
  },

  hostile(entities, a, b) {
    const fa = Diplomacy.factionOf(entities, a);
    const fb = Diplomacy.factionOf(entities, b);
    if (fa === undefined || fb === undefined) return false;
    return Diplomacy.isHostile(fa, fb);
  },

  /** A factionless entity is never allied, so friendly-fire checks still hit it. */
  allied(entities, a, b) {
    const fa = Diplomacy.factionOf(entities, a);
    const fb = Diplomacy.factionOf(entities, b);
    if (fa === undefined || fb === undefined) return false;
    return Diplomacy.isAlly(fa, fb);
  },

  /**
   * The nearest hostile Health carrier whose mask reaches within `range` px, or -1. A body whose
   * box crosses the ring counts, nearness is its box centre's, and a solid-off body never answers.
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
