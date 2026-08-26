// The colony's WORLD MAP data — the sites a travel beacon can deploy the squad to. Each is one
// Level in the World pool, built on first arrival (ColonyLevel.load) and resident thereafter.
/**
 * Pure data plus its by-id lookup, no registration step (like contentTiles). A site:
 *   id       the map id it pools under (World) — a save stores it, so renaming one is a migration
 *   name     i18n key; `desc` the i18n key of the world map's one-line brief
 *   pos      { x, y } in [0,1] chart space — the world map's node placement AND the travel-time
 *            metric (ColonyMap.travelHours)
 *   danger   0..3 threat tier, the world map's readout (the generator reads the biome, not this)
 *   biome    contentBiomes.BIOMES profile id — the world map's terrain readout, and, for a
 *            synthesized site, the generator profile
 *   file     an AUTHORED level file (its meta carries the generator seed/biome and the entries);
 *            absent → the level is synthesized from `biome` at cols×rows with `seed`
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
      file: "levels/overworld.json",
    },
    {
      id: "cave",
      name: "SITE_CAVE",
      desc: "SITE_CAVE_DESC",
      danger: 1,
      pos: { x: 0.68, y: 0.72 },
      file: "levels/interior_01.json",
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
    },
  ],

  /** the site def for a map id, or undefined */
  get(id) {
    const all = contentSites.SITES;
    for (let i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return undefined;
  },
};
