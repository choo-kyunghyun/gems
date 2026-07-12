// Settlement — a named, factioned TERRITORY that is at once a data container (Name + Faction) and
// a level Zone (its lands). A settlement IS a Zone in the "settlement" ZoneMap channel: its painted
// cells are its lands, and its flat `data` payload carries { factionId, color } (name on zone.name).
// A cell belongs to at most one settlement (ZoneMap keys each cell to one zone), so lookup is O(1).
//
// Stateless namespace over a level's channel (like ZoneSystem/InventorySystem) — Core-only deps
// (level/Zone/ZoneMap); it holds NO policy about which faction is "the player" (the consumer decides,
// e.g. BuildMode gates on ownerAt === "player"). Multiple settlements per map are supported: a player
// Home founded at a Survey Post, plus authored faction hubs / raider camps (data-driven). The seed
// for ROADMAP Farming + "Defend the settlement" raids, which layer on the settlement + its lands.
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
   * @param {{ name?: string, factionId?: string, color?: string, data?: Object }} [opt]
   *        `data` merges extra flat scalars onto the base { factionId, color } (raid/farm state later).
   * @returns {Zone} the founded settlement zone
   */
  found(level, x1, y1, x2, y2, opt = {}) {
    const m = Settlement.channel(level);
    const data = {
      factionId: opt.factionId ?? "",
      color: opt.color ?? Settlement.DEFAULT_COLOR,
    };
    // fold any extra flat scalars (kept flat — GMRT JSON.stringify faults on nested values)
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
