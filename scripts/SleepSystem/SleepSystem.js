/**
 * Every sleeper rests through the fast-forward, and any press wakes it — ahead of the bodies'
 * drive, so the waking press wakes instead of moving.
 */
globalThis.SleepSystem = {
  update(level) {
    const entities = level.entities;
    const pressed = Input.anyPressed();
    entities.forEach([Asleep], (id, rec) => {
      if (pressed) {
        Sleep.wake(entities, id);
        return;
      }
      Sleep.ramp(entities, rec);
      Sleep.rest(entities, id);
    });
  },
};
