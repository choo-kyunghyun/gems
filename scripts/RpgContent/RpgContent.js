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
    RpgRecipes.register(); // workbench recipes
    RpgPrefabs.register(); // overworld prefabs (OverworldGen stamps these)
  },
};
