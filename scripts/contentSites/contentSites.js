// The colony's WORLD MAP data — the sites a travel beacon can deploy the squad to. Each is one
// Level in the World pool, generated on first arrival (ColonyLevel.load → build) and resident
// thereafter.
/**
 * Pure data plus its by-id lookup, no registration step (like contentTiles). A site:
 *   id          the map id it pools under (World) — a save stores it, so renaming one is a migration
 *   name        i18n key; `desc` the i18n key of the world map's one-line brief
 *   pos         { x, y } in [0,1] chart space — the world map's node placement AND the travel-time
 *               metric (ColonyMap.travelHours)
 *   danger      0..3 threat tier, the world map's readout (the generator reads the biome, not this)
 *   biome       contentBiomes.BIOMES profile id — the generator's stage tuning, and the world map's
 *               terrain readout
 *   cols/rows   the level's size in cells; `seed` the generator seed (the same seed lays the same
 *               level on every first build)
 *   anchor      the Prefab id GenAnchor fixes on dry ground near the centre — the site's one
 *               hand-built structure (contentPrefabs), carrying its beacon and its `entry` marker
 *   clear?      cells kept procedural-free around the anchor (default ColonyLevel's)
 *   settlement? the level's settlement record (meta.settlement — Settlement.found on arrival):
 *               { name (i18n key), faction, comp (SettlementComponent ids), color }
 * The first entry is the HOME site (ColonyLevel.START): the chart's routes fan out from it.
 */
globalThis.contentSites = {
  SITES: [
    {
      id: "hub",
      name: "SITE_HUB",
      desc: "SITE_HUB_DESC",
      biome: "steppe",
      danger: 0,
      pos: { x: 0.5, y: 0.55 },
      cols: 128,
      rows: 128,
      seed: 1337,
      anchor: "colony_hub",
      settlement: {
        name: "SETTLEMENT_HUB_NAME",
        faction: "colony",
        comp: ["market", "depot"],
        color: "#5a86d0",
      },
    },
    {
      id: "cave",
      name: "SITE_CAVE",
      desc: "SITE_CAVE_DESC",
      biome: "cave",
      danger: 1,
      pos: { x: 0.68, y: 0.72 },
      cols: 40,
      rows: 32,
      seed: 7013,
      anchor: "cave_mouth",
      clear: 3,
    },
    {
      id: "frost",
      name: "SITE_FROST",
      desc: "SITE_FROST_DESC",
      biome: "frost",
      danger: 2,
      pos: { x: 0.3, y: 0.18 },
      cols: 96,
      rows: 96,
      seed: 2101,
      anchor: "landing_pad",
    },
    {
      id: "marsh",
      name: "SITE_MARSH",
      desc: "SITE_MARSH_DESC",
      biome: "marsh",
      danger: 2,
      pos: { x: 0.8, y: 0.3 },
      cols: 96,
      rows: 96,
      seed: 3307,
      anchor: "landing_pad",
    },
    {
      id: "badlands",
      name: "SITE_BADLANDS",
      desc: "SITE_BADLANDS_DESC",
      biome: "badlands",
      danger: 3,
      pos: { x: 0.2, y: 0.8 },
      cols: 112,
      rows: 112,
      seed: 4409,
      anchor: "landing_pad",
    },
  ],

  /** the site def for a map id, or undefined */
  get(id) {
    const all = contentSites.SITES;
    for (let i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return undefined;
  },
};
