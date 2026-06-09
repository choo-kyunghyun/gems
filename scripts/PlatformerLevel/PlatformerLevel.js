// Level builder for the platformer demo.
// Reads level data produced by LevelSerializer.load (genre "platformer").
//
// Spawn preset strings and their per-instance fields:
//   platform   x,y,w,h  oneWay?:bool
//   enemy      x,y      stompable?:bool (default true)
//   coin       x,y
//   q_block    x,y
//   brick      x,y
//   spike      x,y
//   checkpoint x,y
//   mushroom   x,y
//   flower     x,y
//   goal       x,y
//
// meta.playerSpawn {x,y} is returned by build() so the scene can store it.

const PLATF_ENEMY_SPEED = 60; // patrol walk speed, px/s

globalThis.PlatformerLevel = {
  /**
   * Spawn all level entities into world from data loaded by LevelSerializer.
   * Returns the player spawn position from data.meta.
   * @param {object} world
   * @param {object} data  — parsed level JSON
   * @returns {{ x: number, y: number }}
   */
  build(world, data) {
    const spawns = data.spawns;
    for (let i = 0; i < spawns.length; i++) {
      const s = spawns[i];
      if (s.preset === "platform") {
        const id = world.create();
        world.add(id, Position, { x: s.x, y: s.y, z: 0 });
        world.add(id, BBox, { x: 0, y: 0, width: s.w, height: s.h });
        world.add(id, Collision, {
          solid: true,
          kinematic: true,
          oneWay: s.oneWay ?? false,
          mask: null,
          hits: [],
        });
        world.add(id, Name, { name: "Platform" });
      } else if (s.preset === "enemy") {
        const stompable = s.stompable ?? true;
        const id = world.create();
        world.add(id, Position, { x: s.x, y: s.y, z: 0 });
        world.add(id, Velocity, { x: -PLATF_ENEMY_SPEED, y: 0, z: 0 });
        world.add(id, BBox, { x: -12, y: -24, width: 24, height: 24 });
        world.add(id, Collision, {
          solid: true,
          kinematic: false,
          mask: null,
          hits: [],
        });
        world.add(id, Enemy, { dir: -1, speed: PLATF_ENEMY_SPEED, stompable });
        world.add(id, Health, { hp: 1 });
        world.add(id, Name, { name: stompable ? "Enemy" : "Armored" });
      } else if (s.preset === "coin") {
        const id = world.create();
        world.add(id, Position, { x: s.x, y: s.y, z: 0 });
        world.add(id, BBox, { x: -8, y: -8, width: 16, height: 16 });
        world.add(id, Collision, {
          solid: false,
          kinematic: false,
          mask: null,
          hits: [],
        });
        world.add(id, Coin, {});
        world.add(id, Name, { name: "Coin" });
      } else if (s.preset === "q_block") {
        const id = world.create();
        world.add(id, Position, { x: s.x, y: s.y, z: 0 });
        world.add(id, BBox, { x: 0, y: 0, width: 32, height: 32 });
        world.add(id, Collision, {
          solid: true,
          kinematic: true,
          oneWay: false,
          mask: null,
          hits: [],
        });
        world.add(id, QBlock, { used: false });
        world.add(id, Name, { name: "?Block" });
      } else if (s.preset === "brick") {
        const id = world.create();
        world.add(id, Position, { x: s.x, y: s.y, z: 0 });
        world.add(id, BBox, { x: 0, y: 0, width: 32, height: 32 });
        world.add(id, Collision, {
          solid: true,
          kinematic: true,
          oneWay: false,
          mask: null,
          hits: [],
        });
        world.add(id, Brick, {});
        world.add(id, Name, { name: "Brick" });
      } else if (s.preset === "spike") {
        const id = world.create();
        world.add(id, Position, { x: s.x, y: s.y, z: 0 });
        world.add(id, BBox, { x: -8, y: -12, width: 16, height: 12 });
        world.add(id, Collision, {
          solid: false,
          kinematic: false,
          mask: null,
          hits: [],
        });
        world.add(id, Spike, {});
        world.add(id, Name, { name: "Spike" });
      } else if (s.preset === "checkpoint") {
        const id = world.create();
        world.add(id, Position, { x: s.x, y: s.y, z: 0 });
        world.add(id, BBox, { x: -8, y: -64, width: 16, height: 64 });
        world.add(id, Collision, {
          solid: false,
          kinematic: false,
          mask: null,
          hits: [],
        });
        world.add(id, Checkpoint, { used: false });
        world.add(id, Name, { name: "Checkpoint" });
      } else if (s.preset === "mushroom") {
        const id = world.create();
        world.add(id, Position, { x: s.x, y: s.y, z: 0 });
        world.add(id, BBox, { x: -8, y: -16, width: 16, height: 16 });
        world.add(id, Collision, {
          solid: false,
          kinematic: false,
          mask: null,
          hits: [],
        });
        world.add(id, Mushroom, {});
        world.add(id, Name, { name: "Mushroom" });
      } else if (s.preset === "flower") {
        const id = world.create();
        world.add(id, Position, { x: s.x, y: s.y, z: 0 });
        world.add(id, BBox, { x: -8, y: -16, width: 16, height: 16 });
        world.add(id, Collision, {
          solid: false,
          kinematic: false,
          mask: null,
          hits: [],
        });
        world.add(id, FireFlower, {});
        world.add(id, Name, { name: "FireFlower" });
      } else if (s.preset === "goal") {
        const id = world.create();
        world.add(id, Position, { x: s.x, y: s.y, z: 0 });
        world.add(id, BBox, { x: -12, y: -96, width: 24, height: 96 });
        world.add(id, Collision, {
          solid: false,
          kinematic: false,
          mask: null,
          hits: [],
        });
        world.add(id, Goal, {});
        world.add(id, Name, { name: "Goal" });
      }
    }

    return data.meta.playerSpawn;
  },
};
