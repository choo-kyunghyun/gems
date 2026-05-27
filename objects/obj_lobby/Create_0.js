this.colBackground = Color.parse("#2b2b2b");
this.colWall = Color.parse("#555555");
this.colGrid = Color.parse("#333333");

this.camera = new Camera()
  .setProjection(CAMERA_PROJECTION.ORTHO)
  .setSize(1366, 768)
  .setFrom(683, 384, -1)
  .setTo(683, 384, 0)
  .assign(0);

this.world = new World({ cols: 15, rows: 10, cellWidth: 91, cellHeight: 76 });
this.terrain = new Terrain(this.world.cols, this.world.rows);
this.world.addLayer(this.terrain);

const GRASS = new TerrainType({ id: 0, name: "grass", pathCost: 1 });
const WALL = new TerrainType({ id: 1, name: "wall", pathCost: Infinity });

for (let y = 0; y < this.world.rows; y++) {
  for (let x = 0; x < this.world.cols; x++) {
    this.terrain.set(x, y, GRASS);
  }
}

const walls = [
  [3, 2],
  [3, 3],
  [3, 4],
  [3, 5],
  [3, 6],
  [7, 3],
  [8, 3],
  [9, 3],
  [10, 3],
  [6, 6],
  [6, 7],
  [6, 8],
];
for (let i = 0; i < walls.length; i++)
  this.terrain.set(walls[i][0], walls[i][1], WALL);
this.world.syncAll();

const world = this.world;
State.states = {};

State.addState("idle", {
  enter: (id) => {
    let gx,
      gy,
      attempts = 0;
    do {
      gx = Math.floor(Math.random() * world.cols);
      gy = Math.floor(Math.random() * world.rows);
      attempts++;
    } while (world.mpg.get(gx, gy) >= Infinity && attempts < 100);
    if (attempts <= 100) {
      const pos = Position.get(id);
      const gStart = world.worldToGrid(pos.x, pos.y);
      PathRequest.set(id, gStart.x, gStart.y, gx, gy);
    }
  },
  update: (id) => {
    if (PathCursor.current(id) !== undefined) State.change(id, "moving");
  },
});

State.addState("moving", {
  update: (id) => {
    const cell = PathCursor.current(id);
    if (cell === undefined) {
      State.change(id, "idle");
      return;
    }
    const pos = Position.get(id);
    const target = world.gridToWorld(cell.x, cell.y);
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 2) {
      PathCursor.advance(id);
    } else {
      const speed = 3;
      Position.set(
        id,
        pos.x + (dx / dist) * speed,
        pos.y + (dy / dist) * speed,
        0,
      );
    }
  },
});

this.player = Entity.create();
const origin = this.world.gridToWorld(1, 1);
Position.set(this.player, origin.x, origin.y, 0);
Name.set(this.player, "Player");
Hit.set(this.player, 12);
State.set(this.player, "idle");

this.renderer = new Renderer();
this.renderer.insert(new RenderDebugEntity());
