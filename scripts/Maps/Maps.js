/**
 * The map switch over a world's pool: which pooled level is live is the caller's, and these are
 * the steps that make one live, park it, and free the pool, so the room-global resources a level
 * holds — its collider mirrors and its camera's viewport — follow the live level alone.
 *
 * A level freed while live takes no step here (`world.remove`): its teardown releases its viewport
 * and destroys its mirrors. One freed while parked would leave its mirrors behind (docs/GMRT.md
 * #15364), so a level is never parked on the way to its free, and `close` thaws the pool first.
 */
globalThis.Maps = {
  /** Make the pooled `mapId` live: every other pooled level parks and its view takes viewport 0. */
  enter(world, mapId) {
    const level = world.get(mapId);
    if (level === null) throw new Error(`Maps.enter: map "${mapId}" is not resident`);
    PuppetSystem.thaw();
    const ids = world.ids();
    for (let i = 0; i < ids.length; i++) if (ids[i] !== mapId) Maps.park(world.get(ids[i]));
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
