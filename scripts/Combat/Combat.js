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

  // INSTANT hitscan shot from (x0,y0) toward (x1,y1) (the max-range endpoint). Walks every solid body
  // along the ray in order (Raycast.castAll): a hostile body with Health takes `amount` damage
  // (mitigated, with `penetration`), and if `pierce` shots remain the ray CONTINUES to the next; a
  // wall/prop (no Health) or an ALLY (FactionSystem.allied to owner) BLOCKS it (a sniper still stops
  // at a wall). `pierce` is the max number of hostiles damaged — default 1, i.e. the old single-hit
  // bullet (a ProjectileSystem bullet despawned on its first impact too). Only SUBTRACTS hp; the
  // reaction at <= 0 hp is the Mortal death pass (RpgScene.resolveHealth), same as every other path.
  // Returns { x, y, hits }: the endpoint the shot reached (for a tracer line) + the struck ids.
  //   opts: { owner, damage, penetration? (default 0), pierce? (default 1) }
  hitscan(world, x0, y0, x1, y1, opts) {
    const owner = opts.owner;
    const pen = opts.penetration ?? 0;
    let remaining = opts.pierce ?? 1;
    const all = Raycast.castAll(world, x0, y0, x1, y1, { ignore: owner });
    const hits = [];
    let endX = x1;
    let endY = y1;
    for (let i = 0; i < all.length; i++) {
      const h = all[i];
      const hp = world.get(Health, h.id);
      if (hp === undefined || FactionSystem.allied(world, owner, h.id)) {
        // a wall/prop (no Health) or an ally blocks the shot — stop at it, no damage.
        endX = h.x;
        endY = h.y;
        break;
      }
      Combat.applyDamage(world, h.id, opts.damage, pen);
      hits.push(h.id);
      remaining--;
      if (remaining <= 0) {
        endX = h.x;
        endY = h.y;
        break;
      }
    }
    return { x: endX, y: endY, hits };
  },
};
