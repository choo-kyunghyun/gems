// Level data and builder for the platformer demo.
// Add more entries to PlatformerLevels to extend the game.
//
// Each level: { playerSpawn: {x,y}, platforms: [{x,y,w,h}] }

/** @type {{ playerSpawn: {x:number,y:number}, platforms: {x:number,y:number,w:number,h:number}[] }[]} */
globalThis.PlatformerLevels = [
  {
    playerSpawn: { x: 80, y: 300 },
    platforms: [
      { x: 0,   y: 440, w: 900, h: 32 },
      { x: 60,  y: 350, w: 160, h: 20 },
      { x: 310, y: 270, w: 160, h: 20 },
      { x: 560, y: 190, w: 160, h: 20 },
      { x: 700, y: 330, w: 160, h: 20 },
    ],
  },
];

globalThis.PlatformerLevel = {
  /** Spawns all platform entities for the given level data into world. */
  build(world, data) {
    for (let i = 0; i < data.platforms.length; i++) {
      const p = data.platforms[i];
      const id = world.create();
      world.add(id, Position,  { x: p.x, y: p.y, z: 0 });
      world.add(id, BBox,      { x: 0, y: 0, width: p.w, height: p.h });
      world.add(id, Collision, { solid: true, kinematic: true, mask: null, hits: [] });
      world.add(id, Name,      { name: "Platform" });
    }
  },
};
