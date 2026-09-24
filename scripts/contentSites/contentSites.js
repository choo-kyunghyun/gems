/**
 * The colony's world map sites: pure data plus its by-id lookup. A site's `id` is the map id it
 * pools under and a save stores it, so renaming one is a migration. `pos` is in [0,1] chart
 * space and is also the travel-time metric; `danger` 0 is a safe site that spawns no raider;
 * the same `seed` lays the same level on every first build; `anchor` is the site's one
 * hand-built structure, carrying its beacon and entry. A `claimable` site keeps the anchor's
 * Survey Post, where the player can claim it; any other site's map is built fresh on every visit.
 * A `dev` site is an authoring canvas kept off the chart outside dev mode. The first entry is the
 * home site the routes fan out from.
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
      claimable: true,
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
      claimable: true,
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
      claimable: true,
    },
    // the scratch pad: a flat canvas to build and capture prefabs on
    {
      id: "scratch",
      name: "SITE_SCRATCH",
      desc: "SITE_SCRATCH_DESC",
      biome: "flat",
      danger: 0,
      pos: { x: 0.5, y: 0.92 },
      cols: 64,
      rows: 64,
      seed: 1,
      anchor: "landing_pad",
      dev: true,
    },
  ],

  /** The site def for a map id, or undefined. */
  get(id) {
    const all = contentSites.SITES;
    for (let i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return undefined;
  },
};
