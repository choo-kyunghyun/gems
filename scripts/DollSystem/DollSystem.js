/**
 * Stride-matches every moving doll's locomotion set to its actual speed; any other set plays its
 * `rate`, else authored time. A doll without Velocity is never touched.
 */
globalThis.DollSystem = {
  // pace clamp: a blocked walker still shuffles, a hasted one never blurs
  PACE_MIN: 0.6,
  PACE_MAX: 5,

  update(level) {
    const entities = level.entities;
    entities.forEach([Velocity, Sprite], (id, vel, spr) => {
      const rig = Doll.RIGS[sprite_get_name(spr.sprite)];
      if (rig === undefined) return;
      let pace = 0;
      let r = 1;
      for (const state in rig) {
        const st = rig[state];
        if (st.anim === spr.anim) {
          if (st.pace !== undefined) pace = st.pace;
          if (st.rate !== undefined) r = st.rate;
        }
      }
      if (pace > 0) {
        const v = Math.sqrt(vel.x * vel.x + vel.y * vel.y) / pace;
        r = Math.min(Math.max(v, DollSystem.PACE_MIN), DollSystem.PACE_MAX);
      }
      Anim.rate(entities, id, r);
    });
  },
};
