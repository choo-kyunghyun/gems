// hard-coded level data for the platformer showcase (not shared with the editor pipeline).
// build() spawns all entities and returns playerSpawn.
// presets: platform(x,y,w,h,oneWay?), enemy(x,y), spike(x,y)

const PLATF_ENEMY_SPEED = 60; // patrol walk speed, px/s

const PLATFORMER_LEVEL = {
  playerSpawn: { x: 80, y: 300 },
  spawns: [
    { preset: "platform", x: 0, y: 440, w: 900, h: 32 },
    { preset: "platform", x: 0, y: 360, w: 24, h: 80 },
    { preset: "platform", x: 876, y: 360, w: 24, h: 80 },
    { preset: "platform", x: 60, y: 350, w: 160, h: 20, oneWay: true },
    { preset: "platform", x: 310, y: 270, w: 160, h: 20, oneWay: true },
    { preset: "platform", x: 560, y: 190, w: 160, h: 20, oneWay: true },
    { preset: "platform", x: 700, y: 330, w: 160, h: 20, oneWay: true },
    { preset: "enemy", x: 200, y: 440 },
    { preset: "enemy", x: 650, y: 440 },
    { preset: "enemy", x: 390, y: 270 },
    { preset: "enemy", x: 500, y: 440 },
    { preset: "spike", x: 350, y: 440 },
    { preset: "spike", x: 600, y: 440 },
  ],
};

globalThis.PlatformerLevel = {
  /** @param {object} world @returns {{ x: number, y: number }} */
  build(world) {
    const spawns = PLATFORMER_LEVEL.spawns;
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
        world.add(id, Visual, {
          visible: true,
          sprite: spr_choo,
          subimg: 0,
          xscale: 1,
          yscale: 1,
          rot: 0,
          color: make_colour_rgb(95, 110, 125),
          alpha: 1,
          speed: 0,
          time: 0,
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
        world.add(id, Visual, {
          visible: true,
          sprite: spr_choo,
          subimg: 0,
          xscale: 1,
          yscale: 1,
          rot: 0,
          color: make_colour_rgb(200, 65, 65),
          alpha: 1,
          speed: 0,
          time: 0,
        });
        world.add(id, Name, { name: "Spike" });
      }
    }

    return PLATFORMER_LEVEL.playerSpawn;
  },
};
