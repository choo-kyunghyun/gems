// Level builder for the platformer RPG demo.
// Reads level data produced by LevelSerializer.load (genre "platformer").
//
// Spawn preset strings and their per-instance fields:
//   platform   x,y,w,h  oneWay?:bool
//   enemy      x,y      hp?:number  loot?:[{itemId,qty}]
//   spike      x,y
//   drop       x,y      itemId  qty?    (hand-placed ground loot / chest contents)
//
// meta.playerSpawn {x,y} is returned by build() so the scene can store it.

const PLATF_ENEMY_SPEED = 60; // patrol walk speed, px/s
const PLATF_ENEMY_HP = 3; // default enemy health
// Default loot when an enemy entry omits `loot` — a bit of currency + trash.
const PLATF_DEFAULT_LOOT = [
  { itemId: "coin", qty: 3 },
  { itemId: "slime_gel", qty: 1 },
];

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
        world.add(id, Enemy, { dir: -1, speed: PLATF_ENEMY_SPEED });
        world.add(id, Health, { hp: s.hp ?? PLATF_ENEMY_HP });
        world.add(id, Tag, { tags: new Set(["enemy"]) });
        // Loot table — spilled as ItemDrops on death by the scene. No maxWeight
        // (loot is authored, never weight-gated).
        world.add(id, Inventory, {
          slots: s.loot ?? PLATF_DEFAULT_LOOT,
          capacity: 8,
        });
        world.add(id, Visual, {
          visible: true,
          sprite: spr_choo,
          subimg: 0,
          xscale: 1,
          yscale: 1,
          rot: 0,
          color: make_colour_rgb(220, 110, 90),
          alpha: 1,
          speed: 0,
          time: 0,
        });
        world.add(id, Name, { name: "Enemy" });
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
      } else if (s.preset === "drop") {
        const id = world.create();
        world.add(id, Position, { x: s.x, y: s.y, z: 0 });
        world.add(id, BBox, { x: -8, y: -8, width: 16, height: 16 });
        world.add(id, Collision, {
          solid: false,
          kinematic: false,
          mask: null,
          hits: [],
        });
        world.add(id, ItemDrop, { itemId: s.itemId, qty: s.qty ?? 1 });
        world.add(id, Name, { name: "Drop" });
      }
    }

    return data.meta.playerSpawn;
  },
};
