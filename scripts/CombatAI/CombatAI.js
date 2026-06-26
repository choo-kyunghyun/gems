// Combat AI for the RPG: a generic Idle → Chase → Attack state machine (driven by the shared
// StateSystem) for ANY non-player combatant. Mobile melee enemies (enemies) and stationary ranged
// emplacements (turrets) are now the SAME module, differing only by Brain DATA (`mobile` + `ranged`)
// — this replaces the old per-kind split (SlimeAI + a dedicated Turret component + TurretSystem).
// A turret is just an immovable, player-faction actor whose Brain is { mobile:false, ranged:true }
// (see RpgSpawn); it reuses this one targeting/LOS/attack path instead of a parallel copy.
//
// Targeting is by FACTION, not a hardcoded id: an actor carries Faction{...} and acquires the
// nearest HOSTILE attackable body (FactionSystem.nearestHostile) when one enters aggro range. Add
// another hostile faction and these actors fight it too, with no change here.
//
// Mobile actors (enemies) are dynamic solid bodies (Velocity + non-kinematic Collision), so
// SolidSystem integrates the velocity these states set and collides them against the level walls.
// Stationary actors (turrets) are kinematic — they never set velocity, so SolidSystem leaves them
// put; the Velocity attach() adds is inert.
//
// Usage (per actor, at spawn):
//   CombatAI.attach(world, id, level);                                   // enemy (mobile melee)
//   CombatAI.attach(world, id, level, { mobile:false, ranged:true, … }); // turret
// Then run StateSystem each physics tick (it drives the schemas below).

// Per-actor AI memory + tuning. Token co-located with its only consumer. `target` is the
// currently-chased entity id (-1 = none), acquired/dropped per actor — see the statics note.
globalThis.Brain = "Brain";
/**
 * @typedef {Object} Brain
 * @property {{x:number,y:number}} home  spawn point a MOBILE actor drifts back to when idle
 * @property {number} target      entity id this actor is chasing/attacking (-1 = none)
 * @property {boolean} mobile     true = chase the target (enemy); false = stationary (turret)
 * @property {boolean} ranged     true = fire a projectile (turret); false = melee contact (enemy)
 * @property {number} aggro       distance at which an idle actor acquires a hostile target
 * @property {number} deAggro     distance at which a chasing (mobile) actor gives up
 * @property {number} attackRange distance at which it stops to attack (= fire range when ranged)
 * @property {number} speed       chase/return move speed (px/s); 0 for a stationary actor
 * @property {number} cdMax       ticks between attacks
 * @property {number} cd          attack cooldown countdown
 * @property {number} bulletSpeed ranged shot speed (px/s); 0 for melee
 * @property {number} pathCd      A* replan throttle countdown (ticks) while a chase is wall-blocked
 * @property {number} pathRate    ticks between A* replans during a blocked chase
 */

