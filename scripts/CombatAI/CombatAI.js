// turret reach in seconds of bullet flight
const SHOT_RANGE_SECS = 1.5;

/**
 * Per-actor AI memory and tuning. It must survive a snapshot round-trip, which re-creates the
 * actor under a new id: a Brain never stores its own id, State holds pool-id strings rather than
 * callbacks, and state callbacks receive the id instead of closing over it.
 */
globalThis.Brain = "Brain";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[Brain] = {
  target: -1,
  mobile: true,
  ranged: false,
  aggro: 160,
  deAggro: 240,
  attackRange: 30,
  speed: 90,
  cdMax: 0.75,
  cd: 0,
  bulletSpeed: 0,
  pathCd: 0,
  pathRate: 0.2,
  aggroRate: 0.25,
  aggroCd: 0,
  losRate: 0.13,
  losCd: 0,
  losBlocked: false,
};
/**
 * @typedef {Object} Brain
 * @property {{x:number,y:number}} home  point a mobile actor drifts back to when idle
 * @property {number} target      chased entity id (-1 = none)
 * @property {boolean} mobile     false = stationary
 * @property {boolean} ranged     true = hitscan shot; false = melee contact
 * @property {number} aggro       distance at which an idle actor acquires a hostile target
 * @property {number} deAggro     distance at which a chasing actor gives up
 * @property {number} attackRange distance at which it stops to attack
 * @property {number} speed       px/s
 * @property {number} cdMax       seconds between attacks
 * @property {number} cd          seconds
 * @property {number} bulletSpeed px/s, scaling the hitscan reach; 0 for melee
 * @property {number} pathCd      seconds
 * @property {number} pathRate    seconds between replans during a wall-blocked chase
 * @property {number} aggroRate   seconds between idle target scans
 * @property {number} aggroCd     seconds
 * @property {number} losRate     seconds between chase LOS casts
 * @property {number} losCd       seconds
 * @property {boolean} losBlocked cached LOS decision between casts
 */

/**
 * Combat AI for every non-player combatant: the Brain component and the "combat.*" states,
 * registered by name so an entity kind can compose a different state set. Mobile melee and
 * stationary ranged actors share the same states, differing only by Brain data. Targeting is by
 * faction — a new hostile faction is fought with no change here.
 */
