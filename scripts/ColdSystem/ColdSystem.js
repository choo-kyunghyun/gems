// Cold need driver: below `comfort` the meter rises with the shortfall, at full rate `span`
// below; in warmth it recovers. The temperature is the one where the body stands.
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
