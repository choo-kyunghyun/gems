// Core/Render, Camera, Scene and UI cases: the camera entity, the draw passes, the live text
// refs and the slot drag. Every case references Core only.

Test.register(Test.CHECK, [
  {
    // The view's basis derives from the component, and project/unproject invert each other on
    // any world-z plane; a raised plane reads h·tan(pitch) nearer the eye — the correction that
    // puts a cursor covering a standing body back onto its footprint.
    id: "camera.unproject",
    setup(ctx) {
      const p = (42 * Math.PI) / 180;
      ctx.pitch = p;
      ctx.level = new Level({ id: "test", capacity: 4 });
      Cameras.create(ctx.level.entities, {
        x: 100,
        y: 200,
        pitch: p,
        dist: 2000,
      });
      CameraSystem.apply(ctx.level); // unassigned, so it derives the view and applies nothing
      ctx.camera = CameraSystem.view(ctx.level);
      ctx.flatLevel = new Level({ id: "flat", capacity: 4 });
      Cameras.create(ctx.flatLevel.entities); // top-down
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
      ctx.level.destroy();
      ctx.flatLevel.destroy();
    },
  },
  {
    // The follow policy: the look-at eases onto the focus carrier, resolved live, and clamps so
    // the ground rect never leaves `bounds`; the pitch follows the zoom curve. Input reads idle
    // here, so the zoom holds its target.
    id: "camera.follow",
    setup(ctx) {
      ctx.level = new Level({ id: "test", capacity: 4 });
      const s = ctx.level.entities;
      ctx.body = s.create();
      s.add(ctx.body, Position, { x: 500, y: 500, z: 0 });
      s.add(ctx.body, CameraFocus, {});
      ctx.cam = Cameras.create(s, { x: 0, y: 0, pitch: 0, zoom: 2 });
      s.add(
        ctx.cam,
        CameraFollow,
        {
          lerp: 1,
          zoomTarget: 2,
          zoomHome: 2,
          pitchLo: 42,
          pitchHi: 58,
          zoomLo: 1,
          zoomHi: 3,
          bounds: { x1: 0, y1: 0, x2: 4000, y2: 4000 },
        },
        { mint: true },
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
      const bp = s.get(ctx.body, Position);
      bp.x = -1000;
      bp.y = -1000;
      CameraSystem.update(ctx.level);
      CameraSystem.apply(ctx.level);
      const v = CameraSystem.view(ctx.level);
      const r = v.groundRect();
      t.near(r.x1, 0, 1, "the west edge of the ground rect stops at the world's");
      t.near(r.y1, 0, 1, "the north edge of the ground rect stops at the world's");
      t.ok(
        pos.y > v.height / 2,
        "the tilt stretches the N-S reach, so the clamp holds the look-at further in",
      );
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
    // The fly policy shares the pose: taking over with no input leaves the look-at where it was,
    // and it overrides the follow policy while attached.
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
      s.add(ctx.cam, CameraFollow, { lerp: 1, pitch: 50 }, { mint: true });
      s.add(ctx.cam, CameraFly, {}, { mint: true });
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
    // A drawn body's box stands up, so the cursor reaching a given height on it moves with the
    // pitch, while a flat collider's box is its footprint under any view; a pick takes the
    // frontmost. The placeholder sprite keeps Game art out: the case tests the space, not the art.
    id: "render.silhouette",
    setup(ctx) {
      const s = new Table(8);
      ctx.entities = s;
      ctx.body = s.create();
      s.add(ctx.body, Position, { x: 100, y: 100, z: 0 });
      s.add(ctx.body, Sprite, { sprite: pixMissing, xscale: 2, yscale: 2 });
      // overlapping footprints, so one cursor sits on both
      ctx.near = s.create();
      s.add(ctx.near, Position, { x: 300, y: 310 });
      s.add(ctx.near, BBox, { x: -8, y: -8, width: 16, height: 16 });
      ctx.far = s.create();
      s.add(ctx.far, Position, { x: 300, y: 300 });
      s.add(ctx.far, BBox, { x: -8, y: -8, width: 16, height: 16 });
      ctx.bare = s.create(); // no shape to see
      s.add(ctx.bare, Position, { x: 500, y: 500 });
    },
    verify(ctx, t) {
      const s = ctx.entities;
      const pos = s.get(ctx.body, Position);
      const box = Silhouette.of(s, ctx.body);
      t.ok(box !== undefined, "a drawn body has a standing box");
      t.ok(box.top > box.bottom && box.right > box.left, "the box is a rect");
      // hit()'s mapping run backwards, which pins the two to one space.
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
      // a foreshortened standing box reaches further across the ground.
      const past = { x: pos.x + midX, y: pos.y - box.bottom + 1 };
      t.ok(!hit(past, 0), "a px past the flat reach misses at pitch 0");
      t.ok(hit(past, p), "the same cursor is inside the box under the pitch");
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
      // the frontmost is the larger world y.
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
        Silhouette.pick(s, onBox, p, { has: Sprite }),
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
  {
    // A tile pass rebakes on the draw after its layer's `edits` moves, and only then: an edit
    // needs no call into the pass. The level is one chunk, so a bake is the whole layer.
    id: "render.rebake",
    frames: 4,
    setup(ctx) {
      Object.assign(ctx, Test.level(4, 4));
      const surf = surface_create(8, 8);
      ctx.spr = sprite_create_from_surface(surf, 0, 0, 8, 8, false, false, 0, 0);
      surface_free(surf);
      ctx.type = new TileType({ id: 1, pathCost: 1 });
      ctx.pass = new RenderTileMap(ctx.layer, ctx.grid, ctx.spr);
      const bake = ctx.pass._bake.bind(ctx.pass);
      ctx.bakes = 0;
      ctx.pass._bake = (k) => {
        ctx.bakes++;
        bake(k);
      };
      ctx.seen = [];
    },
    frame(ctx, i) {
      if (i === 1) ctx.layer.set(1, 1, ctx.type);
    },
    draw(ctx) {
      ctx.pass.draw(ctx.entities);
      ctx.seen.push(ctx.bakes);
    },
    verify(ctx, t) {
      t.eq(ctx.seen.join(","), "1,2,2", "bakes after each draw: the first, the edit, none");
    },
    teardown(ctx) {
      ctx.pass.destroy();
      ctx.level.destroy();
      sprite_delete(ctx.spr);
    },
  },
  {
    // a write marks the chunks its cell and neighbours reach, and a view reaches only its own
    id: "render.chunks",
    setup(ctx) {
      Object.assign(ctx, Test.level(40, 40));
      Test.types(ctx);
      ctx.chunks = new Chunks(ctx.grid, ctx.layer);
    },
    verify(ctx, t) {
      const c = ctx.chunks;
      const layer = ctx.layer;
      const stale = () => {
        let n = 0;
        for (let k = 0; k < c.count; k++) n += c.dirty[k];
        return n;
      };
      t.eq(c.count, 9, "41 slots a side make 3x3 chunks of 16");
      c.sync();
      t.eq(stale(), 9, "the first sync marks every chunk");
      c.dirty.fill(0);
      c.sync();
      t.eq(stale(), 0, "an unmoved layer marks nothing");
      layer.set(5, 5, ctx.rock);
      c.sync();
      t.ok(stale() === 1 && c.dirty[0] === 1, "an interior write marks its own chunk");
      c.dirty.fill(0);
      layer.set(16, 16, ctx.rock);
      c.sync();
      t.ok(stale() === 4 && c.dirty[0] === 1 && c.dirty[4] === 1, "a write on a chunk edge marks every chunk its neighbours reach");
      c.dirty.fill(0);
      layer.set(39, 39, ctx.rock);
      c.sync();
      t.ok(stale() === 1 && c.dirty[8] === 1, "the far corner line has its chunk");
      const b = c.bounds(8, {});
      t.ok(b.x0 === 32 && b.x1 === 41 && b.y1 === 41, "the last chunk ends at the far corner line");
      c.dirty.fill(0);
      for (let i = 0; i < 300; i++) layer.set(i % 40, 20, ctx.rock);
      c.dirty.fill(0);
      c.sync();
      t.eq(stale(), 9, "a sync behind the log's reach marks every chunk");

      const view = { width: 64, groundRect: () => ({ x1: 0, y1: 0, x2: 64, y2: 64 }) };
      const w = c.window(view, {});
      t.ok(w.x0 === 0 && w.y0 === 0 && w.x1 === 1 && w.y1 === 1, "a view reaches only its chunks");
      const all = c.window(undefined, {});
      t.ok(all.x1 === 3 && all.y1 === 3, "no camera reaches every chunk");
    },
    teardown(ctx) {
      ctx.level.destroy();
    },
  },
  {
    // each param resolves on its own, so values and getters mix in any order
    id: "i18n.textRef",
    setup(ctx) {
      ctx.n = 1;
    },
    verify(ctx, t) {
      const key = "TEST_ABSENT {0} {1} {2}"; // an absent key renders as itself
      const mixed = I18n.textRef(key, "a", () => "n" + ctx.n, "c");
      const lead = I18n.textRef(key, () => "n" + ctx.n, "b", "c");
      t.eq(mixed(), "TEST_ABSENT a n1 c", "a value leading a getter");
      t.eq(lead(), "TEST_ABSENT n1 b c", "a getter leading values");
      ctx.n = 2;
      t.eq(mixed(), "TEST_ABSENT a n2 c", "a getter re-resolves");
      t.eq(
        I18n.textRef(key, "a", "b", "c")(),
        "TEST_ABSENT a b c",
        "values alone",
      );
    },
  },
  {
    // a drop hook owns the outcome, so the carried item goes home; without one the cells swap
    id: "ui.slotDrop",
    setup(ctx) {
      ctx.drops = [];
      ctx.a = new UISlots({ items: [{ id: "x" }, null] });
      ctx.b = new UISlots({ items: [{ id: "y" }, null] });
      ctx.hooked = new UISlots({
        items: [{ id: "z" }, null],
        onDrop: (src, from, to) => ctx.drops.push([src, from, to]),
      });
    },
    verify(ctx, t) {
      SlotDrag.begin(ctx.a, 0);
      SlotDrag.drop(ctx.hooked, 1);
      t.eq(ctx.drops.length, 1, "the hook fires once");
      const d = ctx.drops[0];
      t.ok(d[0] === ctx.a && d[1] === 0 && d[2] === 1, "the hook names source, from and to");
      t.eq(ctx.a.items[0].id, "x", "the carried item goes home");
      t.eq(ctx.hooked.items[1], null, "the hooked grid is left to its owner");
      t.ok(!SlotDrag.active, "the drag ends");

      SlotDrag.begin(ctx.a, 0);
      SlotDrag.drop(ctx.b, 0);
      t.ok(ctx.a.items[0].id === "y" && ctx.b.items[0].id === "x", "a hookless grid swaps");

      const passive = new UISlots({ items: [null], passive: true });
      t.eq(passive.onUpdate(undefined, false), false, "a passive grid never takes the pointer");
    },
    teardown(ctx) {
      SlotDrag.cancel();
    },
  },
]);
