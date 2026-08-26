// Combat AI for all non-player combatants (enemies + turrets) — defines the Brain component and
// registers the "combat.*" StateSystem states. System contract on the CombatAI declaration below.

// turret reach = bulletSpeed × this ≈ old projectile bullet's 90-tick range
const SHOT_RANGE_SECS = 1.5;

/**
 * per-actor AI memory + tuning; `target` is the chased entity id (-1 = none).
 * MUST survive a snapshot round-trip, which re-creates the actor under a NEW id (a save restore, a
 * map transfer): so a Brain never
 * stores its OWN id (only `target`, re-acquired anyway), State holds pool-id STRINGS rather than
 * callbacks, and state callbacks receive (entities, id) instead of closing over either.
 */
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
 * @property {number} aggroRate   ticks between idle target-acquisition scans (nearestHostile is O(n))
 * @property {number} aggroCd     acquisition throttle countdown (ticks)
 * @property {number} losRate     ticks between chase LOS raycasts (Raycast.cast is O(colliders))
 * @property {number} losCd       LOS throttle countdown (ticks)
 * @property {boolean} losBlocked cached "a wall blocks the shot" decision between LOS raycasts
 */

/**
 * Registers "combat.idle" / "combat.chase" / "combat.attack" into the StateSystem pool by NAME (not a
 * hardcoded bundle), so an entity kind can compose a different state set (the EntityPreset seam).
 * Mobile melee and stationary ranged actors share the same states, differing only by Brain data
 * (`mobile`/`ranged`). Targeting is by faction, not a hardcoded id — add a hostile faction and actors
 * fight it with no change here.
 */
