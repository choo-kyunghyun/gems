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
  // StateSchema callbacks receive only `id`, so world/target/level live here as shared statics
  // (single player, so one shared target is enough — move onto Brain for multi-target). Refreshed
  // on every attach, which is also what lets captured/restored slimes (chunk streaming) keep
  // working without re-attaching — see the chunk-streaming note in ARCHITECTURE.
  _world: undefined,
  _target: -1,
  _level: undefined, // for grid<->world conversion when pathfinding around walls

  attach(world, id, target, level) {
    this._world = world;
    this._target = target;
    this._level = level;
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
      pathCd: 0, // replan throttle (ticks) — counts down while a chase is wall-blocked
      pathRate: 12,
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

  // Steer along an A* path to the player, replanning on a throttle. The request is resolved by
  // PathfindingSystem later this tick (pipeline: StateSystem → PathfindingSystem) into a
  // PathResponse the slime follows from next tick; until one exists it heads straight. Waypoints
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
      const sp = w.get(Position, id);
      const tp = w.get(Position, SlimeAI._target);

      // Line-of-sight: only a WALL (kinematic solid) between us forces a detour. A clear shot —
      // the common case on the open overworld — is a straight seek (identical to the old behavior);
      // dynamic bodies (the player / other slimes, hit at t≈1) don't count as blockers.
      const hit = Raycast.cast(w, sp.x, sp.y, tp.x, tp.y, { ignore: id });
      const blocked = hit !== null && w.get(Collision, hit.id).kinematic;
      if (!blocked || SlimeAI._level === undefined) {
        SlimeAI._clearPath(id);
        brain.pathCd = 0; // replan immediately the next time a wall gets in the way
        SlimeAI._seek(id, tp.x, tp.y, brain.speed);
        return;
      }
      SlimeAI._followPath(id, brain, sp, tp);
    },
    finish(id) {
      SlimeAI._clearPath(id); // leaving chase tidies any path components
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
