/**
 * A new colony: the opening quests, the home map with a fresh player, then its kit and the
 * companion beside it. Seeded in code, not the map file, so a persistent-map reload can't
 * duplicate them; a load restores their records instead.
 */
globalThis.ColonyStart = {
  begin(scene) {
    for (let i = 0; i < contentStart.QUESTS.length; i++) Tracker.accept(contentStart.QUESTS[i]);
    ColonyTravel.go(scene, ColonyLevel.START, "default");
    const entities = scene.level.entities;
    const playerId = scene.playerId;
    const inv = entities.require(playerId, Inventory);
    const kit = contentStart.KIT;
    for (let i = 0; i < kit.length; i++) {
      Bag.add(inv, kit[i].itemId, kit[i].qty);
      if (kit[i].equip === true) Loadout.equipFirst(entities, playerId, kit[i].itemId);
    }
    const c = contentStart.COMPANION;
    const pp = entities.require(playerId, Position);
    ColonySpawn.spawnFollower(entities, pp.x + c.x, pp.y + c.y, c.follower);
  },
};
