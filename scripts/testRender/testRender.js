// Core/Render and Scene cases: the camera entity (unproject, the follow policy, the fly
// controller) and the draw passes (the silhouette, the batch). Every case here references Core
// only; the case contract is Test's.

Test.register(Test.CHECK, [
  {
    // The camera entity's VIEW: apply derives the frame's basis from the component — the
    // pitched ortho view the follow policy frames swings up out of the ground plane by the
    // tilt and backs the eye off `dist` — and the pitched view's PLANE CHOICE over it:
    // project/unproject invert each other on any world-z plane, and reading one screen point
    // on a raised plane instead of the ground shifts the answer h·tan(pitch) toward the eye —
    // the correction that puts a cursor covering a standing body back onto that body's
    // footprint (View.cursorWorld, sceneColony AIM_H).
    id: "camera.unproject",
    setup(ctx) {
      const p = (42 * Math.PI) / 180; // the colony's shallow end (ColonyView.PITCH_CURVE)
      ctx.pitch = p;
      ctx.level = new Level({ id: "test", capacity: 4 });
      Cameras.create(ctx.level.entities, {
        x: 100,
        y: 200,
        pitch: p,
        dist: 2000,
      });
      CameraSystem.apply(ctx.level); // unassigned: derives the view, applies nothing
      ctx.camera = CameraSystem.view(ctx.level);
      ctx.flatLevel = new Level({ id: "flat", capacity: 4 });
      Cameras.create(ctx.flatLevel.entities); // pitch 0 — top-down
      CameraSystem.apply(ctx.flatLevel);
      ctx.flat = CameraSystem.view(ctx.flatLevel);
    },
    verify(ctx, t) {
      const cam = ctx.camera;
      const p = ctx.pitch;
      t.near(cam.upY, Math.cos(p), 1e-9, "up swings out of the ground plane by the tilt");
      t.near(cam.upZ, Math.sin(p), 1e-9, "up lifts by the tilt");
      t.near(cam.fromY, 200 + Math.sin(p) * 2000, 1e-6, "the eye sits dist south of the look-at");
      t.near(cam.fromZ, -Math.cos(p) * 2000, 1e-6, "the eye sits dist above the ground");
      t.eq(ctx.flat.upY, 1, "a top-down view's up is map north");
      t.eq(ctx.flat.upZ, 0, "and lies in the ground plane");
      const h = 30; // world px up off the ground (up is −z)
      const foot = cam.project(140, 260);
      const g = cam.unproject(foot.x, foot.y);
      t.near(g.x, 140, 0.01, "ground round-trip x");
      t.near(g.y, 260, 0.01, "ground round-trip y");
      const head = cam.project(140, 260, -h);
      t.ok(head.y < foot.y, "a raised point draws further up the screen");
      const r = cam.unproject(head.x, head.y, -h);
      t.near(r.x, 140, 0.01, "raised round-trip x");
      t.near(r.y, 260, 0.01, "raised round-trip y");
      const aim = cam.unproject(foot.x, foot.y, -h);
      t.near(
        aim.y - g.y,
        h * Math.tan(p),
        0.01,
        "the raised plane reads h·tan(pitch) nearer the eye",
      );
      t.eq(aim.x, g.x, "the plane never moves x");
      t.eq(
        ctx.flat.unproject(foot.x, foot.y, -h).y,
        ctx.flat.unproject(foot.x, foot.y).y,
        "a top-down view has no plane to choose",
      );
    },
    teardown(ctx) {
      ctx.level.destroy(); // frees the native view with the cache
      ctx.flatLevel.destroy();
    },
  },
  {
    // The follow policy over the camera entity: the look-at eases onto the CameraFocus carrier
    // (resolved live, never a stored id), pixel-snapped, and clamps so the ground rect never
    // leaves `bounds` — the tilt stretching the N-S reach the clamp measures against; the pitch
    // follows the zoom curve. Input reads idle here, so the zoom holds its target.
    id: "camera.follow",
    setup(ctx) {
      ctx.level = new Level({ id: "test", capacity: 4 });
      const s = ctx.level.entities;
      ctx.body = s.create();
      s.add(ctx.body, Position, { x: 500, y: 500, z: 0 });
      s.add(ctx.body, CameraFocus, {});
      ctx.cam = Cameras.create(s, { x: 0, y: 0, pitch: 0, zoom: 2 });
      s.mint(
        ctx.cam,
        CameraFollow,
        Cameras.follow({
          lerp: 1,
          zoom: 2,
          pitchLo: 42,
          pitchHi: 58,
          zoomLo: 1,
          zoomHi: 3,
          bounds: { x1: 0, y1: 0, x2: 4000, y2: 4000 },
        }),
      );
    },
    verify(ctx, t) {
      const s = ctx.level.entities;
      CameraSystem.update(ctx.level);
      const pos = s.get(ctx.cam, Position);
      const cam = s.get(ctx.cam, Camera);
      t.eq(pos.x, 500, "the look-at lands on the focus (lerp 1)");
      t.eq(pos.y, 500, "the look-at lands on the focus (lerp 1)");
      t.near(cam.pitch, (50 * Math.PI) / 180, 1e-9, "the pitch reads the zoom curve at zoom 2");
      t.eq(cam.projection, CAMERA_PROJECTION.ORTHO, "the follow policy pins ortho");
      // the focus walks past the edge: the clamp holds the view inside the world
      const bp = s.get(ctx.body, Position);
      bp.x = -1000;
      bp.y = -1000;
      CameraSystem.update(ctx.level);
      CameraSystem.apply(ctx.level); // the view record reads the clamped look-at
      const v = CameraSystem.view(ctx.level);
      const r = v.groundRect();
      t.near(r.x1, 0, 1, "the west edge of the ground rect stops at the world's");
      t.near(r.y1, 0, 1, "the north edge of the ground rect stops at the world's");
      t.ok(
        pos.y > v.height / 2,
        "the tilt stretches the N-S reach, so the clamp holds the look-at further in",
      );
      // the focus moves on: resolved live, so a re-minted id is just found again
      s.remove(ctx.body);
      s.flush();
      const again = s.create();
      s.add(again, Position, { x: 2000, y: 2000, z: 0 });
      s.add(again, CameraFocus, {});
      CameraSystem.update(ctx.level);
      t.eq(pos.x, 2000, "the re-minted focus is tracked with no stored id");
      t.eq(pos.y, 2000, "the re-minted focus is tracked with no stored id");
    },
    teardown(ctx) {
      ctx.level.destroy();
    },
  },
  {
    // The fly policy shares the pose with the others: taking over with no input leaves the
    // look-at where it was (the eye is derived from the same angles both ways), it pins the
    // perspective projection, and it overrides the sim-clock follow while attached.
    id: "camera.fly",
    setup(ctx) {
      ctx.level = new Level({ id: "test", capacity: 4 });
      const s = ctx.level.entities;
      const body = s.create();
      s.add(body, Position, { x: 900, y: 900, z: 0 });
      s.add(body, CameraFocus, {});
      ctx.cam = Cameras.create(s, {
        x: 300,
        y: 400,
        pitch: (50 * Math.PI) / 180,
        dist: 2000,
      });
      s.mint(ctx.cam, CameraFollow, Cameras.follow({ lerp: 1, pitch: 50 }));
      s.mint(ctx.cam, CameraFly, Cameras.fly());
    },
    verify(ctx, t) {
      const s = ctx.level.entities;
      const pos = s.get(ctx.cam, Position);
      const cam = s.get(ctx.cam, Camera);
      CameraSystem.update(ctx.level);
      t.eq(pos.x, 300, "the fly override skips the follow policy");
      CameraSystem.apply(ctx.level);
      t.near(pos.x, 300, 1e-6, "an idle fly tick leaves the look-at x");
      t.near(pos.y, 400, 1e-6, "an idle fly tick leaves the look-at y");
      t.near(pos.z, 0, 1e-6, "an idle fly tick leaves the look-at z");
      t.eq(
        cam.projection,
        CAMERA_PROJECTION.PERSPECTIVE_FOV,
        "the fly policy pins the perspective projection",
      );
      s.detach(ctx.cam, CameraFly);
      CameraSystem.update(ctx.level);
      t.eq(pos.x, 900, "handing back, the follow policy resumes on the focus");
      t.eq(cam.projection, CAMERA_PROJECTION.ORTHO, "and pins ortho again");
    },
    teardown(ctx) {
      ctx.level.destroy();
    },
  },
  {
    // SILHOUETTE SPACE, both sources: a drawn body's box stands up, so the world cursor that
    // reaches a given height on it moves with the pitch, while a flat collider's box is the
    // footprint and answers the same under any view. Plus the frontmost rule a pick arbitrates
    // overlapping shapes by. pixMissing is the placeholder Core's own render passes bind, so no
    // Game art is assumed — the case reads the box back and tests the space, not the art.
    id: "render.silhouette",
    setup(ctx) {
      const s = new Table(8);
      ctx.entities = s;
      ctx.body = s.create();
      s.add(ctx.body, Position, { x: 100, y: 100, z: 0 });
      // only the three fields ofInto reads — the draw scale and the sheet
      s.add(ctx.body, Visual, { sprite: pixMissing, xscale: 2, yscale: 2 });
      // two flat colliders whose footprints OVERLAP, so one cursor sits on both
      ctx.near = s.create();
      s.add(ctx.near, Position, { x: 300, y: 310 });
      s.add(ctx.near, BBox, { x: -8, y: -8, width: 16, height: 16 });
      ctx.far = s.create();
      s.add(ctx.far, Position, { x: 300, y: 300 });
      s.add(ctx.far, BBox, { x: -8, y: -8, width: 16, height: 16 });
      ctx.bare = s.create(); // neither sprite nor collider — no shape to see
      s.add(ctx.bare, Position, { x: 500, y: 500 });
    },
    verify(ctx, t) {
      const s = ctx.entities;
      const pos = s.get(ctx.body, Position);
      const box = Silhouette.of(s, ctx.body);
      t.ok(box !== undefined, "a drawn body has a standing box");
      t.ok(box.top > box.bottom && box.right > box.left, "the box is a rect");
      // the ground cursor that lands at (dx, a) on the silhouette — hit()'s own mapping, run
      // backwards, which is what pins the two to one space
      const at = (dx, a, pitch) => ({
        x: pos.x + dx,
        y: pos.y - a / Math.cos(pitch),
      });
      const p = Math.PI / 4;
      const midA = (box.top + box.bottom) / 2;
      const midX = (box.left + box.right) / 2;
      const hit = (c, pitch) =>
        Silhouette.hit(s, ctx.body, pos, c, pitch ?? p);
      t.ok(hit(at(midX, midA, p)), "the box centre hits");
      t.ok(!hit(at(midX, box.top + 1, p)), "a px over the top misses");
      t.ok(!hit(at(midX, box.bottom - 1, p)), "a px under the bottom misses");
      t.ok(!hit(at(box.left - 1, midA, p)), "a px left of the box misses");
      t.ok(!hit(at(box.right + 1, midA, p)), "a px right of the box misses");
      t.ok(hit(at(midX, midA, 0), 0), "the mapping inverts at pitch 0 too");
      // a standing box reaches FURTHER across the ground the steeper the view foreshortens it,
      // so the cursor one px past its flat reach is inside it under the pitched camera
      const past = { x: pos.x + midX, y: pos.y - box.bottom + 1 };
      t.ok(!hit(past, 0), "a px past the flat reach misses at pitch 0");
      t.ok(hit(past, p), "the same cursor is inside the box under the pitch");
      // a flat collider IS its footprint: the same world cursor, any pitch
      const onBox = { x: 300, y: 305 };
      const fpos = s.get(ctx.far, Position);
      t.ok(
        Silhouette.hit(s, ctx.far, fpos, onBox, 0) &&
          Silhouette.hit(s, ctx.far, fpos, onBox, p),
        "a footprint answers the same under any pitch",
      );
      t.ok(
        !Silhouette.hit(s, ctx.far, fpos, { x: 300, y: 291 }, p),
        "a cursor off the footprint misses",
      );
      t.eq(
        Silhouette.hit(s, ctx.bare, s.get(ctx.bare, Position), onBox, p),
        false,
        "an entity with no shape is never hit",
      );
      // both footprints hold the cursor; the pick answers the nearer body (larger world y)
      t.eq(
        Silhouette.pick(s, onBox, p),
        ctx.near,
        "the pick is the frontmost hit",
      );
      t.eq(
        Silhouette.pick(s, onBox, p, { ignore: ctx.near }),
        ctx.far,
        "ignore drops it to the one behind",
      );
      t.eq(
        Silhouette.pick(s, onBox, p, { has: Visual }),
        -1,
        "has joins the query — no drawn body under this cursor",
      );
      t.eq(
        Silhouette.pick(s, { x: 0, y: 0 }, p),
        -1,
        "a cursor on nothing picks nothing",
      );
    },
    teardown(ctx) {
      ctx.entities.destroy();
    },
  },
  {
    // A batch pins its texture page on the first frame read and refuses a frame off another
    // page. Two runtime sprites, each on a page of its own, stand in for a group that overflowed.
    id: "render.batch",
    setup(ctx) {
      const surf = surface_create(8, 8);
      surface_set_target(surf);
      draw_clear_alpha(c_white, 1);
      surface_reset_target();
      ctx.a = sprite_create_from_surface(surf, 0, 0, 8, 8, false, false, 0, 0);
      ctx.b = sprite_create_from_surface(surf, 0, 0, 8, 8, false, false, 0, 0);
      surface_free(surf);
      ctx.batch = new VertexBatch();
      ctx.other = new VertexBatch();
    },
    verify(ctx, t) {
      const b = ctx.batch.begin();
      t.eq(b.page, -1, "a fresh batch is unpinned");
      const uv = b.uvs(ctx.a, 0);
      t.eq(array_length(uv), 8, "uvs is sprite_get_uvs' 8-array");
      t.ok(b.page >= 0, "the first read pins the page");
      const page = b.page;
      b.addFrame(ctx.a, 0, 0, 0, 8, 8);
      t.eq(b.page, page, "a same-page frame keeps the pin");
      t.eq(b.count, 1, "addFrame counts one quad");
      const other = ctx.other.begin();
      other.uvs(ctx.b, 0);
      t.ok(other.page !== page, "two runtime sprites sit on pages of their own");
      let threw = false;
      try {
        b.uvs(ctx.b, 0);
      } catch (e) {
        threw = true;
      }
      t.ok(threw, "a frame off another page throws");
      t.eq(b.page, page, "the refused read leaves the pin");
      t.eq(b.count, 1, "the refused read adds no quad");
      b.end();
      other.end();
    },
    teardown(ctx) {
      ctx.batch.destroy();
      ctx.other.destroy();
      sprite_delete(ctx.a);
      sprite_delete(ctx.b);
    },
  },
]);
