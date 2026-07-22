// Orchestrator: registers all shared RPG content (items, statuses, recipes, prefabs) in one
// idempotent call, sequencing the per-domain modules. Called from a level's create() (via
// RpgQuests.register), NOT at top level — avoids GMRT load-order issues. Prefabs register before
// any chunk generator is built (PrefabStamp resolves Prefab.byTag in its constructor).
globalThis.RpgContent = {
  registered: false,

  register() {
    if (this.registered) return;
    this.registered = true;
    RpgItems.register(); // rarity tiers + the full item set
    RpgStatuses.register(); // buff/debuff Status defs (encumbered / regen / fortify)
    RpgRecipes.register(); // workbench recipes
    RpgPrefabs.register(); // overworld prefabs (OverworldGen stamps these)
    RpgInteractions.register(); // InteractAction defs (storage/workbench/claim/arcade/bed + hydrate/feed/buff)
    CombatAI.register(); // named combat states (combat.idle/chase/attack) into the StateSystem pool
    RpgSpawn.register(); // entity archetypes (raider/rat/npc/chest/prop/torch/turret/portal/follower) as EntityPreset defs

    // Factions + relations: enemies aggro by RELATION (not a hardcoded id), so a third faction is
    // just one register + setRelation here. "colony" is the neutral settler faction that owns the
    // hub settlement (neutral to the player by default, so its land isn't player-buildable).
    FactionSystem.register([
      { id: "player", name: "Player", color: "#5aa0ff" },
      { id: "monster", name: "Hostiles", color: "#e65a5a" },
      { id: "colony", name: "Colony", color: "#5a86d0" },
    ]);
    FactionSystem.setRelation("player", "monster", "hostile");

    // Settlement capability defs (the faction-style component layer): a settlement carries a
    // SettlementComponent id array; a system acting on "settlements that have X" layers on later.
    SettlementComponent.register([
      { id: "market", name: "Market", color: "#d0b45a" },
      { id: "depot", name: "Depot", color: "#5a86d0" },
      { id: "farm", name: "Farm", color: "#6fae5a" },
    ]);
  },
};
