/**
 * The colony's plant species: pure data plus its by-id lookup, with no registration step.
 * A species:
 *   name       i18n key
 *   preset     spawn preset: "tree" (a solid trunk under a canopy) or "plant" (walk-through)
 *   sprite     an upright sprite, one sheet per species, frame = stage
 *   growHours  in-game hours from seedling to ripe at season weight 1
 *   stages     visual steps seedling→ripe (≥ 2); the stage is floor(progress × (stages−1))
 *   season     growth weight per season id; 0 halts growth (and kills a non-`hardy` species);
 *              also weights the spread rolls
 *   hardy?     false = a frost kills it (default true)
 *   ground     ground material ids it roots on, the placement test for generation, spread and
 *              build alike
 *   solidFrom? "tree" only: the stage from which the trunk collides
 *   action     the interaction a ripe plant carries ("harvest" | "chop")
 *   yield      { itemId, qty } the harvest gives
 *   regrow?    progress a perennial falls back to after a harvest; absent = the harvest removes it
 */
globalThis.contentFlora = {
  SPECIES: {
    // the wilderness tree, felled for the build resource
    pine: {
      name: "FLORA_PINE",
      preset: "tree",
      sprite: pixPine,
      growHours: 480,
      stages: 4,
      season: { spring: 1.2, summer: 1, autumn: 0.6, winter: 0.1 },
      ground: ["soil", "richsoil", "grass", "mud", "sand", "gravel", "rocky"],
      solidFrom: 1,
      action: "chop",
      yield: { itemId: "wood", qty: 4 },
    },
    // a perennial shrub, dormant through winter
    berry_bush: {
      name: "FLORA_BERRY_BUSH",
      preset: "plant",
      sprite: pixBerryBush,
      growHours: 96,
      stages: 3,
      season: { spring: 1.5, summer: 1, autumn: 0.7, winter: 0 },
      ground: ["soil", "richsoil", "grass"],
      action: "harvest",
      yield: { itemId: "berries", qty: 3 },
      regrow: 0.5,
    },
    // the farm crop: quick, and the first frost takes it
    wheat: {
      name: "FLORA_WHEAT",
      preset: "plant",
      sprite: pixWheat,
      growHours: 48,
      stages: 3,
      season: { spring: 1.2, summer: 1, autumn: 0.8, winter: 0 },
      hardy: false,
      ground: ["soil", "richsoil"],
      action: "harvest",
      yield: { itemId: "grain", qty: 2 },
    },
  },

  get(id) {
    return contentFlora.SPECIES[id];
  },
};
