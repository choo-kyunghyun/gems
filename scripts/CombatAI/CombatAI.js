// Generic Idle → Chase → Attack state machine for all non-player combatants (enemies + turrets).
// Mobile melee and stationary ranged actors are the same module, differing only by Brain data
// (`mobile`/`ranged`). Targeting is by faction, not a hardcoded id — add a new hostile faction
// and actors fight it with no change here.

// turret reach = bulletSpeed × this ≈ old projectile bullet's 90-tick range
const RPG_SHOT_RANGE_SECS = 1.5;

// per-actor AI memory + tuning; `target` is the chased entity id (-1 = none)
globalThis.Brain = "Brain";
/**
 * @typedef {Object} Brain
 * @property {{x:number,y:number}} home  spawn point a MOBILE actor drifts back to when idle
 * @property {number} target      entity id this actor is chasing/attacking (-1 = none)
 * @property {boolean} mobile     true = chase the target (enemy); false = stationary (turret)
 * @property {boolean} ranged     true = fire a hitscan shot (turret); false = melee contact (enemy)
 * @property {number} aggro       distance at which an idle actor acquires a hostile target
 * @property {number} deAggro     distance at which a chasing (mobile) actor gives up
 * @property {number} attackRange distance at which it stops to attack (= fire range when ranged)
 * @property {number} speed       chase/return move speed (px/s); 0 for a stationary actor
 * @property {number} cdMax       ticks between attacks
 * @property {number} cd          attack cooldown countdown
 * @property {number} bulletSpeed muzzle velocity (px/s) scaling the hitscan reach; 0 for melee
 * @property {number} pathCd      A* replan throttle countdown (ticks) while a chase is wall-blocked
 * @property {number} pathRate    ticks between A* replans during a blocked chase
 */

