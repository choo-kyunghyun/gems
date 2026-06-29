// Orchestrator: registers all shared RPG content (items, statuses, recipes, prefabs) in one
// idempotent call, sequencing the per-domain modules. Called from a scene's create() (via
// RpgQuests.register), NOT at top level — avoids GMRT load-order issues. Prefabs register before
// any ChunkSource is built (OverworldGen resolves Prefab.byTag in its constructor).
globalThis.RpgContent = {
  registered: false,

  register() {
    if (this.registered) return;
    this.registered = true;
    RpgItems.register(); // rarity tiers + the full item set
    RpgStatuses.register(); // buff/debuff Status defs (encumbered / regen / fortify)
    RpgRecipes.register(); // workbench recipes
    RpgPrefabs.register(); // overworld prefabs (OverworldGen stamps these)

    // Factions + relations: enemies aggro by RELATION (not a hardcoded id), so a third faction is
    // just one register + setRelation here.
    FactionSystem.register([
      { id: "player", name: "Player", color: "#5aa0ff" },
      { id: "monster", name: "Hostiles", color: "#e65a5a" },
    ]);
    FactionSystem.setRelation("player", "monster", "hostile");
  },
};
