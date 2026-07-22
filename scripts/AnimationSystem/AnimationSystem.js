// Advances the current Animator state into the entity's Visual. Run once per frame after state
// selection; uses Time.delta (sim time, so animation pauses/dilates with the game).
globalThis.AnimationSystem = {
  update(entities) {
    for (const id of entities.query(Animator, Visual)) {
      const anim = entities.get(Animator, id);
      const vis = entities.get(Visual, id);
      const st = anim.graph[anim.state];
      if (st === undefined) continue;

      // clamp frames >= 1: GMRT reports 0 frames for SVG sprites (0.20), which would land a
      // non-looping state on frames-1 = -1 (negative subimage).
      const frames = st.frames > 0 ? st.frames : 1;
      const frameDur = st.fps > 0 ? 1 / st.fps : Infinity;
      anim.time += Time.delta;
      while (anim.time >= frameDur) {
        anim.time -= frameDur;
        anim.frame++;
        if (anim.frame >= frames) {
          anim.frame = st.loop ? 0 : frames - 1;
        }
      }

      // a state may swap to a sheet of different declared density (e.g. denser attack frames):
      // refit the draw scale from the DESIGN scale, preserving the facing sign. Legacy Visuals
      // with no `scale` field keep their raw xscale/yscale untouched.
      if (st.sprite !== vis.sprite && vis.scale !== undefined) {
        const k = SpriteMeta.fit(vis.scale, st.sprite);
        vis.xscale = vis.xscale < 0 ? -k : k;
        vis.yscale = k;
      }
      vis.sprite = st.sprite;
      // `start` offsets into a shared strip (unified humanoid sheet); absent = standalone sprite
      vis.subimg = (st.start ?? 0) + (anim.frame < 0 ? 0 : anim.frame);
    }
  },

  // switch state, resetting playback only on an actual change (so holding a key doesn't restart it)
  set(anim, state) {
    if (anim.state === state) return;
    anim.state = state;
    anim.frame = 0;
    anim.time = 0;
  },
};
