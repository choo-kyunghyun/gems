// Cold need driver — the warmth rule over the shared NeedSystem core: under `comfort` the meter rises with
// the shortfall (full rate at `span` below), in warmth it recovers. The temperature is the one where the
// body stands — its room's, or the outside's (Shelter.tempAt). update() runs in the sim. Takes the
// level (its room mirror and their temperatures).
globalThis.ColdSystem = {
  update(level) {
    const entities = level.entities;
    entities.forEach([Cold, Position], (id, c, pos) => {
      const t = Shelter.tempAt(level, pos.x, pos.y);
      let rate;
      if (t >= c.comfort) rate = -c.recover;
      else {
        let f = (c.comfort - t) / c.span;
        if (f > 1) f = 1;
        rate = c.rate * f;
      }
      Needs.step(entities, id, c, rate);
    });
  },
};