globalThis.CombatAI = {
  // StateSchema callbacks receive only `id`, so world/level live here as shared statics
  // (one World + one Level per map, so they're shared safely). The chase TARGET is per-actor
  // on Brain — acquired by faction, never a shared id — which also lets captured/restored
  // actors (chunk streaming) keep working without re-attaching: world/level are refreshed on
  // every attach, and Brain (incl. target) round-trips through EntitySnapshot.
  _world: undefined,
  _level: undefined, // for grid<->world conversion when pathfinding around walls

  // Attach the AI to an entity. `opt` overrides the Brain defaults; the defaults describe a
  // mobile melee enemy, so a enemy calls attach(world, id, level) bare and a turret passes
  // { mobile:false, ranged:true, attackRange, cdMax, bulletSpeed, aggro, deAggro }. (Damage is NOT
  // here — it's the actor's Stats.attack now; see _attackPower.)
  attach(world, id, level, opt = {}) {
    this._world = world;
    this._level = level;
    const pos = world.get(Position, id);
    world.add(id, Velocity, { x: 0, y: 0, z: 0 });
    world.add(id, Brain, {
      home: { x: pos.x, y: pos.y },
      target: -1,
      mobile: opt.mobile ?? true,
      ranged: opt.ranged ?? false,
      aggro: opt.aggro ?? 80,
      deAggro: opt.deAggro ?? 120,
      attackRange: opt.attackRange ?? 15,
      speed: opt.speed ?? 45,
      cdMax: opt.cdMax ?? 45,
      cd: 0,
      bulletSpeed: opt.bulletSpeed ?? 0,
      pathCd: 0, // replan throttle (ticks) — counts down while a chase is wall-blocked
      pathRate: opt.pathRate ?? 12,
    });
    world.add(id, State, { current: undefined, next: this.IDLE });
  },

  // Re-point the shared world/level statics at the active map WITHOUT re-attaching every actor.
  // attach() sets them too, but a RESUMED map (sceneRpg's map pool — RpgMap.resume) keeps its
  // actors' Brain/State without calling attach again, so these statics would otherwise still point
  // at the last-BUILT map's world → an actor's IDLE/CHASE reads the wrong world and faults. Called
  // on every map activate via RpgMap._activateReset.
  bind(world, level) {
    this._world = world;
    this._level = level;
  },

  // Distance from actor `id` to its current Brain.target; Infinity if it has none / it's gone.
  _distTo(id) {
    const w = this._world;
    const t = w.get(Brain, id).target;
    if (!w.isValid(t)) return Infinity;
    const p = w.get(Position, id);
    const tp = w.get(Position, t);
    const dx = tp.x - p.x;
    const dy = tp.y - p.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  // Point the actor's velocity at (tx, ty) at the given speed.
  _seek(id, tx, ty, speed) {
    const w = this._world;
    const pos = w.get(Position, id);
    const vel = w.get(Velocity, id);
    const dx = tx - pos.x;
    const dy = ty - pos.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    vel.x = (dx / d) * speed;
    vel.y = (dy / d) * speed;
  },

  _stop(id) {
    const vel = this._world.get(Velocity, id);
    vel.x = 0;
    vel.y = 0;
  },

  // Steer along an A* path to the target, replanning on a throttle. The request is resolved by
  // PathfindingSystem later this tick (pipeline: StateSystem → PathfindingSystem) into a
  // PathResponse the actor follows from next tick; until one exists it heads straight. Waypoints
  // are absolute level cells (NavGrid.toPosition) → gridToWorld for the seek.
  _followPath(id, brain, sp, tp) {
    const w = this._world;
    const level = this._level;
    if (brain.pathCd > 0) brain.pathCd--;
    if (brain.pathCd <= 0) {
      const s = level.worldToGrid(sp.x, sp.y);
      const g = level.worldToGrid(tp.x, tp.y);
      w.add(id, PathRequest, {
        startX: s.x,
        startY: s.y,
        goalX: g.x,
        goalY: g.y,
      });
      brain.pathCd = brain.pathRate;
    }
    let wp = PathfindingSystem.current(w, id);
    if (wp === undefined) {
      this._seek(id, tp.x, tp.y, brain.speed); // no path yet — head straight for now
      return;
    }
    // Skip a waypoint we've essentially reached (the path's first cell is our own), then steer.
    let ww = level.gridToWorld(wp.x, wp.y);
    const near = level.cellWidth * 0.4;
    if ((sp.x - ww.x) ** 2 + (sp.y - ww.y) ** 2 < near * near) {
      PathfindingSystem.advance(w, id);
      wp = PathfindingSystem.current(w, id);
      if (wp === undefined) {
        this._seek(id, tp.x, tp.y, brain.speed);
        return;
      }
      ww = level.gridToWorld(wp.x, wp.y);
    }
    this._seek(id, ww.x, ww.y, brain.speed);
  },

  // Drop any path components (when line-of-sight clears mid-chase, or on leaving chase).
  _clearPath(id) {
    const w = this._world;
    if (w.get(PathResponse, id) !== undefined) w.detach(id, PathResponse);
    if (w.get(PathRequest, id) !== undefined) w.detach(id, PathRequest);
  },

  // Per-state aggro cue. Mobile actors are now real flat ART (not debug boxes), so a FULL state-color
  // multiply muddied the authored sprite (a brick-red enemy went murky green at idle). Apply only a
  // light WASH toward the state color (mostly white) so the sprite's own color shows while aggro still
  // reads; white (idle) = no tint. A STATIONARY actor (turret) keeps its authored color.
  _tint(id, r, g, b) {
    const w = this._world;
    const brain = w.get(Brain, id);
    if (brain !== undefined && !brain.mobile) return;
    const vis = w.get(Visual, id);
    if (vis === undefined) return;
    const k = 0.35; // wash strength (0 = authored color, 1 = full state color)
    vis.color = make_colour_rgb(
      Math.round(255 + (r - 255) * k),
      Math.round(255 + (g - 255) * k),
      Math.round(255 + (b - 255) * k),
    );
  },

  IDLE: {
    enter(id) {
      CombatAI._tint(id, 255, 255, 255); // idle: no wash — enemy shows its authored brick-red
    },
    update(id) {
      const w = CombatAI._world;
      const brain = w.get(Brain, id);
      const pos = w.get(Position, id);
      // A mobile actor drifts back home if knocked away; otherwise sits still. A stationary
      // actor (turret) can't move — it just watches.
      if (brain.mobile) {
        const dx = brain.home.x - pos.x;
        const dy = brain.home.y - pos.y;
        if (dx * dx + dy * dy > 64)
          CombatAI._seek(id, brain.home.x, brain.home.y, brain.speed * 0.5);
        else CombatAI._stop(id);
      }

      // Acquire the nearest hostile attackable body in aggro range (by faction, not a fixed id).
      const t = FactionSystem.nearestHostile(w, id, pos.x, pos.y, brain.aggro);
      if (t !== -1) {
        brain.target = t;
        // A mobile actor closes the distance first; a stationary turret attacks in place.
        StateSystem.change(
          w,
          id,
          brain.mobile ? CombatAI.CHASE : CombatAI.ATTACK,
        );
      }
    },
  },

  // Entered only by MOBILE actors (a stationary one goes IDLE → ATTACK directly).
  CHASE: {
    enter(id) {
      CombatAI._tint(id, 230, 170, 70); // alert orange
    },
    update(id) {
      const w = CombatAI._world;
      const brain = w.get(Brain, id);
      // Target killed or streamed out — forget it and re-acquire from idle.
      if (!w.isValid(brain.target)) {
        brain.target = -1;
        StateSystem.change(w, id, CombatAI.IDLE);
        return;
      }
      const dist = CombatAI._distTo(id);
      if (dist > brain.deAggro) {
        brain.target = -1;
        StateSystem.change(w, id, CombatAI.IDLE);
        return;
      }
      if (dist <= brain.attackRange) {
        StateSystem.change(w, id, CombatAI.ATTACK);
        return;
      }
      const sp = w.get(Position, id);
      const tp = w.get(Position, brain.target);

      // Line-of-sight: only a WALL (kinematic solid) between us forces a detour. A clear shot —
      // the common case on the open overworld — is a straight seek (identical to the old behavior);
      // dynamic bodies (the target / other actors, hit at t≈1) don't count as blockers.
      const hit = Raycast.cast(w, sp.x, sp.y, tp.x, tp.y, { ignore: id });
      const blocked = hit !== null && w.get(Collision, hit.id).kinematic;
      if (!blocked || CombatAI._level === undefined) {
        CombatAI._clearPath(id);
        brain.pathCd = 0; // replan immediately the next time a wall gets in the way
        CombatAI._seek(id, tp.x, tp.y, brain.speed);
        return;
      }
      CombatAI._followPath(id, brain, sp, tp);
    },
    finish(id) {
      CombatAI._clearPath(id); // leaving chase tidies any path components
    },
  },

  ATTACK: {
    enter(id) {
      CombatAI._tint(id, 235, 90, 90); // hostile red
      CombatAI._stop(id);
    },
    update(id) {
      const w = CombatAI._world;
      const brain = w.get(Brain, id);
      if (!w.isValid(brain.target)) {
        brain.target = -1;
        StateSystem.change(w, id, CombatAI.IDLE);
        return;
      }
      CombatAI._stop(id);

      // Cooldown read/written live off the component (no cached primitive — see
      // GMRT boolean-local clobber note). A ranged actor fires a bullet; a melee one hits directly.
      if (brain.cd > 0) brain.cd--;
      if (brain.cd <= 0) {
        if (brain.ranged) CombatAI._fireAt(id, brain);
        else CombatAI._hitTarget(id);
        brain.cd = brain.cdMax;
      }

      // Out of attack range: a mobile actor resumes the chase; a stationary one can't pursue, so
      // it drops to idle to re-acquire.
      if (CombatAI._distTo(id) > brain.attackRange)
        StateSystem.change(
          w,
          id,
          brain.mobile ? CombatAI.CHASE : CombatAI.IDLE,
        );
    },
  },

  // Outgoing damage for a non-player attacker: its Stats.attack (a monster has no weapon — its body
  // IS the weapon, so the whole hit is the sheet stat), 0 if it somehow carries no Stats. Mirrors
  // the player's `weapon.damage + Stats.attack` with a zero weapon.
  _attackPower(id) {
    const stats = this._world.get(Stats, id);
    return stats !== undefined ? stats.attack : 0;
  },

  // Apply one MELEE attack to the actor's target through the shared Combat applier (defense + floor
  // via the injected mitigate hook). Damage is the attacker's Stats.attack (was brain.damage).
  _hitTarget(id) {
    const w = this._world;
    const t = w.get(Brain, id).target;
    if (!w.isValid(t)) return;
    Combat.applyDamage(w, t, CombatAI._attackPower(id));
  },

  // Fire a bullet from a stationary RANGED actor (turret) at its Brain.target, reusing the shared
  // "bullet" preset (registered by RpgPlayer.spawn) routed through ProjectileSystem — so a
  // turret-killed enemy spills loot via the same Mortal/death path as a player shot. Skips the
  // shot when a WALL or an ALLY blocks the line (so a covered turret doesn't waste cooldowns).
  // Mirrors the old TurretSystem._fire, now driven by the shared state machine.
  _fireAt(id, brain) {
    const w = this._world;
    const t = brain.target;
    if (!w.isValid(t) || !EntityPreset.has("bullet")) return;
    const sp = w.get(Position, id);
    const tp = w.get(Position, t);
    const hit = Raycast.cast(w, sp.x, sp.y, tp.x, tp.y, { ignore: id });
    if (hit !== null && hit.id !== t) {
      const col = w.get(Collision, hit.id);
      if (col !== undefined && col.kinematic) return; // a wall blocks the shot
      if (FactionSystem.allied(w, id, hit.id)) return; // an ally in the path eats it
    }
    const dx = tp.x - sp.x;
    const dy = tp.y - sp.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const bid = EntityPreset.spawn("bullet", w, sp.x, sp.y);
    const vel = w.get(Velocity, bid);
    vel.x = (dx / d) * brain.bulletSpeed;
    vel.y = (dy / d) * brain.bulletSpeed;
    const proj = w.get(Projectile, bid);
    proj.owner = id; // raycast ignores the shooter + ally check spares player-faction bodies
    proj.damage = CombatAI._attackPower(id); // stat-driven (was brain.damage)
  },
};
