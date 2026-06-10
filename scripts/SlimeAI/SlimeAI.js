// Slime AI for the TopDown RPG: an Idle → Chase → Attack state machine driven by
// the shared StateSystem. Slimes are dynamic solid bodies (Velocity + non-kinematic
// Collision), so SolidSystem integrates the velocity these states set and collides
// them against the level walls for free.
//
// Usage (per slime, at spawn):
//   SlimeAI.attach(world, slimeId, playerId);
// Then run StateSystem each physics tick (it drives the schemas below). On the
// player's death, the scene respawns it; the slime's target id stays valid.

// Per-slime AI memory + tuning. Token co-located with its only consumer.
globalThis.Brain = "Brain";
/**
 * @typedef {Object} Brain
 * @property {{x:number,y:number}} home  spawn point to drift back to when idle
 * @property {number} aggro       distance at which an idle slime starts chasing
 * @property {number} deAggro     distance at which a chasing slime gives up
 * @property {number} attackRange distance at which it stops to attack
 * @property {number} damage      hp removed per hit (before the target's defense)
 * @property {number} speed       chase/return move speed (px/s)
 * @property {number} cdMax       ticks between attacks
 * @property {number} cd          attack cooldown countdown
 */

globalThis.SlimeAI = {
  // StateSchema callbacks receive only `id`, so world/target live here (single
  // player, so one shared target is enough — move onto Brain for multi-target).
  _world: undefined,
  _target: -1,

  attach(world, id, target) {
    this._world = world;
    this._target = target;
    const pos = world.get(Position, id);
    world.add(id, Velocity, { x: 0, y: 0, z: 0 });
    world.add(id, Brain, {
      home: { x: pos.x, y: pos.y },
      aggro: 160,
      deAggro: 240,
      attackRange: 30,
      damage: 1,
      speed: 90,
      cdMax: 45,
      cd: 0,
    });
    world.add(id, State, { current: undefined, next: this.IDLE });
  },

  // Distance from slime `id` to the player; Infinity if the player is gone.
  _distTo(id) {
    const w = this._world;
    if (!w.isValid(this._target)) return Infinity;
    const p = w.get(Position, id);
    const tp = w.get(Position, this._target);
    const dx = tp.x - p.x;
    const dy = tp.y - p.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  // Point the slime's velocity at (tx, ty) at the given speed.
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

  // Slimes render as colored boxes — tint per state so behavior reads at a glance.
  _tint(id, r, g, b) {
    const vis = this._world.get(Visual, id);
    if (vis !== undefined) vis.color = make_colour_rgb(r, g, b);
  },

  IDLE: {
    enter(id) {
      SlimeAI._tint(id, 120, 220, 130); // calm green
    },
    update(id) {
      const w = SlimeAI._world;
      const brain = w.get(Brain, id);
      const pos = w.get(Position, id);
      const dx = brain.home.x - pos.x;
      const dy = brain.home.y - pos.y;
      // Drift back home if knocked away from it; otherwise sit still.
      if (dx * dx + dy * dy > 64)
        SlimeAI._seek(id, brain.home.x, brain.home.y, brain.speed * 0.5);
      else SlimeAI._stop(id);

      if (SlimeAI._distTo(id) < brain.aggro)
        StateSystem.change(w, id, SlimeAI.CHASE);
    },
  },

  CHASE: {
    enter(id) {
      SlimeAI._tint(id, 230, 170, 70); // alert orange
    },
    update(id) {
      const w = SlimeAI._world;
      const brain = w.get(Brain, id);
      const dist = SlimeAI._distTo(id);
      if (dist > brain.deAggro) {
        StateSystem.change(w, id, SlimeAI.IDLE);
        return;
      }
      if (dist <= brain.attackRange) {
        StateSystem.change(w, id, SlimeAI.ATTACK);
        return;
      }
      const tp = w.get(Position, SlimeAI._target);
      SlimeAI._seek(id, tp.x, tp.y, brain.speed);
    },
  },

  ATTACK: {
    enter(id) {
      SlimeAI._tint(id, 235, 90, 90); // hostile red
      SlimeAI._stop(id);
    },
    update(id) {
      const w = SlimeAI._world;
      const brain = w.get(Brain, id);
      SlimeAI._stop(id);

      // Cooldown read/written live off the component (no cached primitive — see
      // GMRT boolean-local clobber note).
      if (brain.cd > 0) brain.cd--;
      if (brain.cd <= 0) {
        SlimeAI._hitTarget(brain.damage);
        brain.cd = brain.cdMax;
      }

      if (SlimeAI._distTo(id) > brain.attackRange)
        StateSystem.change(w, id, SlimeAI.CHASE);
    },
  },

  // Apply one attack to the player, mitigated by the player's defense (min 1).
  _hitTarget(damage) {
    const w = this._world;
    if (!w.isValid(this._target)) return;
    const hp = w.get(Health, this._target);
    if (hp === undefined) return;
    const stats = w.get(Stats, this._target);
    const def = stats !== undefined ? stats.defense : 0;
    hp.hp -= Math.max(1, damage - def);
  },
};
