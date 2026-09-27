/**
 * Mesh model metadata declarations, registered once and idempotently. A model is keyed by its
 * name, as it is a file, not a resource.
 */
globalThis.contentMeshes = {
  registered: false,

  register() {
    if (contentMeshes.registered) return;
    contentMeshes.registered = true;
    AssetMeta.register([
      // modelled for a 32 px cell under the 128 px one
      { asset: "lanternFloor", kind: "mesh", density: 0.25 },
      { asset: "militaryCrate", kind: "mesh", density: 0.25 },
      { asset: "militaryTurret", kind: "mesh", density: 0.25 },
      { asset: "paleWoodCrate", kind: "mesh", density: 0.25 },
      { asset: "portal", kind: "mesh", density: 0.25 },
      { asset: "prisonBed", kind: "mesh", density: 0.25 },
      { asset: "rock", kind: "mesh", density: 0.25 },
      { asset: "stand", kind: "mesh", density: 0.25 },
      { asset: "torch", kind: "mesh", density: 0.25 },
      { asset: "woodenAltar", kind: "mesh", density: 0.25 },
      { asset: "woodenBarrel", kind: "mesh", density: 0.25 },
      { asset: "woodenBed", kind: "mesh", density: 0.25 },
      { asset: "woodenBedSimple", kind: "mesh", density: 0.25 },
      { asset: "woodenBin", kind: "mesh", density: 0.25 },
      { asset: "woodenCrate", kind: "mesh", density: 0.25 },
      { asset: "woodenDoor", kind: "mesh", density: 0.25 },
      { asset: "woodenDresserDouble", kind: "mesh", density: 0.25 },
      { asset: "woodenDresserSingle", kind: "mesh", density: 0.25 },
      { asset: "woodenNightStand", kind: "mesh", density: 0.25 },
      { asset: "woodenSign", kind: "mesh", density: 0.25 },
      { asset: "woodenStoolRound", kind: "mesh", density: 0.25 },
      { asset: "woodenStoolSquare", kind: "mesh", density: 0.25 },
      { asset: "woodenTable", kind: "mesh", density: 0.25 },
      { asset: "woodenTableCoffee", kind: "mesh", density: 0.25 },
      { asset: "woodenTableSmall", kind: "mesh", density: 0.25 },
      { asset: "woodenTub", kind: "mesh", density: 0.25 },
      { asset: "woodenWorkbench", kind: "mesh", density: 0.25 },
    ]);
  },
};