globalThis.CombatAI = {
  // State callbacks take the level, so no per-map static needs re-pointing on a map activate.

  /** Idempotent. */
  register() {
    StateSystem.register([
      {
        id: "combat.idle",
        update(level, id) {
          const entities = level.entities;
          const brain = entities.get(id, Brain);
          const pos = entities.get(id, Position);
          // a mobile actor drifts back home if knocked away; a turret just watches
          if (brain.mobile) {
            const dx = brain.home.x - pos.x;
            const dy = brain.home.y - pos.y;
            if (dx * dx + dy * dy > 256)
              CombatAI._seek(
                level,
                id,
                brain.home.x,
                brain.home.y,
                brain.speed * 0.5,
              );
            else CombatAI._stop(entities, id);
          }

          // Throttled: the scan is the dominant idle-crowd cost, and a short acquisition delay
          // is imperceptible.
          if (brain.aggroCd > 0) {
            brain.aggroCd -= Time.step;
          } else {
            brain.aggroCd = brain.aggroRate;
            const t = Diplomacy.nearestHostile(
              entities,
              id,
              pos.x,
              pos.y,
              brain.aggro,
            );
            if (t !== -1) {
              brain.target = t;
              StateSystem.change(
                entities,
                id,
                brain.mobile ? "combat.chase" : "combat.attack",
              );
            }
          }
          CombatAI._animate(entities, id, false, false);
        },
      },

      // entered only by mobile actors (a turret goes idle → attack directly)
      {
        id: "combat.chase",
        enter(level, id) {
          level.entities.get(id, Brain).losCd = 0;
        },
        update(level, id) {
          const entities = level.entities;
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

          // Only a wall (a blocking cell or a kinematic solid) forces a path detour; other
          // bodies don't block. The decision is cached between throttled casts — occlusion
          // shifts slowly.
          if (brain.losCd > 0) {
            brain.losCd -= Time.step;
          } else {
            brain.losCd = brain.losRate;
            const hit = Query.cast(level, sp.x, sp.y, tp.x, tp.y, {
              ignore: id,
            });
            brain.losBlocked =
              hit === null
                ? false
                : hit.id === level.self
                  ? true
                  : entities.get(hit.id, Collision).kinematic;
          }
          const blocked = brain.losBlocked;
          if (!blocked || level.grid === null) {
            PathFollow.clear(entities, id);
            brain.pathCd = 0; // replan immediately the next time a wall gets in the way
            CombatAI._seek(level, id, tp.x, tp.y, brain.speed);
            CombatAI._animate(entities, id, false, true);
            return;
          }
          const mp = PathFollow.target(
            entities,
            level.grid,
            id,
            brain,
            sp,
            tp.x,
            tp.y,
          );
          CombatAI._seek(level, id, mp.x, mp.y, brain.speed);
          CombatAI._animate(entities, id, false, true);
        },
        finish(level, id) {
          PathFollow.clear(level.entities, id);
        },
      },

      {
        id: "combat.attack",
        enter(level, id) {
          CombatAI._stop(level.entities, id);
        },
        update(level, id) {
          const entities = level.entities;
          const brain = entities.get(id, Brain);
          if (!entities.isValid(brain.target)) {
            brain.target = -1;
            StateSystem.change(entities, id, "combat.idle");
            return;
          }
          CombatAI._stop(entities, id);

          // read live off the component, never a cached local (docs/GMRT.md)
          if (brain.cd > 0) brain.cd -= Time.step;
          if (brain.cd <= 0) {
            if (brain.ranged) CombatAI._fireAt(level, id, brain);
            else CombatAI._hitTarget(entities, id);
            brain.cd = brain.cdMax;
          }

          if (CombatAI._distTo(entities, id) > brain.attackRange)
            StateSystem.change(
              entities,
              id,
              brain.mobile ? "combat.chase" : "combat.idle",
            );
          // hold the strike until the rig's one-shot attack has played out
          CombatAI._animate(
            entities,
            id,
            brain.cd === brain.cdMax || !Anim.finished(entities, id),
            false,
          );
        },
      },
    ]);
  },

  // `opt` overrides the Brain's blank, which describes a mobile melee enemy.
  attach(entities, id, opt = {}) {
    const pos = entities.get(id, Position);
    entities.add(id, Velocity, {});
    const brain = { ...opt, home: { x: pos.x, y: pos.y } };
    entities.add(id, Brain, brain);
    // staggered by id so a freshly-streamed crowd doesn't scan on one frame
    brain.aggroCd = ((id % 16) / 16) * brain.aggroRate;
    entities.add(id, State, { next: "combat.idle" });
  },

  /** Infinity when the target is gone. */
  _distTo(entities, id) {
    const t = entities.get(id, Brain).target;
    if (!entities.isValid(t)) return Infinity;
    const p = entities.get(id, Position);
    const tp = entities.get(t, Position);
    const dx = tp.x - p.x;
    const dy = tp.y - p.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  /** Aim velocity at (tx, ty), scaled by the terrain underfoot. */
  _seek(level, id, tx, ty, speed) {
    const entities = level.entities;
    const pos = entities.get(id, Position);
    const vel = entities.get(id, Velocity);
    const dx = tx - pos.x;
    const dy = ty - pos.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const s = speed * PathFollow.speedScale(level.grid, pos.x, pos.y);
    vel.x = (dx / d) * s;
    vel.y = (dy / d) * s;
  },

  _stop(entities, id) {
    const vel = entities.get(id, Velocity);
    vel.x = 0;
    vel.y = 0;
  },

  /** Rig animation and facing from the actor's motion; a no-op for an actor without a rig. */
  _animate(entities, id, attacking, running) {
    const vel = entities.get(id, Velocity);
    let st = "idle";
    if (attacking) st = "attack";
    else if (vel !== undefined && vel.x * vel.x + vel.y * vel.y > 1)
      st = running ? "run" : "walk";
    Doll.setState(entities, id, st);
    if (vel !== undefined) Doll.face(entities, id, vel.x);
  },

  /** Outgoing damage for a non-player attacker; 0 without Stats. */
  _attackPower(entities, id) {
    const stats = entities.get(id, Stats);
    return stats !== undefined ? stats.attack : 0;
  },

  _hitTarget(entities, id) {
    const t = entities.get(id, Brain).target;
    if (!entities.isValid(t)) return;
    Combat.applyDamage(entities, t, CombatAI._attackPower(entities, id));
  },

  /** A hitscan shot at the target; it stops at a wall or ally, so no LOS check is needed. */
  _fireAt(level, id, brain) {
    const entities = level.entities;
    const t = brain.target;
    if (!entities.isValid(t)) return;
    const sp = entities.get(id, Position);
    const tp = entities.get(t, Position);
    const dx = tp.x - sp.x;
    const dy = tp.y - sp.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / d;
    const ny = dy / d;
    const range = brain.bulletSpeed * SHOT_RANGE_SECS;
    const shot = Combat.hitscan(
      level,
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
