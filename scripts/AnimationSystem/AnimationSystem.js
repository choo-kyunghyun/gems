// Plays the current Animator state and writes the frame into the entity's Visual.
// The controller/scene chooses the state (e.g. via AnimationSystem.set); this
// system only advances playback. Run once per frame (uses Time.delta — sim time,
// so animation pauses/dilates with the game), after state selection. Requires
// Animator + Visual.
globalThis.AnimationSystem = {
  update(world) {
    for (const id of world.query(Animator, Visual)) {
      const anim = world.get(Animator, id);
      const vis = world.get(Visual, id);
      const st = anim.graph[anim.state];
      if (st === undefined) continue;

      // Clamp to >= 1: GMRT reports 0 frames for SVG sprites (still on 0.20), which
      // would make a non-looping state land on frames-1 = -1 ("negative subimage").
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

      vis.sprite = st.sprite;
      vis.subimg = anim.frame < 0 ? 0 : anim.frame;
    }
  },

  // Switch to a new state, resetting playback only when it actually changes
  // (so holding a direction doesn't restart the walk cycle every frame).
  set(anim, state) {
    if (anim.state === state) return;
    anim.state = state;
    anim.frame = 0;
    anim.time = 0;
  },
};
