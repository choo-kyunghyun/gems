// The colony's plant SPECIES — what a tree or crop is: its model, how long it takes to ripen, the
// seasons it grows in, the ground it roots on and what it yields. FloraSystem drives the rules,
// contentBiomes names which species a biome carries (its `flora` pool), and BuildMode plants the
// `plant` ones. Split like contentBiomes so the system file is logic-only.
/**
 * Pure data plus its by-id lookup, no registration step (a plain top-level literal). A species:
 *   name       i18n key (the entity's Name)
 *   preset     the ColonySpawn preset it spawns as — "tree" (a solid trunk under a canopy) or
 *              "plant" (walk-through)
 *   model      vox model NAME (Mesh.model) — one model per species, drawn at a stage scale
 *   growHours  in-game hours from seedling to ripe at season weight 1
 *   stages     visual steps seedling→ripe (≥ 2); the stage is floor(progress × (stages−1))
 *   season     growth weight per WorldClock season id — 0 halts growth (and, on a non-`hardy`
 *              species, kills the plant: the frost); also weights the spread rolls
 *   hardy?     false = a frost kills it (default true)
 *   ground     contentBiomes.MATERIALS ids it roots on — the placement test for generation, spread
 *              and build alike
 *   solidFrom? "tree" only: the stage from which the trunk collides (a seedling is walked over)
 *   action     the InteractAction a ripe plant carries ("harvest" | "chop" — contentInteractions)
 *   yield      { itemId, qty } the harvest gives
 *   regrow?    progress the plant falls back to after a harvest (a perennial); absent = the
 *              harvest removes it (a felled tree, an annual crop)
 */
globalThis.contentFlora = {
  SPECIES: {
    // the wilderness pine — the biome scatter's tree, felled for the build resource
    pine: {
      name: "FLORA_PINE",
      preset: "tree",
      model: "tree_pine",
      growHours: 480,
      stages: 4,
      season: { spring: 1.2, summer: 1, autumn: 0.6, winter: 0.1 },
      ground: ["soil", "richsoil", "grass", "mud", "sand", "gravel", "rocky"],
      solidFrom: 1,
      action: "chop",
      yield: { itemId: "wood", qty: 4 },
    },
    // a perennial shrub — picked over and over, dormant through winter
    berry_bush: {
      name: "FLORA_BERRY_BUSH",
      preset: "plant",
      model: "bush_berry",
      growHours: 96,
      stages: 3,
      season: { spring: 1.5, summer: 1, autumn: 0.7, winter: 0 },
      ground: ["soil", "richsoil", "grass"],
      action: "harvest",
      yield: { itemId: "berries", qty: 3 },
      regrow: 0.5,
    },
    // the farm crop — quick, soil-bound, and the first frost takes it
    wheat: {
      name: "FLORA_WHEAT",
      preset: "plant",
      model: "crop_wheat",
      growHours: 48,
      stages: 3,
      season: { spring: 1.2, summer: 1, autumn: 0.8, winter: 0 },
      hardy: false,
      ground: ["soil", "richsoil"],
      action: "harvest",
      yield: { itemId: "grain", qty: 2 },
    },
  },

  /** the species def for an id, or undefined */
  get(id) {
    return contentFlora.SPECIES[id];
  },
};
