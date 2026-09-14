// Game-side cases, handed to sceneTest's runner between testCore and testStress — the same case
// contract, over the Game assets testCore may not touch (it must keep running with Game
// deleted). A case here records what the PINNED runtime does with a Game asset where the doc
// entry (docs/SPINE.md) names a defect and the code carries the workaround: it PASSES on the
// pinned runtime and FLIPS on the one that fixes the defect, so a run on a candidate runtime
// reads the workarounds to retire as `[CHECK] FAIL` lines, each naming its retirement
// (TODO.md → Planned, the runtime upgrade). A flip is a change of runtime, never a regression.

const DOLL_X = 240; // in view, so the puppet draws and the runtime poses it
const DOLL_Y = 360;
const IDLE_SAMPLES = [0, 5, 10]; // `image_index` marks across idle0's 16 image frames

/** worldAngleX of one bone off the puppet's current pose, through a caller-owned map. */
function _testBoneAngle(inst, map, bone) {
  inst.skeleton_bone_state_get(bone, map);
  return ds_map_find_value(map, "worldAngleX");
}

globalThis.testGame = {
  CASES: [
    // ── spine.constraint: a transform constraint moves its bone ──────────────────
    // spineHuman's `footRAngle` binds footR's rotation to legRo's, and idle0 keys footR's
    // translation only: legRo swings with the leg's path as the foot lifts, so an APPLIED
    // constraint turns footR with it and an inert one leaves footR on its setup angle. The
    // runtime poses the rig when the puppet draws, so a sample reads the mark set the frame
    // before.
    {
      id: "spine.constraint",
      frames: IDLE_SAMPLES.length + 1,
      setup(ctx) {
        ctx.inst = instance_create_depth(DOLL_X, DOLL_Y, 0, Puppet);
        ctx.inst.sprite_index = spineHuman;
        ctx.inst.skeleton_animation_set("idle0", true);
        ctx.inst.image_speed = 0;
        ctx.inst.image_index = IDLE_SAMPLES[0];
        ctx.map = ds_map_create();
        ctx.leg = [];
        ctx.foot = [];
      },
      frame(ctx, i) {
        if (i === 0) return; // the pose lands on the first draw
        ctx.leg.push(_testBoneAngle(ctx.inst, ctx.map, "legRo"));
        ctx.foot.push(_testBoneAngle(ctx.inst, ctx.map, "footR"));
        if (i < IDLE_SAMPLES.length) ctx.inst.image_index = IDLE_SAMPLES[i];
      },
      draw(ctx) {
        ctx.inst.draw_self();
      },
      verify(ctx, t) {
        const leg = ctx.leg;
        const foot = ctx.foot;
        t.eq(leg.length, IDLE_SAMPLES.length, "samples");
        let legMoves = false;
        let footMoves = false;
        for (let k = 1; k < leg.length; k++) {
          if (Math.abs(leg[k] - leg[0]) > 0.5) legMoves = true;
          if (Math.abs(foot[k] - foot[0]) > 0.5) footMoves = true;
        }
        // the control: the rig IS posed (legRo turns across idle0), else the reading below is void
        t.ok(
          legMoves,
          "legRo holds one angle across idle0: the rig is not posed " + leg,
        );
        t.ok(
          !footMoves,
          "footR turned with legRo " +
            foot +
            " : the transform constraint applies [#15998] — unbake the foot rotation from the rigs' keys (docs/SPINE.md)",
        );
      },
      teardown(ctx) {
        ds_map_destroy(ctx.map);
        instance_destroy(ctx.inst);
      },
    },
  ],
};
