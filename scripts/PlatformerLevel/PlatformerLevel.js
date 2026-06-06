// Level data and builder for the platformer demo.
// Add more entries to PlatformerLevels to extend the game.
//
// Each level: { playerSpawn: {x,y}, platforms: [{x,y,w,h,oneWay?}],
//               enemies: [{x,y}], coins: [{x,y}], goal: {x,y} }
// enemies spawn with their feet at {x, y} (place y on a platform top); coins are
// centred on {x, y}; the goal post stands with its base at {x, y}. A platform
// with oneWay:true is a jump-through ledge — solid only from above (press the
// drop key to fall through; see PlatformerController).

const PLATF_ENEMY_SPEED = 60; // patrol walk speed, px/s

/** @type {{ playerSpawn: {x:number,y:number}, platforms: {x:number,y:number,w:number,h:number}[], enemies: {x:number,y:number}[], coins: {x:number,y:number}[], goal: {x:number,y:number} }[]} */
globalThis.PlatformerLevels = [
  {
    playerSpawn: { x: 80, y: 300 },
    platforms: [
      { x: 0, y: 440, w: 900, h: 32 }, // floor
      { x: 0, y: 360, w: 24, h: 80 }, // left wall — contains floor enemies so patrol is visible
      { x: 876, y: 360, w: 24, h: 80 }, // right wall
      { x: 60, y: 350, w: 160, h: 20, oneWay: true }, // jump-through ledges
      { x: 310, y: 270, w: 160, h: 20, oneWay: true },
      { x: 560, y: 190, w: 160, h: 20, oneWay: true },
      { x: 700, y: 330, w: 160, h: 20, oneWay: true },
    ],
    enemies: [
      { x: 200, y: 440 }, // paces the floor between the walls
      { x: 650, y: 440 },
      { x: 390, y: 270 }, // walks off the ledge, drops to the floor, keeps pacing
    ],
    coins: [
      { x: 140, y: 326 }, // over the first ledge
      { x: 390, y: 246 }, // over the second ledge
      { x: 640, y: 166 }, // over the high ledge
      { x: 780, y: 306 }, // over the fourth ledge
      { x: 450, y: 416 }, // on the floor mid-level
    ],
    goal: { x: 850, y: 440 }, // post at the far right, base on the floor
  },
];

globalThis.PlatformerLevel = {
  /** Spawns all platform and enemy entities for the given level data into world. */
  build(world, data) {
    for (let i = 0; i < data.platforms.length; i++) {
      const p = data.platforms[i];
      const id = world.create();
      world.add(id, Position, { x: p.x, y: p.y, z: 0 });
      world.add(id, BBox, { x: 0, y: 0, width: p.w, height: p.h });
      world.add(id, Collision, {
        solid: true,
        kinematic: true,
        oneWay: p.oneWay ?? false,
        mask: null,
        hits: [],
      });
      world.add(id, Name, { name: "Platform" });
    }

    const enemies = data.enemies ?? [];
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      const id = world.create();
      world.add(id, Position, { x: e.x, y: e.y, z: 0 });
      world.add(id, Velocity, { x: -PLATF_ENEMY_SPEED, y: 0, z: 0 });
      world.add(id, BBox, { x: -12, y: -24, width: 24, height: 24 });
      world.add(id, Collision, {
        solid: true,
        kinematic: false,
        mask: null,
        hits: [],
      });
      world.add(id, Enemy, { dir: -1, speed: PLATF_ENEMY_SPEED });
      world.add(id, Name, { name: "Enemy" });
    }

    // Coins and goal are non-solid sensors: TriggerSystem records the player's
    // overlap with them (CollectibleSystem acts on it); SolidSystem ignores them.
    const coins = data.coins ?? [];
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      const id = world.create();
      world.add(id, Position, { x: c.x, y: c.y, z: 0 });
      world.add(id, BBox, { x: -8, y: -8, width: 16, height: 16 });
      world.add(id, Collision, {
        solid: false,
        kinematic: false,
        mask: null,
        hits: [],
      });
      world.add(id, Coin, {});
      world.add(id, Name, { name: "Coin" });
    }

    if (data.goal !== undefined) {
      const id = world.create();
      world.add(id, Position, { x: data.goal.x, y: data.goal.y, z: 0 });
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
  },
};
