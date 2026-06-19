// RPG content registry orchestrator: registers all shared RPG content in one idempotent call —
// the rarity tiers + item set (RpgItems), the workbench recipes (RpgRecipes), and the overworld
// prefabs (RpgPrefabs). Split into those per-domain modules; this just sequences them behind a
// single guarded entry point. Called from a scene's create() (via RpgQuests.register), NOT at top
// level — avoids GMRT load-order issues. Prefabs are registered before any ChunkSource is built
// (OverworldGen resolves Prefab.byTag in its constructor).
globalThis.RpgContent = {
  registered: false,

  register() {
    if (this.registered) return;
    this.registered = true;
    RpgItems.register(); // rarity tiers + the full item set
    RpgStatuses.register(); // buff/debuff Status defs (encumbered / regen / fortify)
    RpgRecipes.register(); // workbench recipes
    RpgPrefabs.register(); // overworld prefabs (OverworldGen stamps these)

    // Factions + relations: the player party vs monsters. Slimes aggro the player by RELATION
    // (FactionSystem.nearestHostile), not a hardcoded id, so adding a third faction here (a
    // bandit clan, town guard, …) and one setRelation is all "more gameplay later" needs.
    FactionSystem.register([
      { id: "player", name: "Player", color: "#5aa0ff" },
      { id: "monster", name: "Monsters", color: "#e65a5a" },
    ]);
    FactionSystem.setRelation("player", "monster", "hostile");
  },
};
