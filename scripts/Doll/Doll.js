/**
 * The on-demand verbs over a colony DOLL — an actor whose body is a Skeleton — the one place a
 * gameplay state becomes an animation name: which set a state means, per rig, plus the facing
 * and stride conventions every doll shares.
 */
globalThis.Doll = {
  /**
   * Actor state -> the animation each rig plays it with, keyed by the Skeleton sprite's name. A
   * state a rig lacks leaves its current set playing. `down` is the fallen pose, a one-shot
   * holding its last frame. `pace` marks a locomotion set: the world speed (px/s) its cycle was
   * authored for, so playback can scale to the doll's actual speed and one set serves every gait.
   */
  RIGS: {
    spineHuman: {
      idle: { anim: "idle0", loop: true },
      walk: { anim: "walk0", loop: true, pace: 110 },
      run: { anim: "run0", loop: true, pace: 45 },
      attack: { anim: "attack0", loop: false },
      kick: { anim: "attack1", loop: false },
      down: { anim: "down0", loop: false },
    },
    spineRat: {
      idle: { anim: "idle", loop: true },
      walk: { anim: "walk", loop: true, pace: 60 },
      run: { anim: "walk", loop: true, pace: 60 },
      attack: { anim: "attack", loop: false },
      down: { anim: "down", loop: false },
    },
  },

  /**
   * The set a rig rests in — the `anim` a Skeleton is authored with at spawn. Throws for a sprite
   * that is no rig: an authoring error, not a runtime state.
   */
  rest(sprite) {
    const rig = Doll.RIGS[sprite_get_name(sprite)];
    if (rig === undefined)
      throw new Error(`Doll: ${sprite_get_name(sprite)} is no rig`);
    return rig.idle.anim;
  },

  /** No-op for an actor with no Skeleton, or whose rig has no such state. */
  setState(entities, id, state) {
    const sk = entities.get(id, Skeleton);
    if (sk === undefined) return;
    const rig = Doll.RIGS[sprite_get_name(sk.sprite)];
    if (rig === undefined) return;
    const st = rig[state];
    if (st === undefined) return;
    Rig.set(entities, id, st.anim, st.loop);
  },

  // pace clamp: a blocked walker still shuffles, a hasted one never blurs
  PACE_MIN: 0.6,
  PACE_MAX: 5,

  /**
   * Stride-match every moving doll's locomotion set to its actual speed, once per frame; any
   * other set plays authored time. A doll without Velocity is never touched.
   */
  pace(entities) {
    entities.forEach([Skeleton, Velocity], (id, sk, vel) => {
      const rig = Doll.RIGS[sprite_get_name(sk.sprite)];
      if (rig === undefined) return;
      let pace = 0;
      for (const state in rig) {
        const st = rig[state];
        if (st.anim === sk.anim) {
          if (st.pace !== undefined) pace = st.pace;
        }
      }
      let r = 1;
      if (pace > 0) {
        const v = Math.sqrt(vel.x * vel.x + vel.y * vel.y) / pace;
        r = Math.min(Math.max(v, Doll.PACE_MIN), Doll.PACE_MAX);
      }
      Rig.rate(entities, id, r);
    });
  },

  /**
   * Face toward `vx`, ignoring anything under `dead`. Sign ONLY — |xscale| carries the baked size
   * factor, so a bare ±1 would silently reset the actor's size.
   */
  face(entities, id, vx, dead) {
    const sk = entities.get(id, Skeleton);
    if (sk === undefined) return;
    const d = dead ?? 1;
    const xscale = sk.xscale;
    if (vx < -d) sk.xscale = -Math.abs(sk.xscale);
    else if (vx > d) sk.xscale = Math.abs(sk.xscale);
    if (sk.xscale !== xscale) Rig.apply(entities, id);
  },
};
