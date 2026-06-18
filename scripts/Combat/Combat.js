// Shared damage APPLICATION for the combat kit — the one place an incoming hit is mitigated and
// subtracted from a target's Health, so every path lands damage identically: player melee
// (MeleeSystem), player + turret ranged (ProjectileSystem), and monster melee (CombatAI).
//
// The kit stays STAT-AGNOSTIC: the mitigation is an INJECTED hook. `Combat.mitigate(world, targetId,
// amount) -> finalAmount` defaults to identity (raw subtract — a genre with no defense stat); a game
// overrides it with its own formula. The RPG sets it to `max(1, amount - target.Stats.defense)` in
// sceneRpg.create, so defense applies on every path. (Same injection pattern as RenderLighting's
// `ambient` — the kit carries the mechanism, the demo carries the stat model.) The ATTACK side
// (weapon base + attacker.Stats.attack) is composed by the Demo callers, since it reads the RPG's
// Stats sheet — see RpgController and CombatAI.
//
// Only SUBTRACTS hp — the reaction at <= 0 hp is the Mortal death pass (RpgScene.resolveHealth), so
// melee/ranged/monster kills all share one configurable path.
globalThis.Combat = {
  // Injected per-target mitigation: incoming `amount` -> hp actually removed. Default identity keeps
  // the kit stat-agnostic; a game (the RPG) reassigns this to fold in defense + a floor.
  mitigate(world, targetId, amount) {
    return amount;
  },

  // Apply `amount` of incoming damage to `targetId`'s Health, run through `mitigate`. Returns the hp
  // dealt, or 0 if the target carries no Health (e.g. a wall/prop a melee box clipped). Read the
  // mitigate hook off the global so a game's override is always seen.
  applyDamage(world, targetId, amount) {
    const hp = world.get(Health, targetId);
    if (hp === undefined) return 0;
    const dealt = Combat.mitigate(world, targetId, amount);
    hp.hp -= dealt;
    return dealt;
  },
};
