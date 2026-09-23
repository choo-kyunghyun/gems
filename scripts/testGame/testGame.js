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
    // ── spine.speed: a set plays in its authored seconds ──────────────────────────
    // Rig.speed rests on `image_number` being the bound set's length in image
    // frames at the sheet's speed: one pass at rate 1 must take `skeleton_animation_get_duration`
    // seconds, whatever frame rate the rig was exported at.
    {
      id: "spine.speed",
      frames: 1,
      setup(ctx) {
        ctx.inst = instance_create_depth(DOLL_X, DOLL_Y, 0, Puppet);
        ctx.inst.sprite_index = spineHuman;
        ctx.inst.skeleton_animation_set("walk0", true);
      },
      frame(ctx, i) {},
      draw(ctx) {
        ctx.inst.draw_self();
      },
      verify(ctx, t) {
        const inst = ctx.inst;
        const sk = { sprite: spineHuman, anim: "walk0", loop: true, speed: 1 };
        const speed = Rig.speed(inst, sk);
        const pass = inst.image_number / (speed * sprite_get_speed(spineHuman));
        const authored = inst.skeleton_animation_get_duration("walk0");
        t.ok(authored > 0, "walk0 reads no duration");
        t.ok(
          Math.abs(pass - authored) < 0.01,
          "walk0 plays in " + pass + " s where Spine authored " + authored,
        );
      },
      teardown(ctx) {
        instance_destroy(ctx.inst);
      },
    },
    // ── audio.groups: the two audio groups load at boot and carry the category gains ──
    // Only audiogroup_default loads on its own: Audio.init loads audiogroup_sfx and
    // audiogroup_track, and the volume sliders are those groups' gains (a 50 ms ramp on the
    // track's), so a cue plays only from a loaded group and a track lands in its own. The case
    // reads the groups the assets declare through their names — a group id is not `===`-safe.
    // ── puppet.draw: a rigged puppet's mask is the instance's scale, its draw the matrix's ──
    // RenderBillboard draws a puppet at its own x/y under image_xscale = the MASK's scale, undone
    // by the world matrix T(-p)·S·R·T(p) (the colony's dolls are the visual check). Here a doll
    // draws that way beside a plain reference, and the bbox reads the mask.
    {
      id: "puppet.draw",
      frames: 2,
      setup(ctx) {
        const make = (x) => {
          const inst = instance_create_depth(x, DOLL_Y, 0, Puppet);
          inst.sprite_index = spineHuman;
          inst.skeleton_animation_set("idle0", true);
          inst.image_speed = 0;
          return inst;
        };
        ctx.ref = make(DOLL_X - 150);
        ctx.doll = make(DOLL_X + 150);
        ctx.doll.mask_index = pixMaskUnit;
        ctx.doll.image_xscale = 0.5; // a 16 px mask
        ctx.doll.image_yscale = 0.5;
      },
      frame(ctx, i) {},
      draw(ctx) {
        ctx.ref.draw_self();
        const p = ctx.doll;
        matrix_set(
          matrix_world,
          matrix_multiply(
            matrix_build(-p.x, -p.y, 0, 0, 0, 0, 1, 1, 1),
            matrix_build(p.x, p.y, 0, 0, 0, 0, 1 / 0.5, 1 / 0.5, 1),
          ),
        );
        p.draw_self();
        matrix_set(matrix_world, matrix_build_identity());
      },
      verify(ctx, t) {
        const d = ctx.doll;
        t.eq(d.bbox_right - d.bbox_left, 16, "the mask is the instance's scale, not the draw's");
        t.eq(d.bbox_left, DOLL_X + 150 - 8, "the mask is centred on the instance");
      },
      teardown(ctx) {
        instance_destroy(ctx.ref);
        instance_destroy(ctx.doll);
      },
    },
    {
      id: "audio.groups",
      frames: 6, // the 50 ms ramp on the track gain settles within a few frames
      setup(ctx) {
        ctx.sfx = audio_group_get_gain(audiogroup_sfx);
        ctx.track = audio_group_get_gain(audiogroup_track);
        Audio.setSfxGain(0.25);
        Music.setGain(0.5);
        ctx.h = Music.play(musRaid, { fadeMs: 0 });
      },
      verify(ctx, t) {
        t.ok(audio_group_is_loaded(audiogroup_sfx), "audiogroup_sfx not loaded");
        t.ok(audio_group_is_loaded(audiogroup_track), "audiogroup_track not loaded");
        t.eq(
          audio_group_name(audio_sound_get_audio_group(sndButtonClick)),
          "audiogroup_sfx",
          "a cue's group",
        );
        t.eq(
          audio_group_name(audio_sound_get_audio_group(musRaid)),
          "audiogroup_track",
          "a track's group",
        );
        t.near(audio_group_get_gain(audiogroup_sfx), 0.25, 1e-6, "sfx gain");
        t.near(audio_group_get_gain(audiogroup_track), 0.5, 1e-6, "track gain after its ramp");
        t.ok(ctx.h !== -1 && audio_is_playing(ctx.h), "the track plays from its group");
        t.eq(Music.track(), musRaid, "Music.track");
      },
      teardown(ctx) {
        Music.stop(0);
        Audio.setSfxGain(ctx.sfx);
        audio_group_set_gain(audiogroup_track, ctx.track, 0);
      },
    },
    // ── puppet.area: the area collision queries find a Puppet ─────────────────────
    // The runtime's area queries skip an instance whose object has no editor sprite, whatever
    // sprite it is given at runtime (docs/GMRT.md); Puppet carries pixMissing as its editor
    // sprite for that reason, and this case guards it — a puppet sprited the Rig way (a Spine
    // sprite) and one with a plain sprite must both answer the three queries at their bbox.
    {
      id: "puppet.area",
      frames: 2, // the Spine bbox lands after the first draw
      setup(ctx) {
        ctx.doll = instance_create_depth(DOLL_X, DOLL_Y, 0, Puppet);
        ctx.doll.sprite_index = spineHuman;
        ctx.doll.skeleton_animation_set("idle0", true);
        ctx.pix = instance_create_depth(DOLL_X + 200, DOLL_Y, 0, Puppet);
        ctx.pix.sprite_index = pixItemApple;
      },
      frame(ctx, i) {},
      draw(ctx) {
        ctx.doll.draw_self();
        ctx.pix.draw_self();
      },
      verify(ctx, t) {
        // instance-scoped: a collision query needs an instance self (the runner is a struct)
        const probe = (inst, tag) => {
          const l = inst.bbox_left;
          const r = inst.bbox_right;
          const top = inst.bbox_top;
          const bot = inst.bbox_bottom;
          t.ok(r > l && bot > top, tag + " bbox " + l + "," + top + "-" + r + "," + bot);
          const cx = (l + r) / 2;
          const cy = (top + bot) / 2;
          t.ok(instance_exists(inst.collision_point(cx, cy, inst, false, false)), tag + " collision_point");
          t.ok(
            instance_exists(inst.collision_rectangle(cx - 1, cy - 1, cx + 1, cy + 1, inst, false, false)),
            tag + " collision_rectangle",
          );
          t.ok(instance_exists(inst.collision_circle(cx, cy, 2, inst, false, false)), tag + " collision_circle");
          t.ok(
            instance_exists(inst.collision_line(l - 8, cy, r + 8, cy, inst, false, false)),
            tag + " collision_line",
          );
        };
        probe(ctx.doll, "spine");
        probe(ctx.pix, "pix");
      },
      teardown(ctx) {
        instance_destroy(ctx.doll);
        instance_destroy(ctx.pix);
      },
    },
  ],
};
