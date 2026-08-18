/**
 * A settlement IS a Zone in the "settlement" ZoneMap channel: its painted cells are its lands, and its
 * `data` payload carries { sid, factionId, color, comp } — a stable id, the owner faction, the land
 * tint, and a SettlementComponent id array (name on zone.name). It round-trips ZoneMap.export
 * (persisted nested via json_stringify / the Json codec — see docs/GMRT.md). A cell belongs to at most
 * one settlement (one zone per cell), so lookup is O(1).
 *
 * Stateless namespace over a level's channel (like InventorySystem) — Core-only deps
 * (grid/Zone/ZoneMap + uuid); it holds NO policy about which faction is "the player" (the consumer
 * decides, e.g. BuildMode gates on ownerAt === "player"). Multiple settlements per map are supported: a
 * player Home founded at a Survey Post, plus authored faction hubs / raider camps (data-driven). The
 * LANDS + capability data live here; a settlement's INHABITANTS live in the store as entities carrying
 * Resident{ settlementId: sid } — resolved by SettlementSystem. The seed for ROADMAP Farming + "Defend
 * the settlement" raids.
 */
globalThis.Settlement = {
  CHANNEL: "settlement", // the ZoneMap channel every settlement lives in
  TAG: "settlement", // every settlement Zone carries this tag (byTag lookup)
  DEFAULT_COLOR: "#55aa55", // fallback land tint (matches the legacy build-zone green)

  /**
   * Ensure the settlement channel exists on a level and return it (idempotent). A map creates the
   * empty channel up front so RenderZone + persistence import have a target before anything is founded.
   */
  channel(grid) {
    let m = grid.zoneMap(Settlement.CHANNEL);
    if (m === undefined) m = grid.addZoneMap(Settlement.CHANNEL);
    return m;
  },

  /**
   * Found a settlement over an inclusive cell rect: defines a Zone + paints its lands.
   * opt: `id` is the stable sid (authored settlements pass one; player-founded default to a minted
   * uuid); `comp` the initial SettlementComponent id array; `data` merges extra fields onto the
   * base (nesting OK — persisted via json_stringify / the Json codec).
   */
  found(grid, x1, y1, x2, y2, opt = {}) {
    const m = Settlement.channel(grid);
    const data = {
      sid: opt.id ?? uuid(), // stable identity — Resident.settlementId matches this
      factionId: opt.factionId ?? "",
      color: opt.color ?? Settlement.DEFAULT_COLOR,
      comp: opt.comp ?? [], // SettlementComponent ids
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

  at(grid, gx, gy) {
    const m = grid.zoneMap(Settlement.CHANNEL);
    return m === undefined ? undefined : m.at(gx, gy);
  },

  atWorld(grid, wx, wy) {
    const c = grid.worldToGrid(wx, wy);
    return Settlement.at(grid, c.x, c.y);
  },

  /** Owner faction id at a cell: "" = unfactioned; undefined = no settlement. */
  ownerAt(grid, gx, gy) {
    const z = Settlement.at(grid, gx, gy);
    return z === undefined ? undefined : z.data.factionId;
  },

  all(grid) {
    const m = grid.zoneMap(Settlement.CHANNEL);
    return m === undefined ? [] : m.byTag(Settlement.TAG);
  },

  /** The settlement's stable id (Resident.settlementId matches this). */
  sid(zone) {
    return zone.data.sid;
  },

  byId(grid, sid) {
    const all = Settlement.all(grid);
    for (let i = 0; i < all.length; i++)
      if (all[i].data.sid === sid) return all[i];
    return undefined;
  },

  // ── capability components (a SettlementComponent id array in zone.data.comp) ──

  components(zone) {
    const c = zone.data.comp;
    return Array.isArray(c) ? c : []; // the live array; legacy/undefined → empty
  },

  hasComponent(zone, id) {
    return Settlement.components(zone).indexOf(id) >= 0;
  },

  /** No-op if already present. */
  addComponent(zone, id) {
    if (!Array.isArray(zone.data.comp)) zone.data.comp = [];
    if (zone.data.comp.indexOf(id) >= 0) return false;
    zone.data.comp.push(id);
    return true;
  },

  /** No-op if absent. */
  removeComponent(zone, id) {
    if (!Array.isArray(zone.data.comp)) return false;
    const i = zone.data.comp.indexOf(id);
    if (i < 0) return false;
    zone.data.comp.splice(i, 1);
    return true;
  },

  /** Grow a settlement's lands over an inclusive cell rect (seam for multi-post growth). */
  expand(grid, zoneId, x1, y1, x2, y2) {
    const m = grid.zoneMap(Settlement.CHANNEL);
    if (m !== undefined) m.paintRect(zoneId, x1, y1, x2, y2);
  },

  /**
   * World-coord centroid of a settlement's lands, or null if it has none. A rect settlement's
   * centroid lands inside it; snapped to a real cell center via gridToWorld.
   */
  centroidWorld(grid, zone) {
    const m = grid.zoneMap(Settlement.CHANNEL);
    if (m === undefined || zone === undefined) return null;
    const cells = m.cells(zone.id);
    if (cells.length === 0) return null;
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < cells.length; i++) {
      sx += cells[i].x;
      sy += cells[i].y;
    }
    return grid.gridToWorld(
      Math.round(sx / cells.length),
      Math.round(sy / cells.length),
    );
  },
};
