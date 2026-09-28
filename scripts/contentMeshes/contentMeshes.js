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
      { asset: "lanternFloor", kind: "mesh" },
      { asset: "militaryCrate", kind: "mesh" },
      { asset: "militaryTurret", kind: "mesh" },
      { asset: "paleWoodCrate", kind: "mesh" },
      { asset: "portal", kind: "mesh" },
      { asset: "prisonBed", kind: "mesh" },
      { asset: "rock", kind: "mesh" },
      { asset: "stand", kind: "mesh" },
      { asset: "torch", kind: "mesh" },
      { asset: "woodenAltar", kind: "mesh" },
      { asset: "woodenBarrel", kind: "mesh" },
      { asset: "woodenBed", kind: "mesh" },
      { asset: "woodenBedSimple", kind: "mesh" },
      { asset: "woodenBin", kind: "mesh" },
      { asset: "woodenCrate", kind: "mesh" },
      { asset: "woodenDoor", kind: "mesh" },
      { asset: "woodenDresserDouble", kind: "mesh" },
      { asset: "woodenDresserSingle", kind: "mesh" },
      { asset: "woodenNightStand", kind: "mesh" },
      { asset: "woodenSign", kind: "mesh" },
      { asset: "woodenStoolRound", kind: "mesh" },
      { asset: "woodenStoolSquare", kind: "mesh" },
      { asset: "woodenTable", kind: "mesh" },
      { asset: "woodenTableCoffee", kind: "mesh" },
      { asset: "woodenTableSmall", kind: "mesh" },
      { asset: "woodenTub", kind: "mesh" },
      { asset: "woodenWorkbench", kind: "mesh" },
    ]);
  },
};
