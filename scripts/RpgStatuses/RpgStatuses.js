// RPG status/buff content: the actual Status defs the demo uses. Registered once by
// RpgContent.register() at a scene's create() (NOT at top level — avoids GMRT load-order issues),
// alongside RpgItems/RpgRecipes/RpgPrefabs. The Status SYSTEM is genre-agnostic kit (Gameplay/Status);
// these defs are the content, like RpgItems is to Item. Colors drive the HUD chip tint.
//
// One status per effect kind, each with a real in-game applier (no dead content):
//   encumbered — a maintained DEBUFF whose speed multiplier is driven LIVE by EncumbranceSystem
//                (the weight gradient); the def's `mult` here is only a fallback (always overridden).
//   regen      — a timed HoT buff (granted by the Tonic consumable — RpgItems).
//   fortify    — a timed `mods` buff (+attack/+defense) folded into Stats via StatModel — the
//                recompute path (StatusSystem.onStatsChanged → StatModel.recompute); granted by the
//                Elixir consumable.
// A DoT debuff (poison) is the symmetric counterpart of regen (one line in StatusSystem._applyTick) —
// add it here + an applier (e.g. an enemy on-hit hook) when a damage-over-time source exists.
globalThis.RpgStatuses = {
  register() {
    Status.register([
      {
        id: "encumbered",
        name: "STATUS_ENCUMBERED",
        color: "#c79a5b",
        beneficial: false,
        mult: { speed: 0.5 }, // fallback only — EncumbranceSystem overrides per-instance live
      },
      {
        id: "regen",
        name: "STATUS_REGEN",
        color: "#5fd08a",
        beneficial: true,
        duration: 8,
        hot: 1,
        interval: 1,
      },
      {
        id: "fortify",
        name: "STATUS_FORTIFY",
        color: "#e0b84f",
        beneficial: true,
        duration: 12,
        mods: { attack: 3, defense: 2 },
      },
    ]);
  },
};