globalThis.CombatAI = {
  // State callbacks receive (entities, id) from StateSystem, so no store static — only the Level
  // (grid<->world conversion for pathfinding around walls) is per-map context, re-pointed by
  // bind() on each map activate (a resumed map keeps its actors' Brain/State without re-attach).
  _grid: undefined,

  /** Register the combat states into the StateSystem pool (idempotent; called by content). */
  register() {
    StateSystem.register([
      {
        id: "combat.idle",
        update(entities, id) {
          const brain = entities.get(id, Brain);
          const pos = entities.get(id, Position);
          // a mobile actor drifts back home if knocked away; a turret just watches
          if (brain.mobile) {
            const dx = brain.home.x - pos.x;
            const dy = brain.home.y - pos.y;
            if (dx * dx + dy * dy > 256)
              CombatAI._seek(
                entities,
                id,
                brain.home.x,
                brain.home.y,
                brain.speed * 0.5,
              );
            else CombatAI._stop(entities, id);
          }

          // acquire nearest hostile in aggro range (by faction). THROTTLED: nearestHostile scans
          // every combatant (O(n)), so an idle actor rescans only every aggroRate ticks — a ~0.25s
          // acquisition delay is imperceptible, and this is the dominant idle-crowd cost at a wide
          // SIM window (a swarm of idle enemies each scanning every tick).
          if (brain.aggroCd > 0) {
            brain.aggroCd--;
          } else {
            brain.aggroCd = brain.aggroRate;
            const t = FactionSystem.nearestHostile(
              entities,
              id,
              pos.x,
              pos.y,
              brain.aggro,
            );
            if (t !== -1) {
              brain.target = t;
              // mobile actor closes the distance; turret attacks in place
              StateSystem.change(
                entities,
                id,
                brain.mobile ? "combat.chase" : "combat.attack",
              );
            }
          }
          CombatAI._animate(entities, id, false, false); // rigged actors: idle/walk (drift-home) + facing
        },
      },

      // entered only by mobile actors (a turret goes idle → attack directly)
      {
        id: "combat.chase",
        enter(entities, id) {
          entities.get(id, Brain).losCd = 0; // raycast LOS immediately on entering the chase
        },
        update(entities, id) {
          const brain = entities.get(id, Brain);
          // target killed or streamed out — re-acquire from idle
          if (!entities.isValid(brain.target)) {
            brain.target = -1;
            StateSystem.change(entities, id, "combat.idle");
            return;
          }
          const dist = CombatAI._distTo(entities, id);
          if (dist > brain.deAggro) {
            brain.target = -1;
            StateSystem.change(entities, id, "combat.idle");
            return;
          }
          if (dist <= brain.attackRange) {
            StateSystem.change(entities, id, "combat.attack");
            return;
          }
          const sp = entities.get(id, Position);
          const tp = entities.get(brain.target, Position);

          // LOS: only a wall (kinematic solid) forces an A* detour; a clear shot is a straight
          // seek. Dynamic bodies (target/other actors, hit at t≈1) don't count as blockers.
          // THROTTLED: Raycast.cast is O(all colliders); re-cast every losRate ticks and cache the
          // decision (a moving target's occlusion shifts slowly — ~0.13s staleness is imperceptible).
          if (brain.losCd > 0) {
            brain.losCd--;
          } else {
            brain.losCd = brain.losRate;
            const hit = Raycast.cast(entities, sp.x, sp.y, tp.x, tp.y, {
              ignore: id,
            });
            brain.losBlocked =
              hit !== null && entities.get(hit.id, Collision).kinematic;
          }
          const blocked = brain.losBlocked;
          if (!blocked || CombatAI._grid === undefined) {
            PathFollow.clear(entities, id);
            brain.pathCd = 0; // replan immediately the next time a wall gets in the way
            CombatAI._seek(entities, id, tp.x, tp.y, brain.speed);
            CombatAI._animate(entities, id, false, true);
            return;
          }
          // wall in the way: steer at the path walker's movement point (waypoint, or straight
          // while the throttled replan is still resolving)
          const mp = PathFollow.target(
            entities,
            CombatAI._grid,
            id,
            brain,
            sp,
            tp.x,
            tp.y,
          );
          CombatAI._seek(entities, id, mp.x, mp.y, brain.speed);
          CombatAI._animate(entities, id, false, true);
        },
        finish(entities, id) {
          PathFollow.clear(entities, id);
        },
      },

      {
        id: "combat.attack",
        enter(entities, id) {
          CombatAI._stop(entities, id);
        },
        update(entities, id) {
          const brain = entities.get(id, Brain);
          if (!entities.isValid(brain.target)) {
            brain.target = -1;
            StateSystem.change(entities, id, "combat.idle");
            return;
          }
          CombatAI._stop(entities, id);

          // cooldown read/written live off the component (no cached primitive — GMRT bool-local clobber)
          if (brain.cd > 0) brain.cd--;
          if (brain.cd <= 0) {
            if (brain.ranged) CombatAI._fireAt(entities, id, brain);
            else CombatAI._hitTarget(entities, id);
            brain.cd = brain.cdMax;
          }

          // out of range: a mobile actor resumes the chase; a turret can't pursue, so it idles to re-acquire
          if (CombatAI._distTo(entities, id) > brain.attackRange)
            StateSystem.change(
              entities,
              id,
              brain.mobile ? "combat.chase" : "combat.idle",
            );
          // strike pose from the swing (cd just reset to cdMax) until the rig's one-shot attack
          // set has played out — its own length, so a punch and a bite each finish
          CombatAI._animate(
            entities,
            id,
            brain.cd === brain.cdMax || !SkeletonSystem.finished(entities, id),
            false,
          );
        },
      },
    ]);
  },

  // Attach the AI. `opt` overrides the Brain defaults (a mobile melee enemy); a turret passes
  // { mobile:false, ranged:true, ... }. Damage is the actor's Stats.attack (see _attackPower).
  attach(entities, id, grid, opt = {}) {
    this._grid = grid;
    const pos = entities.get(id, Position);
    entities.add(id, Velocity, { x: 0, y: 0, z: 0 });
    entities.add(id, Brain, {
      home: { x: pos.x, y: pos.y },
      target: -1,
      mobile: opt.mobile ?? true,
      ranged: opt.ranged ?? false,
      aggro: opt.aggro ?? 160,
      deAggro: opt.deAggro ?? 240,
      attackRange: opt.attackRange ?? 30,
      speed: opt.speed ?? 90,
      cdMax: opt.cdMax ?? 45,
      cd: 0,
      bulletSpeed: opt.bulletSpeed ?? 0,
      pathCd: 0, // replan throttle (ticks) — counts down while a chase is wall-blocked
      pathRate: opt.pathRate ?? 12,
      // acquisition + LOS throttles: both scans are O(entities/colliders), so idle actors re-scan
      // for targets every aggroRate ticks and chasers re-raycast LOS every losRate ticks. aggroCd is
      // staggered by id so a freshly-streamed crowd doesn't scan all on the same tick (a load spike).
      aggroRate: opt.aggroRate ?? 15,
      aggroCd: id % (opt.aggroRate ?? 15),
      losRate: opt.losRate ?? 8,
      losCd: 0,
      losBlocked: false,
    });
    entities.add(id, State, { current: "", next: "combat.idle" });
  },

  /**
   * Re-point the Level static at the active map without re-attaching actors (a resumed map —
   * ColonyMap.resume — keeps its actors' Brain/State without calling attach). Called per map
   * activate. Takes (entities, grid) for call-site symmetry with PathFollow.bind; only the grid
   * is stored — the store reaches states through the StateSystem callbacks.
   */
  bind(entities, grid) {
    this._grid = grid;
  },

  /**
   * distance to Brain.target; Infinity if none / gone
   */
  _distTo(entities, id) {
    const t = entities.get(id, Brain).target;
    if (!entities.isValid(t)) return Infinity;
    const p = entities.get(id, Position);
    const tp = entities.get(t, Position);
    const dx = tp.x - p.x;
    const dy = tp.y - p.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  /**
   * aim velocity at (tx, ty) at `speed`, consuming movement points by the terrain underfoot
   * (PathFollow.speedScale — full speed on easy ground, slower on rough, slowest wading)
   */
  _seek(entities, id, tx, ty, speed) {
    const pos = entities.get(id, Position);
    const vel = entities.get(id, Velocity);
    const dx = tx - pos.x;
    const dy = ty - pos.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const s = speed * PathFollow.speedScale(pos.x, pos.y);
    vel.x = (dx / d) * s;
    vel.y = (dy / d) * s;
  },

  _stop(entities, id) {
    const vel = entities.get(id, Velocity);
    vel.x = 0;
    vel.y = 0;
  },

  /**
   * Drive the optional rig animation + facing from the actor's motion: `attacking` holds the
   * strike, `running` plays motion as the run set instead of the walk (a chase, not the drift
   * home). An actor without a Skeleton (a turret) no-ops both calls.
   */
  _animate(entities, id, attacking, running) {
    const vel = entities.get(id, Velocity);
    let st = "idle";
    if (attacking) st = "attack";
    else if (vel !== undefined && vel.x * vel.x + vel.y * vel.y > 1)
      st = running ? "run" : "walk";
    ColonyPlayer.setState(entities, id, st);
    if (vel !== undefined) ColonyPlayer.face(entities, id, vel.x);
  },

  /**
   * outgoing damage for a non-player attacker: its Stats.attack (no weapon), 0 if it has no Stats
   */
  _attackPower(entities, id) {
    const stats = entities.get(id, Stats);
    return stats !== undefined ? stats.attack : 0;
  },

  /**
   * one melee hit on the target through the shared Combat applier (defense + floor via mitigate hook)
   */
  _hitTarget(entities, id) {
    const t = entities.get(id, Brain).target;
    if (!entities.isValid(t)) return;
    Combat.applyDamage(entities, t, CombatAI._attackPower(entities, id));
  },

  /**
   * Fire an instant hitscan shot at Brain.target through the shared Combat.hitscan (same as a player
   * gun). hitscan stops at a wall or ally before the target, so no pre-LOS check is needed. A fading
   * tracer shows the shot.
   */
  _fireAt(entities, id, brain) {
    const t = brain.target;
    if (!entities.isValid(t)) return;
    const sp = entities.get(id, Position);
    const tp = entities.get(t, Position);
    const dx = tp.x - sp.x;
    const dy = tp.y - sp.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / d;
    const ny = dy / d;
    // cast along the aim to the muzzle-velocity-scaled reach; owner=id skips self + spares allies
    const range = brain.bulletSpeed * SHOT_RANGE_SECS;
    const shot = Combat.hitscan(
      entities,
      sp.x,
      sp.y,
      sp.x + nx * range,
      sp.y + ny * range,
      {
        owner: id,
        damage: CombatAI._attackPower(entities, id),
      },
    );
    WorldOverlay.pushTracer(sp.x, sp.y, shot.x, shot.y);
  },
};
