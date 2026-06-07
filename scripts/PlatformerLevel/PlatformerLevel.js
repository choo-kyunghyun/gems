// Level data and builder for the platformer demo.
// Add more entries to PlatformerLevels to extend the game.
//
// Each level: { playerSpawn: {x,y}, platforms: [{x,y,w,h,oneWay?}],
//               enemies: [{x,y}], coins: [{x,y}], goal: {x,y},
//               blocks: [{x,y,type:'q'|'brick'}], spikes: [{x,y}],
//               checkpoints: [{x,y}], powerups: [{x,y,type:'mushroom'|'flower'}] }
// enemies spawn with their feet at {x, y} (place y on a platform top); coins are
// centred on {x, y}; the goal post stands with its base at {x, y}. A platform
// with oneWay:true is a jump-through ledge — solid only from above (press the
// drop key to fall through; see PlatformerController).
// blocks are 32×32 solid kinematic obstacles placed with their top-left at {x,y}:
//   type:'q'    → ?-block; awards 1 coin on first hit from below, then inert
//   type:'brick'→ breakable; destroyed on hit from below
// spikes are instant-kill hazard sensors placed with their base at {x, y}
//   (same convention as enemies); overlapping them respawns the player

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
      { x: 500, y: 440, stompable: false }, // armored — stomp hurts; dodge or use fireballs
    ],
    coins: [
      { x: 140, y: 326 }, // over the first ledge
      { x: 390, y: 246 }, // over the second ledge
      { x: 640, y: 166 }, // over the high ledge
      { x: 780, y: 306 }, // over the fourth ledge
      { x: 450, y: 416 }, // on the floor mid-level
    ],
    // 32×32 blocks; top-left anchor. Placed at y=360 so the player can walk under
    // them from the floor (player top when standing = 416 > block bottom 392) and
    // jump into them (block bottom 392 is well within jump reach from y=440).
    blocks: [
      { x: 234, y: 360, type: "q" },      // just right of the first ledge
      { x: 266, y: 360, type: "brick" },
      { x: 298, y: 360, type: "brick" },
      { x: 490, y: 360, type: "q" },      // open floor between ledges 2 and 4
    ],
    goal: { x: 850, y: 440 }, // post at the far right, base on the floor
    spikes: [
      { x: 350, y: 440 }, // floor gap between the block row and the mid-floor area
      { x: 600, y: 440 }, // floor between ledge 3 and ledge 4
      { x: 390, y: 270 }, // on the second ledge — pairs with the enemy that walks here
    ],
    checkpoints: [
      { x: 450, y: 440 }, // mid-level, past the block row; base on the floor
    ],
    powerups: [
      { x: 150, y: 440, type: "mushroom" }, // early mushroom; easy to reach from spawn
      { x: 780, y: 330, type: "flower" },   // fire flower on the fourth ledge (reward for climbing)
    ],
  },

  // Level 2 — The Chasm
  // The floor is split by an 180 px gap. A bridge ledge over the gap lets the
  // player cross, but the landing on the right side is guarded by a spike.
  // Two armored enemies patrol the right floor; kill them with fireballs from
  // the mushroom (near spawn) or the fire flower (right mid ledge).
  {
    playerSpawn: { x: 60, y: 300 },
    platforms: [
      { x: 0, y: 440, w: 320, h: 32 },       // floor left (x 0–320)
      { x: 500, y: 440, w: 400, h: 32 },      // floor right (x 500–900); gap at 320–500
      { x: 0, y: 360, w: 24, h: 80 },         // left wall
      { x: 876, y: 360, w: 24, h: 80 },       // right wall
      { x: 260, y: 370, w: 160, h: 20, oneWay: true }, // bridge over the gap (x 260–420)
      { x: 100, y: 310, w: 120, h: 20, oneWay: true }, // left mid ledge
      { x: 400, y: 250, w: 140, h: 20, oneWay: true }, // centre-high ledge (spans gap)
      { x: 620, y: 180, w: 160, h: 20, oneWay: true }, // right high ledge
      { x: 720, y: 330, w: 150, h: 20, oneWay: true }, // right mid ledge
    ],
    enemies: [
      { x: 180, y: 440 },                    // floor left patrol
      { x: 640, y: 440 },                    // floor right patrol
      { x: 800, y: 440, stompable: false },  // armored floor right — use fireballs
      { x: 460, y: 250 },                    // centre-high ledge patrol
      { x: 700, y: 180 },                    // right high ledge patrol
    ],
    coins: [
      { x: 160, y: 286 }, // above left mid ledge
      { x: 470, y: 226 }, // above centre-high ledge
      { x: 700, y: 156 }, // above right high ledge
      { x: 795, y: 306 }, // above right mid ledge
      { x: 580, y: 416 }, // floor right (near checkpoint)
      { x: 680, y: 416 }, // floor right
    ],
    // Blocks at y=346: bottom at y=378; player top when standing (Big) = y=400,
    // so the player can walk under them and jump into them from the floor below.
    blocks: [
      { x: 220, y: 346, type: "q" },
      { x: 252, y: 346, type: "brick" },
      { x: 560, y: 346, type: "q" },
      { x: 592, y: 346, type: "brick" },
    ],
    spikes: [
      { x: 520, y: 440 }, // right at the landing zone after crossing the chasm
      { x: 780, y: 440 }, // next to the armored enemy on the right floor
    ],
    checkpoints: [
      { x: 600, y: 440 }, // mid-right section, past the first right-floor spike
    ],
    powerups: [
      { x: 100, y: 440, type: "mushroom" }, // near spawn on floor left
      { x: 760, y: 330, type: "flower" },   // fire flower on the right mid ledge
    ],
    goal: { x: 850, y: 440 },
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
      const stompable = e.stompable ?? true;
      world.add(id, Enemy, { dir: -1, speed: PLATF_ENEMY_SPEED, stompable });
      world.add(id, Health, { hp: 1 });
      world.add(id, Name, { name: stompable ? "Enemy" : "Armored" });
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

    const blocks = data.blocks ?? [];
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const id = world.create();
      world.add(id, Position, { x: b.x, y: b.y, z: 0 });
      world.add(id, BBox, { x: 0, y: 0, width: 32, height: 32 });
      world.add(id, Collision, {
        solid: true,
        kinematic: true,
        oneWay: false,
        mask: null,
        hits: [],
      });
      if (b.type === "q") {
        world.add(id, QBlock, { used: false });
        world.add(id, Name, { name: "?Block" });
      } else {
        world.add(id, Brick, {});
        world.add(id, Name, { name: "Brick" });
      }
    }

    const powerups = data.powerups ?? [];
    for (let i = 0; i < powerups.length; i++) {
      const p = powerups[i];
      const id = world.create();
      world.add(id, Position, { x: p.x, y: p.y, z: 0 });
      world.add(id, BBox, { x: -8, y: -16, width: 16, height: 16 });
      world.add(id, Collision, {
        solid: false,
        kinematic: false,
        mask: null,
        hits: [],
      });
      if (p.type === "mushroom") {
        world.add(id, Mushroom, {});
        world.add(id, Name, { name: "Mushroom" });
      } else {
        world.add(id, FireFlower, {});
        world.add(id, Name, { name: "FireFlower" });
      }
    }

    const checkpoints = data.checkpoints ?? [];
    for (let i = 0; i < checkpoints.length; i++) {
      const c = checkpoints[i];
      const id = world.create();
      world.add(id, Position, { x: c.x, y: c.y, z: 0 });
      // Tall flag-pole sensor: 16 wide × 64 tall, base anchored at position
      world.add(id, BBox, { x: -8, y: -64, width: 16, height: 64 });
      world.add(id, Collision, {
        solid: false,
        kinematic: false,
        mask: null,
        hits: [],
      });
      world.add(id, Checkpoint, { used: false });
      world.add(id, Name, { name: "Checkpoint" });
    }

    const spikes = data.spikes ?? [];
    for (let i = 0; i < spikes.length; i++) {
      const s = spikes[i];
      const id = world.create();
      world.add(id, Position, { x: s.x, y: s.y, z: 0 });
      // BBox sits just above the base point (tip of the spike); 16 wide × 12 tall
      // so the player has to clearly walk into it, not just graze the pixel.
      world.add(id, BBox, { x: -8, y: -12, width: 16, height: 12 });
      world.add(id, Collision, {
        solid: false,
        kinematic: false,
        mask: null,
        hits: [],
      });
      world.add(id, Spike, {});
      world.add(id, Name, { name: "Spike" });
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
