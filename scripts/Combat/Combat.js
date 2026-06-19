// Shared damage APPLICATION for the combat kit — the one place an incoming hit is mitigated and
// subtracted from a target's Health, so every path lands damage identically: player melee
// (MeleeSystem), player + turret ranged (ProjectileSystem), and monster melee (CombatAI).
//
// The kit stays STAT-AGNOSTIC: the mitigation is an INJECTED hook. `Combat.mitigate(world, targetId,
// amount, penetration) -> finalAmount` defaults to identity (raw subtract — a genre with no defense
// stat); a game overrides it with its own formula. The RPG sets it to
// `max(1, amount - max(0, defense - penetration))` in sceneRpg.create, so defense applies on every
// path and a round's armor penetration bites it. (Same injection pattern as RenderLighting's
// `ambient` — the kit carries the mechanism, the demo carries the stat model.) The ATTACK side
// (weapon base + attacker.Stats.attack) is composed by the Demo callers, since it reads the RPG's
// Stats sheet — see RpgController and CombatAI. `penetration` defaults 0 (melee swings + turrets pass
// nothing); only the player's ammo-driven guns supply it.
//
// Only SUBTRACTS hp — the reaction at <= 0 hp is the Mortal death pass (RpgScene.resolveHealth), so
// melee/ranged/monster kills all share one configurable path.
globalThis.Combat = {
  // Injected per-target mitigation: incoming `amount` -> hp actually removed. Default identity keeps
  // the kit stat-agnostic; a game (the RPG) reassigns this to fold in defense - penetration + a floor.
  // `penetration` defaults 0 so a melee/turret caller that omits it is unaffected.
  mitigate(world, targetId, amount, penetration = 0) {
    return amount;
  },

  // Apply `amount` of incoming damage to `targetId`'s Health, run through `mitigate` (passing the
  // attack's armor `penetration`, default 0). Returns the hp dealt, or 0 if the target carries no
  // Health (e.g. a wall/prop a melee box clipped). Read the mitigate hook off the global so a game's
  // override is always seen.
  applyDamage(world, targetId, amount, penetration = 0) {
    const hp = world.get(Health, targetId);
    if (hp === undefined) return 0;
    const dealt = Combat.mitigate(world, targetId, amount, penetration);
    hp.hp -= dealt;
    return dealt;
  },
};
