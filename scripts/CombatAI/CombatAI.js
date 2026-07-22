// Combat AI for all non-player combatants (enemies + turrets): registers the named states
// "combat.idle" / "combat.chase" / "combat.attack" into the StateSystem pool (register(), called
// by RpgContent.register) and attaches the Brain that tunes them. States are SEPARATE pool
// entries transitioned by NAME, not a hardcoded bundle — an entity kind can compose a different
// state set (the EntityPreset seam). Mobile melee and stationary ranged actors are the same
// states, differing only by Brain data (`mobile`/`ranged`). Targeting is by faction, not a
// hardcoded id — add a new hostile faction and actors fight it with no change here.

// turret reach = bulletSpeed × this ≈ old projectile bullet's 90-tick range
const RPG_SHOT_RANGE_SECS = 1.5;

// per-actor AI memory + tuning; `target` is the chased entity id (-1 = none).
// MUST survive chunk demote/restore, which re-creates the actor under a NEW id: so a Brain never
// stores its OWN id (only `target`, re-acquired anyway), State holds pool-id STRINGS rather than
// callbacks, and state callbacks receive (entities, id) instead of closing over either.
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

globalThis.CombatAI = {
  // State callbacks receive (entities, id) from StateSystem, so no store static — only the Level
  // (grid<->world conversion for pathfinding around walls) is per-map context, re-pointed by
  // bind() on each map activate (a resumed map keeps its actors' Brain/State without re-attach).
  _level: undefined,

  // Register the combat states into the StateSystem pool (idempotent; called by RpgContent).
  register() {
    StateSystem.register([
      {
        id: "combat.idle",
        enter(entities, id) {
          CombatAI._tint(entities, id, 255, 255, 255, 0); // no wash — back to the base/skin color
        },
        update(entities, id) {
          const brain = entities.get(Brain, id);
          const pos = entities.get(Position, id);
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
          CombatAI._animate(entities, id, false); // doll actors: idle/walk (drift-home) + facing
        },
      },

      // entered only by mobile actors (a turret goes idle → attack directly)
      {
        id: "combat.chase",
        enter(entities, id) {
          CombatAI._tint(entities, id, 230, 170, 70, 0.35); // alert orange flush
          entities.get(Brain, id).losCd = 0; // raycast LOS immediately on entering the chase
        },
        update(entities, id) {
          const brain = entities.get(Brain, id);
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
          const sp = entities.get(Position, id);
          const tp = entities.get(Position, brain.target);

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
              hit !== null && entities.get(Collision, hit.id).kinematic;
          }
          const blocked = brain.losBlocked;
          if (!blocked || CombatAI._level === undefined) {
            PathFollow.clear(entities, id);
            brain.pathCd = 0; // replan immediately the next time a wall gets in the way
            CombatAI._seek(entities, id, tp.x, tp.y, brain.speed);
            CombatAI._animate(entities, id, false);
            return;
          }
          // wall in the way: steer at the path walker's movement point (waypoint, or straight
          // while the throttled replan is still resolving)
          const mp = PathFollow.target(
            entities,
            CombatAI._level,
            id,
            brain,
            sp,
            tp.x,
            tp.y,
          );
          CombatAI._seek(entities, id, mp.x, mp.y, brain.speed);
          CombatAI._animate(entities, id, false);
        },
        finish(entities, id) {
          PathFollow.clear(entities, id);
        },
      },

      {
        id: "combat.attack",
        enter(entities, id) {
          CombatAI._tint(entities, id, 235, 90, 90, 0.35); // hostile red flush
          CombatAI._stop(entities, id);
        },
        update(entities, id) {
          const brain = entities.get(Brain, id);
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
          // punch pose for a short window after each swing (cd counts DOWN from cdMax;
          // 18 ticks = the 3-frame punch @ 10fps plays out)
          CombatAI._animate(entities, id, brain.cd > brain.cdMax - 18);
        },
      },
    ]);
  },

  // Attach the AI. `opt` overrides the Brain defaults (a mobile melee enemy); a turret passes
  // { mobile:false, ranged:true, ... }. Damage is the actor's Stats.attack (see _attackPower).
  attach(entities, id, level, opt = {}) {
    this._level = level;
    const pos = entities.get(Position, id);
    // authored/base Visual color captured for the aggro wash (a doll actor's color is its SKIN
    // tint, so the wash must blend FROM it, not from white). Flat int — snapshot-safe.
    const vis = entities.get(Visual, id);
    entities.add(id, Velocity, { x: 0, y: 0, z: 0 });
    entities.add(id, Brain, {
      home: { x: pos.x, y: pos.y },
      baseColor: vis !== undefined ? vis.color : c_white,
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

  // Re-point the Level static at the active map without re-attaching actors (a resumed map —
  // RpgMap.resume — keeps its actors' Brain/State without calling attach). Called per map
  // activate. Takes (entities, level) for call-site symmetry with PathFollow.bind; only the level
  // is stored — the store reaches states through the StateSystem callbacks.
  bind(entities, level) {
    this._level = level;
  },

  // distance to Brain.target; Infinity if none / gone
  _distTo(entities, id) {
    const t = entities.get(Brain, id).target;
    if (!entities.isValid(t)) return Infinity;
    const p = entities.get(Position, id);
    const tp = entities.get(Position, t);
    const dx = tp.x - p.x;
    const dy = tp.y - p.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  // aim velocity at (tx, ty) at `speed`, consuming movement points by the terrain underfoot
  // (PathFollow.speedScale — full speed on easy ground, slower on rough, slowest wading)
  _seek(entities, id, tx, ty, speed) {
    const pos = entities.get(Position, id);
    const vel = entities.get(Velocity, id);
    const dx = tx - pos.x;
    const dy = ty - pos.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const s = speed * PathFollow.speedScale(pos.x, pos.y);
    vel.x = (dx / d) * s;
    vel.y = (dy / d) * s;
  },

  _stop(entities, id) {
    const vel = entities.get(Velocity, id);
    vel.x = 0;
    vel.y = 0;
  },

  // Per-state aggro cue: a light wash from the actor's BASE color (its skin tint on a doll,
  // authored color otherwise) toward the state color — reads as an angry flush on skin. `k` = 0
  // restores the base exactly (idle). One-shot Color.merge on a state edge is GMRT-safe (only
  // per-frame re-merging drifts — see the packed-color idiom). Turrets keep their color.
  _tint(entities, id, r, g, b, k) {
    const brain = entities.get(Brain, id);
    if (brain !== undefined && !brain.mobile) return;
    const vis = entities.get(Visual, id);
    if (vis === undefined) return;
    const base =
      brain !== undefined && brain.baseColor !== undefined
        ? brain.baseColor
        : c_white;
    vis.color = k > 0 ? Color.merge(base, make_colour_rgb(r, g, b), k) : base;
  },

  // Drive the optional paper-doll Animator + facing from the actor's motion. A strip actor (rat)
  // carries no Animator — no-op. Facing flips by SIGN only (|xscale| carries the baked size).
  _animate(entities, id, attacking) {
    const anim = entities.get(Animator, id);
    if (anim === undefined) return;
    const vel = entities.get(Velocity, id);
    let st = "idle";
    if (attacking) st = "attack";
    else if (vel !== undefined && vel.x * vel.x + vel.y * vel.y > 1)
      st = "walk";
    AnimationSystem.set(anim, st);
    const vis = entities.get(Visual, id);
    if (vis === undefined || vel === undefined) return;
    if (vel.x < -1) vis.xscale = -Math.abs(vis.xscale);
    else if (vel.x > 1) vis.xscale = Math.abs(vis.xscale);
  },

  // outgoing damage for a non-player attacker: its Stats.attack (no weapon), 0 if it has no Stats
  _attackPower(entities, id) {
    const stats = entities.get(Stats, id);
    return stats !== undefined ? stats.attack : 0;
  },

  // one melee hit on the target through the shared Combat applier (defense + floor via mitigate hook)
  _hitTarget(entities, id) {
    const t = entities.get(Brain, id).target;
    if (!entities.isValid(t)) return;
    Combat.applyDamage(entities, t, CombatAI._attackPower(entities, id));
  },

  // Fire an instant hitscan shot at Brain.target through the shared Combat.hitscan (same as a player
  // gun). hitscan stops at a wall or ally before the target, so no pre-LOS check is needed. A fading
  // tracer shows the shot.
  _fireAt(entities, id, brain) {
    const t = brain.target;
    if (!entities.isValid(t)) return;
    const sp = entities.get(Position, id);
    const tp = entities.get(Position, t);
    const dx = tp.x - sp.x;
    const dy = tp.y - sp.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / d;
    const ny = dy / d;
    // cast along the aim to the muzzle-velocity-scaled reach; owner=id skips self + spares allies
    const range = brain.bulletSpeed * RPG_SHOT_RANGE_SECS;
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
    RpgWorldOverlay.pushTracer(sp.x, sp.y, shot.x, shot.y);
  },
};
