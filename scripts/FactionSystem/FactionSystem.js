// faction roster + relation matrix. two layers: id-level config (register/setRelation/isHostile/isAlly)
// and entity-level glue (factionOf/hostile/allied/nearestHostile) that AI and combat actually call.
// relations are symmetric, default "neutral"; same id → "ally" always.
// GMRT: plain object (avoids 50-method class ceiling); registry iterates `_order` array — never
// a Map-iterator for...of, which hard-crashes the runtime (see CLAUDE.md).
globalThis.FactionSystem = {
  _defs: new Map(), // id → { id, name, color }
  _order: [], // insertion order of ids (for all())
  _rel: new Map(), // canonical pair key → "ally" | "neutral" | "hostile"

  // ── Roster ────────────────────────────────────────────────────────────────
  /** @param {{id:string,name?:string,color?:number|string}[]} defs */
  register(defs) {
    for (const def of defs) {
      const f = {
        id: def.id,
        name: def.name ?? "",
        color:
          typeof def.color === "string"
            ? Color.parse(def.color)
            : (def.color ?? c_white),
      };
      if (!this._defs.has(f.id)) this._order.push(f.id);
      this._defs.set(f.id, f);
    }
    return this;
  },

  get(id) {
    return this._defs.get(id);
  },

  has(id) {
    return this._defs.has(id);
  },

  /** all defs in registration order. index-loops `_order` — no Map-iterator for...of (GMRT crash). */
  all() {
    const out = [];
    for (let i = 0; i < this._order.length; i++)
      out.push(this._defs.get(this._order[i]));
    return out;
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
  factionOf(world, id) {
    const f = world.get(Faction, id);
    return f === undefined ? undefined : f.id;
  },

  /** true only when both have factions and they're hostile. */
  hostile(world, a, b) {
    const fa = this.factionOf(world, a);
    const fb = this.factionOf(world, b);
    if (fa === undefined || fb === undefined) return false;
    return this.isHostile(fa, fb);
  },

  /** true only when both have factions and they're allied. combat skips these (no friendly fire);
   *  a factionless entity is NOT allied, so it's still hit. */
  allied(world, a, b) {
    const fa = this.factionOf(world, a);
    const fb = this.factionOf(world, b);
    if (fa === undefined || fb === undefined) return false;
    return this.isAlly(fa, fb);
  },

  /** nearest hostile within `range` px of (x,y), or -1. opt.needsHealth (default true) limits to
   *  attackable bodies, so AI targets combatants not props/portals. CombatAI's aggro acquisition. */
  nearestHostile(world, id, x, y, range, opt = {}) {
    const fa = this.factionOf(world, id);
    if (fa === undefined) return -1;
    const needsHealth = opt.needsHealth !== false;
    const ids = needsHealth
      ? world.query(Health, Position)
      : world.query(Position);
    let bestId = -1;
    let bestD = range * range;
    for (const oid of ids) {
      if (oid === id) continue;
      const fb = this.factionOf(world, oid);
      if (fb === undefined || !this.isHostile(fa, fb)) continue;
      const p = world.get(Position, oid);
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        bestId = oid;
      }
    }
    return bestId;
  },
};