globalThis.CombatAI = {
  // StateSchema callbacks receive only `id`, so world/level live here as shared statics (one World
  // + one Level per map). Target is per-actor on Brain (round-trips through EntitySnapshot), so
  // captured/restored actors (chunk streaming) keep working without re-attaching.
  _world: undefined,
  _level: undefined, // for grid<->world conversion when pathfinding around walls

  // Attach the AI. `opt` overrides the Brain defaults (a mobile melee enemy); a turret passes
  // { mobile:false, ranged:true, ... }. Damage is the actor's Stats.attack (see _attackPower).
  attach(world, id, level, opt = {}) {
    this._world = world;
    this._level = level;
    const pos = world.get(Position, id);
    // authored/base Visual color captured for the aggro wash (a doll actor's color is its SKIN
    // tint, so the wash must blend FROM it, not from white). Flat int — snapshot-safe.
    const vis = world.get(Visual, id);
    world.add(id, Velocity, { x: 0, y: 0, z: 0 });
    world.add(id, Brain, {
      home: { x: pos.x, y: pos.y },
      baseColor: vis !== undefined ? vis.color : c_white,
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

  // Re-point world/level statics at the active map without re-attaching actors. A resumed map
  // (RpgMap.resume) keeps its actors' Brain/State without calling attach, so without this the
  // statics still point at the last-built map's world and IDLE/CHASE faults. Called per map activate.
  bind(world, level) {
    this._world = world;
    this._level = level;
  },

  // distance to Brain.target; Infinity if none / gone
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

  // aim velocity at (tx, ty) at `speed`, consuming movement points by the terrain underfoot
  // (PathFollow.speedScale — full speed on easy ground, slower on rough, slowest wading)
  _seek(id, tx, ty, speed) {
    const w = this._world;
    const pos = w.get(Position, id);
    const vel = w.get(Velocity, id);
    const dx = tx - pos.x;
    const dy = ty - pos.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const s = speed * PathFollow.speedScale(pos.x, pos.y);
    vel.x = (dx / d) * s;
    vel.y = (dy / d) * s;
  },

  _stop(id) {
    const vel = this._world.get(Velocity, id);
    vel.x = 0;
    vel.y = 0;
  },

  // Per-state aggro cue: a light wash from the actor's BASE color (its skin tint on a doll,
  // authored color otherwise) toward the state color — reads as an angry flush on skin. `k` = 0
  // restores the base exactly (idle). One-shot Color.merge on a state edge is GMRT-safe (only
  // per-frame re-merging drifts — see the packed-color idiom). Turrets keep their color.
  _tint(id, r, g, b, k) {
    const w = this._world;
    const brain = w.get(Brain, id);
    if (brain !== undefined && !brain.mobile) return;
    const vis = w.get(Visual, id);
    if (vis === undefined) return;
    const base =
      brain !== undefined && brain.baseColor !== undefined
        ? brain.baseColor
        : c_white;
    vis.color = k > 0 ? Color.merge(base, make_colour_rgb(r, g, b), k) : base;
  },

  // Drive the optional paper-doll Animator + facing from the actor's motion. A strip actor (rat)
  // carries no Animator — no-op. Facing flips by SIGN only (|xscale| carries the baked size).
  _animate(id, attacking) {
    const w = this._world;
    const anim = w.get(Animator, id);
    if (anim === undefined) return;
    const vel = w.get(Velocity, id);
    let st = "idle";
    if (attacking) st = "attack";
    else if (vel !== undefined && vel.x * vel.x + vel.y * vel.y > 1)
      st = "walk";
    AnimationSystem.set(anim, st);
    const vis = w.get(Visual, id);
    if (vis === undefined || vel === undefined) return;
    if (vel.x < -1) vis.xscale = -Math.abs(vis.xscale);
    else if (vel.x > 1) vis.xscale = Math.abs(vis.xscale);
  },

  IDLE: {
    enter(id) {
      CombatAI._tint(id, 255, 255, 255, 0); // idle: no wash — back to the base/skin color
    },
    update(id) {
      const w = CombatAI._world;
      const brain = w.get(Brain, id);
      const pos = w.get(Position, id);
      // a mobile actor drifts back home if knocked away; a turret just watches
      if (brain.mobile) {
        const dx = brain.home.x - pos.x;
        const dy = brain.home.y - pos.y;
        if (dx * dx + dy * dy > 64)
          CombatAI._seek(id, brain.home.x, brain.home.y, brain.speed * 0.5);
        else CombatAI._stop(id);
      }

      // acquire nearest hostile in aggro range (by faction)
      const t = FactionSystem.nearestHostile(w, id, pos.x, pos.y, brain.aggro);
      if (t !== -1) {
        brain.target = t;
        // mobile actor closes the distance; turret attacks in place
        StateSystem.change(
          w,
          id,
          brain.mobile ? CombatAI.CHASE : CombatAI.ATTACK,
        );
      }
      CombatAI._animate(id, false); // doll actors: idle/walk (drift-home) + facing
    },
  },

  // entered only by mobile actors (a turret goes IDLE → ATTACK directly)
  CHASE: {
    enter(id) {
      CombatAI._tint(id, 230, 170, 70, 0.35); // alert orange flush
    },
    update(id) {
      const w = CombatAI._world;
      const brain = w.get(Brain, id);
      // target killed or streamed out — re-acquire from idle
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

      // LOS: only a wall (kinematic solid) forces an A* detour; a clear shot is a straight seek.
      // Dynamic bodies (target/other actors, hit at t≈1) don't count as blockers.
      const hit = Raycast.cast(w, sp.x, sp.y, tp.x, tp.y, { ignore: id });
      const blocked = hit !== null && w.get(Collision, hit.id).kinematic;
      if (!blocked || CombatAI._level === undefined) {
        PathFollow.clear(w, id);
        brain.pathCd = 0; // replan immediately the next time a wall gets in the way
        CombatAI._seek(id, tp.x, tp.y, brain.speed);
        CombatAI._animate(id, false);
        return;
      }
      // wall in the way: steer at the path walker's movement point (waypoint, or straight while
      // the throttled replan is still resolving)
      const mp = PathFollow.target(
        w,
        CombatAI._level,
        id,
        brain,
        sp,
        tp.x,
        tp.y,
      );
      CombatAI._seek(id, mp.x, mp.y, brain.speed);
      CombatAI._animate(id, false);
    },
    finish(id) {
      PathFollow.clear(CombatAI._world, id);
    },
  },

  ATTACK: {
    enter(id) {
      CombatAI._tint(id, 235, 90, 90, 0.35); // hostile red flush
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

      // cooldown read/written live off the component (no cached primitive — GMRT bool-local clobber)
      if (brain.cd > 0) brain.cd--;
      if (brain.cd <= 0) {
        if (brain.ranged) CombatAI._fireAt(id, brain);
        else CombatAI._hitTarget(id);
        brain.cd = brain.cdMax;
      }

      // out of range: a mobile actor resumes the chase; a turret can't pursue, so it idles to re-acquire
      if (CombatAI._distTo(id) > brain.attackRange)
        StateSystem.change(
          w,
          id,
          brain.mobile ? CombatAI.CHASE : CombatAI.IDLE,
        );
      // punch pose for a short window after each swing (cd counts DOWN from cdMax)
      CombatAI._animate(id, brain.cd > brain.cdMax - 12);
    },
  },

  // outgoing damage for a non-player attacker: its Stats.attack (no weapon), 0 if it has no Stats
  _attackPower(id) {
    const stats = this._world.get(Stats, id);
    return stats !== undefined ? stats.attack : 0;
  },

  // one melee hit on the target through the shared Combat applier (defense + floor via mitigate hook)
  _hitTarget(id) {
    const w = this._world;
    const t = w.get(Brain, id).target;
    if (!w.isValid(t)) return;
    Combat.applyDamage(w, t, CombatAI._attackPower(id));
  },

  // Fire an instant hitscan shot at Brain.target through the shared Combat.hitscan (same as a player
  // gun). hitscan stops at a wall or ally before the target, so no pre-LOS check is needed. A fading
  // tracer shows the shot.
  _fireAt(id, brain) {
    const w = this._world;
    const t = brain.target;
    if (!w.isValid(t)) return;
    const sp = w.get(Position, id);
    const tp = w.get(Position, t);
    const dx = tp.x - sp.x;
    const dy = tp.y - sp.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / d;
    const ny = dy / d;
    // cast along the aim to the muzzle-velocity-scaled reach; owner=id skips self + spares allies
    const range = brain.bulletSpeed * RPG_SHOT_RANGE_SECS;
    const shot = Combat.hitscan(
      w,
      sp.x,
      sp.y,
      sp.x + nx * range,
      sp.y + ny * range,
      {
        owner: id,
        damage: CombatAI._attackPower(id),
      },
    );
    RpgWorldOverlay.pushTracer(sp.x, sp.y, shot.x, shot.y);
  },
};
