// Settlement — a named, factioned TERRITORY that is at once a data container (Name + Faction +
// capability components) and a level Zone (its lands). A settlement IS a Zone in the "settlement"
// ZoneMap channel: its painted cells are its lands, and its flat `data` payload carries
// { sid, factionId, color, comp } — a stable id, the owner faction, the land tint, and a
// comma-joined SettlementComponent id list (name on zone.name). All flat scalars, so it round-trips
// ZoneMap.export. A cell belongs to at most one settlement (one zone per cell), so lookup is O(1).
//
// Stateless namespace over a level's channel (like ZoneSystem/InventorySystem) — Core-only deps
// (level/Zone/ZoneMap + uuid); it holds NO policy about which faction is "the player" (the consumer
// decides, e.g. BuildMode gates on ownerAt === "player"). Multiple settlements per map are supported:
// a player Home founded at a Survey Post, plus authored faction hubs / raider camps (data-driven).
// The LANDS + capability data live here; a settlement's INHABITANTS live in the World as entities
// carrying Resident{ settlementId: sid } — resolved by SettlementSystem. The seed for ROADMAP
// Farming + "Defend the settlement" raids, which layer on the settlement + its lands + residents.
globalThis.Settlement = {
  CHANNEL: "settlement", // the ZoneMap channel every settlement lives in
  TAG: "settlement", // every settlement Zone carries this tag (byTag lookup)
  DEFAULT_COLOR: "#55aa55", // fallback land tint (matches the legacy build-zone green)

  // Ensure the settlement channel exists on a level and return it (idempotent). A map creates the
  // empty channel up front so RenderZone + persistence import have a target before anything is founded.
  channel(level) {
    let m = level.zoneMap(Settlement.CHANNEL);
    if (m === undefined) m = level.addZoneMap(Settlement.CHANNEL);
    return m;
  },

  /**
   * Found a settlement over an inclusive cell rect: defines a Zone + paints its lands.
   * @param {Object} level  the LevelGrid hosting the channel
   * @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2  inclusive cell rect
   * @param {{ id?: string, name?: string, factionId?: string, color?: string, comp?: string, data?: Object }} [opt]
   *        `id` is the stable sid (authored settlements pass one; player-founded default to a minted
   *        uuid). `comp` is the initial comma-joined SettlementComponent id list. `data` merges extra
   *        flat scalars onto the base (kept flat — GMRT JSON.stringify faults on nested values).
   * @returns {Zone} the founded settlement zone
   */
  found(level, x1, y1, x2, y2, opt = {}) {
    const m = Settlement.channel(level);
    const data = {
      sid: opt.id ?? uuid(), // stable identity — Resident.settlementId matches this
      factionId: opt.factionId ?? "",
      color: opt.color ?? Settlement.DEFAULT_COLOR,
      comp: opt.comp ?? "", // comma-joined SettlementComponent ids (JSON-safe)
    };
    if (opt.data !== undefined) for (const k in opt.data) data[k] = opt.data[k];
    const zone = m.define({
      name: opt.name ?? "",
      tags: [Settlement.TAG],
      data,
    });
    m.paintRect(zone.id, x1, y1, x2, y2);
    return zone;
  },

  /** @returns {Zone|undefined} the settlement whose lands include cell (gx,gy). */
  at(level, gx, gy) {
    const m = level.zoneMap(Settlement.CHANNEL);
    return m === undefined ? undefined : m.at(gx, gy);
  },

  /** @returns {Zone|undefined} the settlement at a WORLD point. */
  atWorld(level, wx, wy) {
    const c = level.worldToGrid(wx, wy);
    return Settlement.at(level, c.x, c.y);
  },

  /** @returns {string|undefined} owner faction id at a cell ("" = unfactioned; undefined = no settlement). */
  ownerAt(level, gx, gy) {
    const z = Settlement.at(level, gx, gy);
    return z === undefined ? undefined : z.data.factionId;
  },

  /** @returns {Zone[]} every settlement on a level. */
  all(level) {
    const m = level.zoneMap(Settlement.CHANNEL);
    return m === undefined ? [] : m.byTag(Settlement.TAG);
  },

  /** @returns {string} a settlement's stable id (Resident.settlementId matches this). */
  sid(zone) {
    return zone.data.sid;
  },

  /** @returns {Zone|undefined} the settlement with this sid on a level. */
  byId(level, sid) {
    const all = Settlement.all(level);
    for (let i = 0; i < all.length; i++)
      if (all[i].data.sid === sid) return all[i];
    return undefined;
  },

  // ── capability components (faction-style: a flat comma-joined id list in zone.data.comp) ──

  /** @returns {string[]} the settlement's SettlementComponent ids (empty list if none). */
  components(zone) {
    const c = zone.data.comp;
    if (c === undefined || c === "") return [];
    return c.split(",");
  },

  /** @returns {boolean} whether the settlement carries component `id`. */
  hasComponent(zone, id) {
    return Settlement.components(zone).indexOf(id) >= 0;
  },

  /** Add capability `id` to the settlement (no-op if already present). @returns {boolean} added */
  addComponent(zone, id) {
    const list = Settlement.components(zone);
    if (list.indexOf(id) >= 0) return false;
    list.push(id);
    zone.data.comp = list.join(",");
    return true;
  },

  /** Remove capability `id` from the settlement (no-op if absent). @returns {boolean} removed */
  removeComponent(zone, id) {
    const list = Settlement.components(zone);
    const i = list.indexOf(id);
    if (i < 0) return false;
    list.splice(i, 1);
    zone.data.comp = list.join(",");
    return true;
  },

  /** Grow a settlement's lands over an inclusive cell rect (seam for multi-post growth). */
  expand(level, zoneId, x1, y1, x2, y2) {
    const m = level.zoneMap(Settlement.CHANNEL);
    if (m !== undefined) m.paintRect(zoneId, x1, y1, x2, y2);
  },

  /**
   * World-coord centroid of a settlement's lands, or null if it has none. A rect settlement's
   * centroid lands inside it; snapped to a real cell center via gridToWorld.
   * @returns {{x:number,y:number}|null}
   */
  centroidWorld(level, zone) {
    const m = level.zoneMap(Settlement.CHANNEL);
    if (m === undefined || zone === undefined) return null;
    const cells = m.cells(zone.id);
    if (cells.length === 0) return null;
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < cells.length; i++) {
      sx += cells[i].x;
      sy += cells[i].y;
    }
    return level.gridToWorld(
      Math.round(sx / cells.length),
      Math.round(sy / cells.length),
    );
  },
};
