// Cold need driver — the warmth rule over the shared Survival core: under `comfort` the meter rises with
// the shortfall (full rate at `span` below), in warmth it recovers. The temperature is the one where the
// body stands — its room's, or the outside's (RoomSystem.tempAt). update() in the tick loop. Takes the
// scene (the map's rooms and their temperatures).
globalThis.ColdSystem = {
  update(scene) {
    const entities = scene.level.entities;
    entities.forEach([Cold, Position], (id, c, pos) => {
      const t = RoomSystem.tempAt(scene, pos.x, pos.y);
      let rate;
      if (t >= c.comfort) rate = -c.recover;
      else {
        let f = (c.comfort - t) / c.span;
        if (f > 1) f = 1;
        rate = c.rate * f;
      }
      Survival.step(entities, id, c, rate);
    });
  },
};
