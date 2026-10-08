/**
 * The map switch over a world's pool: which pooled level is live is the caller's, and these are
 * the steps that make one live, park it, and free the pool, so the room-global resources a level
 * holds — its collider mirrors and its camera's viewport — follow the live level alone. A level
 * may be freed through its world live or parked: a parked level's mirrors go at the next thaw,
 * which every enter and close runs first.
 */
globalThis.Maps = {
  /** Make the pooled `mapId` live: every other pooled level parks and its view takes viewport 0. */
  enter(world, mapId) {
    const level = world.get(mapId);
    if (level === null) throw new Error(`Maps.enter: map "${mapId}" is not resident`);
    PuppetSystem.thaw();
    const levels = world.levels;
    for (let i = 0; i < levels.length; i++) if (levels[i] !== level) Maps.park(levels[i]);
    CameraSystem.view(level).assign(0);
    return level;
  },

  /** Take a pooled level out of the room: its mirrors leave every query, its view the viewport. */
  park(level) {
    CameraSystem.view(level).release();
    PuppetSystem.park(level);
  },

  /** Free the world and every pooled level with it. */
  close(world) {
    PuppetSystem.thaw();
    world.destroy();
  },
};
