// Faction roster + relations for the RPG — the brain behind the `Faction` component.
// A stateless-style globalThis service (like MeleeSystem/EquipmentSystem) that ALSO holds the
// registered faction defs and the relation matrix (PathfindingSystem likewise holds state). Two
// layers of API:
//
//   • faction-id level (pure config): register / get / all / setRelation / relation /
//     isHostile / isAlly. Relations are SYMMETRIC and default to "neutral"; an entity is always
//     an ally of its own faction (same id → "ally").
//   • entity level (reads the Faction component off `world`): factionOf / hostile / allied /
//     nearestHostile — the glue AI and combat actually call.
//
// Register the roster once at content setup (RpgContent.register). Wiring:
//   - CombatAI acquires a target via nearestHostile (no hardcoded player id anymore).
//   - MeleeSystem / ProjectileSystem skip ALLIED targets (no friendly fire); neutral + hostile
//     are still hit, so the change is a no-op until allied combatants exist.
//
// GMRT note: a plain object (no 50-method class ceiling); the registry is index-looped over
// `_order` (never a Map-iterator for...of, which hard-crashes the runtime — see CLAUDE.md).
globalThis.FactionSystem = {
  _defs: new Map(), // id → { id, name, color }
  _order: [], // insertion order of ids (for all())
  _rel: new Map(), // canonical pair key → "ally" | "neutral" | "hostile"

  // ── Roster ────────────────────────────────────────────────────────────────
  /**
   * Register faction defs (later defs with the same id overwrite). `name` is a display string,
   * `color` a GM colour int or "#rrggbb" (for future nameplate/blip tinting); both optional.
   * @param {{id:string,name?:string,color?:number|string}[]} defs
   */
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

  /** All faction defs in registration order. Index-loops `_order` (no Map-iterator for...of). */
  all() {
    const out = [];
    for (let i = 0; i < this._order.length; i++)
      out.push(this._defs.get(this._order[i]));
    return out;
  },

  // ── Relations (faction-id level) ────────────────────────────────────────────
  // Canonical, order-independent pair key so a relation is symmetric (setRelation(a,b) ==
  // setRelation(b,a)). Faction ids are simple tokens, so "|" is a safe separator.
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

  // ── Entity level (reads the Faction component) ──────────────────────────────
  /** Faction id of an entity, or undefined when it carries no Faction component. */
  factionOf(world, id) {
    const f = world.get(Faction, id);
    return f === undefined ? undefined : f.id;
  },

  /** True only when BOTH entities have a faction and those factions are hostile. */
  hostile(world, a, b) {
    const fa = this.factionOf(world, a);
    const fb = this.factionOf(world, b);
    if (fa === undefined || fb === undefined) return false;
    return this.isHostile(fa, fb);
  },

  /**
   * True only when BOTH entities have a faction and those factions are allied. Combat skips
   * these (no friendly fire); an entity with no faction is NOT allied, so it's still hit —
   * keeping the filter a no-op for current content (only enemies/player carry factions).
   */
  allied(world, a, b) {
    const fa = this.factionOf(world, a);
    const fb = this.factionOf(world, b);
    if (fa === undefined || fb === undefined) return false;
    return this.isAlly(fa, fb);
  },

  /**
   * Nearest entity HOSTILE to `id`'s faction within `range` px of (x, y), or -1. Skips self and
   * any entity without a faction. `opt.needsHealth` (default true) restricts candidates to
   * attackable bodies, so AI targets combatants — not props/portals. The aggro acquisition for
   * CombatAI; the seam for any "who do I fight?" query.
   */
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
