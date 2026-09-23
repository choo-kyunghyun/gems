/**
 * Registers all shared colony content in one idempotent call — from a scene's create, never at
 * top level, where script load order is not defined. Prefabs register before any level generator
 * is built, since a generator resolves them at construction.
 */
globalThis.content = {
  registered: false,

  register() {
    if (content.registered) return;
    content.registered = true;
    contentItems.register();
    contentStatuses.register();
    contentNeeds.register();
    contentWeather.register();
    contentRecipes.register();
    contentPrefabs.register();
    contentInteractions.register();
    CombatAI.register();
    contentPresets.register();

    // enemies aggro by relation, not id, so a third faction is one register + setRelation here.
    // Building needs an ally owner, so the hub is buildable and a raider camp is not.
    Diplomacy.register([
      { id: "player", name: "Player", color: "#5aa0ff" },
      { id: "monster", name: "Hostiles", color: "#e65a5a" },
      { id: "colony", name: "Colony", color: "#5a86d0" },
    ]);
    Diplomacy.setRelation("player", "monster", "hostile");
    Diplomacy.setRelation("player", "colony", "ally");

    // settlement capabilities: a settlement carries an array of these ids.
    SettlementComponent.register([
      { id: "market", name: "Market", color: "#d0b45a" },
      { id: "depot", name: "Depot", color: "#5a86d0" },
      { id: "farm", name: "Farm", color: "#6fae5a" },
    ]);
  },
};
