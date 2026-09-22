// Core test cases, handed to sceneTest's runner. A case:
//   { id, frames?, setup(ctx), frame?(ctx, i, t), draw?(ctx, t), verify(ctx, t), teardown?(ctx) }
// setup fills ctx (a Level, a store, the ids); verify asserts through t.ok/eq/near — every miss
// is one `[CHECK] FAIL <id>` line — and times through t.measure, one `[BENCH]` line per measure;
// teardown frees what setup made. `frames` (default 1) spans a case over real
// frames for what only a frame boundary can catch. A case touches nothing but its own ctx — a
// system's per-level cache lives on the case's Level and goes with it. Every case here
// references Core only — it must keep running with Game deleted.
//
// A `perf.*` case is one family of per-op costs — THE record of what an operation costs on the
// pinned runtime, and the rule each family decides sits on its case. Its rows share the case's
// setup, every loop reads at the loop-variant index i, and `base` is the same loop minus the op —
// a loop-invariant read is hoisted and reports sub-nanosecond nonsense. A loop returns its sink so
// the work is observable. A figure is a same-run ratio: absolute times drift ~30% with machine
// state, so a before/after is two Reruns in one session, never a figure from an earlier one. The
// runtime is a VM at ~40-110x V8's per-op cost, which is why per-element constants, not complexity
// class, decide the frame (docs/ARCHITECTURE.md → Hot-path idioms). On a runtime upgrade re-run
// the family: a ratio that moved names the TODO at the site citing it (each family's comment
// says which), and absolute ns/op collapsing toward V8 is a JIT, which makes every hot-path
// idiom advisory. A per-op claim in a comment is a measure here.

const N = 4000; // the Measured Costs / Member Access loop length
const N_NATIVE = 20000; // the Native vs JS loop length — a ~40 ns boundary wants the resolution
const ENTITIES = 500; // the Data Layout store (the colony's size)
const PLAN_COLS = 128; // the overworld's side, the size perf.plan's figure is about

/** A 32 px-cell level with one empty-cost-1 tile layer, its own store. */
function _testLevel(cols, rows) {
  const grid = new LevelGrid({ cellWidth: 32, cellHeight: 32, cols, rows });
  const layer = new TileLayer(cols, rows, { emptyCost: 1 });
  grid.insert(layer);
  const level = new Level({ id: "test", grid, capacity: 64 });
  return { level, grid, layer, entities: level.entities };
}

/** Tile types built at setup, never at load: TileType sorts after testCore (docs/GMRT.md → load order). */
function _testTypes(ctx) {
  ctx.rock = new TileType({ id: "test_rock", pathCost: null }); // blocking
  ctx.mud = new TileType({ id: "test_mud", pathCost: 3 }); // weighted
}

/** A store of `count` entities carrying Position, plus an n-long cycling id list and its data. */
function _testStore(ctx, count, n) {
  const s = new Table(count);
  ctx.entities = s;
  const ids = [];
  for (let i = 0; i < count; i++) {
    const id = s.create();
    s.add(id, Position, { x: i, y: 0, z: 0 });
    ids.push(id);
  }
  ctx.ids = new Array(n);
  ctx.objs = new Array(n);
  for (let i = 0; i < n; i++) {
    const id = ids[i % count];
    ctx.ids[i] = id;
    ctx.objs[i] = s.get(id, Position);
  }
  // the column and dense list a walk hoists once per tick — read off the store's private set
  const set = s.components._byToken.get(Position);
  ctx.col = set.column;
  ctx.dense = set.dense;
}

/** n floats in [-2, 2), no shared stream (docs/GMRT.md → Math.random). */
function _testVals(n) {
  const vals = new Array(n);
  for (let i = 0; i < n; i++) vals[i] = ((i * 7919) % 400) / 100 - 2;
  return vals;
}

/** The empty loop of n — the baseline of a row that reads nothing but its index. */
function _testEmpty(n) {
  return () => {
    let s = 0;
    for (let i = 0; i < n; i++) s += i;
    return s;
  };
}

/** The loop of n reading `arr[i]` — the baseline of a row that reads one element and applies an op to it. */
function _testRead(n, arr) {
  return () => {
    let s = 0;
    for (let i = 0; i < n; i++) s += arr[i];
    return s;
  };
}

globalThis.testCore = {
  CASES: [
    // ── Checks ─────────────────────────────────────────────────────────────────
    {
      id: "entity.generation",
      setup(ctx) {
        ctx.entities = new Table(8);
      },
      verify(ctx, t) {
        const s = ctx.entities;
        const a = s.create();
        s.add(a, Position, { x: 1, y: 2, z: 0 });
        s.remove(a);
        s.flush();
        t.ok(!s.isValid(a), "a freed id reads invalid");
        t.eq(s.count(), 0, "count after flush");
        const b = s.create();
        t.eq(
          Handle.index(b),
          Handle.index(a),
          "the freed index is recycled",
        );
        t.ok(b !== a, "the recycled id carries a new generation");
        t.eq(
          Handle.generation(b),
          Handle.generation(a) + 1,
          "generation bumps by one",
        );
        t.ok(s.isValid(b), "the new owner is valid");
        t.ok(!s.isValid(a), "the stale id stays invalid after recycling");
        t.eq(
          s.get(b, Position),
          undefined,
          "a recycled slot carries no old component",
        );
        const live = s.query();
        t.eq(live.length, 1, "token-less query lists every live id");
        t.eq(live[0], b, "the live id is the new owner");
      },
      teardown(ctx) {
        ctx.entities.destroy();
      },
    },
    {
      id: "entity.flush",
      setup(ctx) {
        ctx.entities = new Table(8);
      },
      verify(ctx, t) {
        const s = ctx.entities;
        const id = s.create();
        s.add(id, Position, { x: 0, y: 0, z: 0 });
        s.remove(id);
        t.ok(s.isValid(id), "a queued removal is still valid before flush");
        t.eq(s.count(), 1, "a queued removal still counts");
        t.eq(s.query(Position).length, 1, "a queued removal still matches");
        s.flush();
        t.ok(!s.isValid(id), "flushed id is invalid");
        t.eq(s.query(Position).length, 0, "flushed id no longer matches");
        t.eq(s.has(id, Position), false, "flushed slot is cleared");
      },
      teardown(ctx) {
        ctx.entities.destroy();
      },
    },
    {
      id: "entity.forEach",
      setup(ctx) {
        const s = new Table(8);
        ctx.entities = s;
        ctx.a = s.create();
        s.add(ctx.a, Position, { x: 1, y: 0, z: 0 });
        s.add(ctx.a, Velocity, { x: 10, y: 0, z: 0 });
        ctx.b = s.create();
        s.add(ctx.b, Position, { x: 2, y: 0, z: 0 });
        ctx.c = s.create();
        s.add(ctx.c, Position, { x: 3, y: 0, z: 0 });
        s.add(ctx.c, Velocity, { x: 30, y: 0, z: 0 });
      },
      verify(ctx, t) {
        const s = ctx.entities;
        let visits = 0;
        let sumVel = 0;
        let sumPos = 0;
        s.forEach([Velocity, Position], (id, vel, pos) => {
          visits += 1;
          sumVel += vel.x;
          sumPos += pos.x;
        });
        t.eq(visits, 2, "forEach visits the join");
        t.eq(sumVel, 40, "data arrives in token order (Velocity first)");
        t.eq(sumPos, 4, "data arrives in token order (Position second)");
        t.eq(s.first(Velocity), ctx.a, "first() is the earliest carrier");
        t.eq(
          s.first("TestNoSuch"),
          -1,
          "first() on an unregistered token is -1",
        );
        t.eq(s.query(Position).length, 3, "query counts every carrier");
        t.eq(
          s.query("TestNoSuch").length,
          0,
          "query on an unregistered token is empty",
        );
        s.detach(ctx.a, Velocity);
        t.eq(s.first(Velocity), ctx.c, "detach drops the entity from the join");
      },
      teardown(ctx) {
        ctx.entities.destroy();
      },
    },
    {
      id: "entity.walk",
      setup(ctx) {
        const s = new Table(16);
        ctx.entities = s;
        ctx.ids = [];
        for (let k = 0; k < 6; k++) {
          const id = s.create();
          s.add(id, "TestWalk", { k });
          ctx.ids.push(id);
        }
      },
      verify(ctx, t) {
        const s = ctx.entities;
        const ids = ctx.ids;
        const set = s.components._byToken.get("TestWalk");
        // self-detach of the lead: every carrier visited once, the list compacted at the end
        let visits = 0;
        let seen = 0;
        s.forEach(["TestWalk"], (id, w) => {
          visits += 1;
          seen |= 1 << w.k;
          s.detach(id, "TestWalk");
          t.eq(
            s.has(id, "TestWalk"),
            false,
            "a detach reads absent inside the walk",
          );
          t.eq(
            set.dense.length,
            6,
            "the swap-remove waits for the walk to end",
          );
        });
        t.eq(visits, 6, "self-detach visits every carrier once");
        t.eq(seen, 63, "self-detach visits each carrier");
        t.eq(set.dense.length, 0, "the walk's end compacts the list");
        t.eq(s.query("TestWalk").length, 0, "nothing is left carrying it");
        for (let k = 0; k < 6; k++) s.add(ids[k], "TestWalk", { k });
        // another carrier detached mid-walk is skipped, a re-add keeps its carrier, and a
        // mid-walk add waits for the next walk
        visits = 0;
        seen = 0;
        s.forEach(["TestWalk"], (id, w) => {
          visits += 1;
          seen |= 1 << w.k;
          if (w.k === 0) {
            s.detach(ids[5], "TestWalk"); // the last carrier, still ahead of the walk
            s.detach(ids[2], "TestWalk");
            s.detach(id, "TestWalk");
            s.add(id, "TestWalk", w);
            s.add(s.create(), "TestWalk", { k: 6 });
          }
        });
        t.eq(visits, 4, "a carrier detached ahead of the walk is skipped");
        t.eq(
          seen,
          1 | 2 | 8 | 16,
          "the skipped carriers are the detached ones",
        );
        t.eq(
          s.has(ids[0], "TestWalk"),
          true,
          "a re-add during the walk keeps its carrier",
        );
        t.eq(
          s.query("TestWalk").length,
          5,
          "the survivors plus the mid-walk add remain",
        );
        visits = 0;
        s.forEach(["TestWalk"], () => {
          visits += 1;
        });
        t.eq(
          visits,
          5,
          "a carrier added mid-walk is visited from the next walk",
        );
        t.eq(set.dense.length, 5, "the dense list matches the query");
        // nested walks on one lead: the inner detach compacts when the OUTER walk ends
        visits = 0;
        s.forEach(["TestWalk"], (id) => {
          s.forEach(["TestWalk"], (oid) => {
            if (oid === id) s.detach(oid, "TestWalk");
          });
          visits += 1;
          t.eq(
            set.dense.length,
            5,
            "an inner detach compacts at the outer walk's end",
          );
        });
        t.eq(visits, 5, "the outer walk visits every carrier");
        t.eq(set.dense.length, 0, "the outer walk's end compacts");
        t.eq(set.walking, 0, "the walk depth returns to zero");
        // order: a removal swap-fills its hole from the tail, and the rest keep their places
        for (let k = 0; k < 3; k++) s.add(ids[k], "TestOrder", { k });
        s.detach(ids[0], "TestOrder");
        const q = s.query("TestOrder");
        t.eq(q[0], ids[2], "the last carrier takes the hole");
        t.eq(q[1], ids[1], "the rest keep their positions");
        t.eq(s.first("TestOrder"), ids[2], "first() reads the dense order");
      },
      teardown(ctx) {
        ctx.entities.destroy();
      },
    },
    {
      id: "entity.snapshot",
      setup(ctx) {
        const s = new Table(8);
        ctx.src = s;
        ctx.dst = new Table(8);
        const gone = s.create();
        ctx.a = s.create();
        s.add(ctx.a, Position, { x: 5, y: 6, z: 7 });
        s.add(ctx.a, Velocity, { x: 1, y: 0, z: 0 });
        s.remove(gone);
        s.flush();
        ctx.gone = gone;
      },
      verify(ctx, t) {
        const snap = ctx.src.export();
        ctx.dst.import(snap);
        const d = ctx.dst;
        t.eq(d.count(), 1, "count survives the round trip");
        t.ok(d.isValid(ctx.a), "a live id survives with its generation");
        t.ok(!d.isValid(ctx.gone), "a freed id stays invalid");
        const pos = d.get(ctx.a, Position);
        t.ok(pos !== undefined, "component data restored");
        if (pos !== undefined) t.eq(pos.z, 7, "component fields restored");
        t.eq(d.query(Velocity).length, 1, "every column restored");
        let visits = 0;
        d.forEach([Position], () => {
          visits += 1;
        });
        t.eq(visits, 1, "a walk after import runs the rebuilt list");
        const again = d.create();
        t.eq(
          Handle.index(again),
          Handle.index(ctx.gone),
          "the free list survives",
        );
      },
      teardown(ctx) {
        ctx.src.destroy();
        ctx.dst.destroy();
      },
    },
    {
      id: "entity.mint",
      setup(ctx) {
        const s = new Table(8);
        ctx.src = s;
        ctx.dst = new Table(8);
        ctx.a = s.create();
        s.add(ctx.a, Position, { x: 1, y: 2, z: 3 });
        s.mint(ctx.a, PathResponse, { path: [], index: 0 });
        s.add(ctx.a, PathResponse, { path: [], index: 1 }); // a later add keeps the token minted
      },
      verify(ctx, t) {
        const s = ctx.src;
        t.ok(
          s.get(ctx.a, PathResponse) !== undefined,
          "a minted component reads like any other",
        );
        const exp = s.export();
        t.ok(
          exp.components[Position] !== undefined,
          "export carries the added token",
        );
        t.eq(
          exp.components[PathResponse],
          undefined,
          "export skips the minted token",
        );
        const whole = s.persistentOf(ctx.a);
        t.ok(whole[Position] !== undefined, "persistentOf carries the added token");
        t.eq(whole[PathResponse], undefined, "persistentOf skips the minted token");
        t.ok(
          s.componentsOf(ctx.a)[PathResponse] !== undefined,
          "componentsOf still lists the minted token",
        );
        ctx.dst.import(exp);
        t.eq(
          ctx.dst.get(ctx.a, PathResponse),
          undefined,
          "a round trip drops the minted token",
        );
        t.ok(
          ctx.dst.get(ctx.a, Position) !== undefined,
          "a round trip keeps the added token",
        );
      },
      teardown(ctx) {
        ctx.src.destroy();
        ctx.dst.destroy();
      },
    },
    {
      id: "entity.codec",
      // the binary channel: a codec token's entries cross export/import as buffers through the
      // sink and the source, unpacked after the plain components
      setup(ctx) {
        ctx.src = new Table(8);
        ctx.dst = new Table(8);
        ctx.bufs = [];
        ctx.seen = false;
      },
      verify(ctx, t) {
        const s = ctx.src;
        const codec = {
          pack(data) {
            const b = buffer_create(4, buffer_fixed, 1);
            buffer_write(b, buffer_u32, data.n);
            return b;
          },
          unpack(b) {
            if (b === undefined) return undefined;
            buffer_seek(b, buffer_seek_start, 0);
            return { n: buffer_read(b, buffer_u32) };
          },
        };
        s.codec("TestBlob", codec);
        const a = s.create();
        s.add(a, "TestBlob", { n: 7 });
        s.add(a, Position, { x: 1, y: 2, z: 0 });
        const names = [];
        const exp = s.export((token, index, buf) => {
          names.push(token + "." + index);
          ctx.bufs.push(buf);
          return "blob" + (ctx.bufs.length - 1);
        });
        t.eq(names.join(","), "TestBlob." + Handle.index(a), "the sink sees the codec entry");
        t.eq(exp.components.TestBlob[0][1], "blob0", "the export holds the sink's name");
        t.eq(exp.components.Position[0][1].x, 1, "a plain component stays JSON");
        const d = ctx.dst;
        d.codec("TestBlob", {
          pack: codec.pack,
          unpack(b) {
            ctx.seen = d.get(a, Position) !== undefined;
            return codec.unpack(b);
          },
        });
        d.import(exp, (name) => ctx.bufs[Number(name.slice(4))]);
        t.eq(d.get(a, "TestBlob").n, 7, "the source's buffer unpacks");
        t.ok(ctx.seen, "unpack runs after the plain components are in");
        t.eq(d.get(a, Position).y, 2, "the plain component round-trips");
        d.import(exp, () => undefined);
        t.eq(d.get(a, "TestBlob"), undefined, "an unpack of nothing leaves the slot empty");
        t.eq(d.get(a, Position).y, 2, "the plain component still round-trips");
        const raw = s.export();
        const b2 = raw.components.TestBlob[0][1];
        t.ok(buffer_exists(b2), "without a sink the export holds the buffer");
        ctx.bufs.push(b2);
        const d2 = new Table(8);
        d2.codec("TestBlob", codec);
        d2.import(raw);
        t.eq(d2.get(a, "TestBlob").n, 7, "without a source the buffer unpacks as is");
        d2.destroy();
      },
      teardown(ctx) {
        for (let i = 0; i < ctx.bufs.length; i++) buffer_delete(ctx.bufs[i]);
        ctx.src.destroy();
        ctx.dst.destroy();
      },
    },
    {
      id: "file.roundtrip",
      // text and bytes through one pair: a file reads back as written (the text read stops at
      // EOF — docs/GMRT.md) and a grow buffer's file holds its used bytes only
      setup(ctx) {
        ctx.bufs = [];
      },
      verify(ctx, t) {
        const text = '{"a":[1,2,3],"b":"x"}';
        File.write("test/text.json", text);
        t.eq(File.read("test/text.json"), text, "text reads back as written");
        File.write("test/empty.txt", "");
        t.eq(File.read("test/empty.txt"), "", "an empty file reads as an empty string");
        t.eq(File.read("test/missing.txt"), undefined, "a missing file reads as undefined");
        const out = buffer_create(1, buffer_grow, 1);
        ctx.bufs.push(out);
        for (let i = 0; i < 5; i++) buffer_write(out, buffer_u32, i * 7);
        File.write("test/blob.bin", out, true);
        const back = File.read("test/blob.bin", true);
        t.ok(back !== undefined, "the blob reads back");
        if (back !== undefined) {
          ctx.bufs.push(back);
          t.eq(buffer_get_size(back), 20, "the file holds the used bytes only");
          t.eq(buffer_peek(back, 16, buffer_u32), 28, "the last value is intact");
        }
        t.eq(File.read("test/missing.bin", true), undefined, "a missing blob reads as undefined");
      },
      teardown(ctx) {
        for (let i = 0; i < ctx.bufs.length; i++) buffer_delete(ctx.bufs[i]);
      },
    },
    {
      id: "json.roundtrip",
      // the codec's promises: nesting, a sprite ref, a GML constant as a number, NaN and Infinity
      // as null, a cycle as null, invalid text as undefined, and the inline pretty form
      setup() {},
      verify(ctx, t) {
        const v = {
          n: 1,
          f: 0.5,
          s: 'x"y',
          arr: [1, 2, { a: true }],
          spr: pixMissing,
          key: vk_left,
          col: c_white,
          nul: null,
          nan: NaN,
          inf: 1 / 0,
          u: undefined,
        };
        const text = Json.encode(v);
        const bs = String.fromCharCode(92); // a literal backslash miscompiles (docs/GMRT.md)
        t.eq(
          text,
          '{"n":1,"f":0.5,"s":"x' + bs + '"y","arr":[1,2,{"a":true}],"spr":{"$spr":"pixMissing"},"key":37,"col":16777215,"nul":null,"nan":null,"inf":null}',
          "the compact form",
        );
        const d = Json.decode(text);
        t.ok(d !== undefined, "the compact form decodes");
        if (d !== undefined) {
          t.eq(d.arr[2].a, true, "nesting round-trips");
          t.ok(sprite_exists(d.spr) && sprite_get_name(d.spr) === "pixMissing", "a sprite ref revives");
          t.ok(d.key === vk_left && d.col === c_white, "a GML constant comes back as its number");
          t.eq(d.nan, null, "NaN lands as null");
        }
        const cyc = { a: 1 };
        cyc.self = cyc;
        t.eq(Json.encode(cyc), '{"a":1,"self":null}', "a cycle encodes as null");
        t.eq(Json.decode("garbage"), undefined, "invalid text decodes as undefined");
        t.eq(Json.decode('{"a":[1,2'), undefined, "truncated text decodes as undefined");
        t.eq(
          Json.encode({ r: [1, 2], o: { k: [{ a: 1 }] } }, { pretty: true }),
          '{\n  "r": [1, 2],\n  "o": {\n    "k": [\n      {\n        "a": 1\n      }\n    ]\n  }\n}',
          "the pretty form keeps a scalar array inline",
        );
      },
    },
    {
      id: "level.self",
      // the level's own entity: a record is a component `of` seeds and a save carries, a derived
      // entry one `derive` mints and the store frees through its own destroy
      setup(ctx) {
        ctx.level = new Level({ id: "test", capacity: 8 });
        ctx.freed = 0;
        ctx.makes = 0;
      },
      verify(ctx, t) {
        const level = ctx.level;
        const s = level.entities;
        const self = level.self;
        t.ok(s.isValid(self), "the level's own entity is live from construction");
        t.eq(Handle.index(self), 0, "it is index 0");
        const make = () => {
          ctx.makes++;
          return {
            destroy() {
              ctx.freed++;
            },
          };
        };
        const a = s.derive(self, "test_a", make);
        t.ok(s.derive(self, "test_a", make) === a, "derive returns the seeded entry");
        t.eq(ctx.makes, 1, "make runs once");
        t.ok(s.get(self, "test_a") === a, "get reads the entry");
        t.eq(s.get(self, "test_b"), undefined, "get reads undefined on a miss");
        t.ok(
          s.derive(self, "test_b", () => ({ plain: true })).plain,
          "an entry without destroy is fine",
        );
        const rec = s.of(self, "test_rec", () => ({ n: 1 }));
        t.ok(s.of(self, "test_rec", () => ({ n: 2 })) === rec, "of seeds once");
        const exp = s.export();
        t.eq(exp.components.test_a, undefined, "a derived entry is minted — no export carries it");
        t.eq(exp.components.test_b, undefined, "a plain derived entry neither");
        t.eq(exp.components.test_rec.length, 1, "a record rides the export");
        const twin = new Level({ id: "twin", capacity: 8 });
        twin.entities.import(exp);
        t.ok(twin.entities.isValid(twin.self), "self survives a store import");
        t.eq(twin.entities.get(twin.self, "test_rec").n, 1, "a record round-trips onto self");
        twin.destroy();
        s.detach(self, "test_a");
        t.eq(ctx.freed, 1, "detach called the entry's destroy");
        t.eq(s.get(self, "test_a"), undefined, "the slot is empty after the detach");
        t.ok(s.derive(self, "test_a", make) !== a, "derive reseeds after a detach");
        level.destroy();
        t.eq(ctx.freed, 2, "the level's destroy frees every derived entry");
        const g = new LevelGrid({ cellWidth: 32, cellHeight: 32, cols: 2, rows: 2 });
        const lg = new Level({ id: "g", grid: g, capacity: 4 });
        t.ok(lg.entities.get(lg.self, Level.GRID) === g, "the grid is the GRID component of self");
        t.ok(lg.grid === g, "grid reads that component");
        lg.grid = null;
        t.eq(lg.grid, null, "a grid-less level reads null");
        lg.grid = g;
        lg.destroy();
        t.eq(g.layers.length, 0, "the level's destroy frees its grid");
      },
    },
    {
      id: "level.grid.blob",
      // the grid's own pack/unpack: a blob names its shape, so a fresh grid unpacks it
      setup(ctx) {
        Object.assign(ctx, _testLevel(3, 2));
        // numeric ids — what a blob's u16 cell holds (contentTiles); _testTypes' are strings
        ctx.rock = new TileType({ id: 7, pathCost: null });
        ctx.mud = new TileType({ id: 9, pathCost: 3 });
      },
      verify(ctx, t) {
        const layer = ctx.layer;
        layer.set(1, 0, ctx.rock);
        layer.set(2, 1, ctx.mud);
        const buf = ctx.grid.pack();
        const shape = LevelGrid.shape(buf);
        t.eq(shape.cols, 3, "the header carries cols");
        t.eq(shape.rows, 2, "the header carries rows");
        t.eq(shape.cellWidth, 32, "the header carries the cell width");
        t.eq(shape.layers, 1, "the header carries the layer count");
        const grid = new LevelGrid({ cellWidth: shape.cellWidth, cellHeight: shape.cellHeight, cols: shape.cols, rows: shape.rows });
        const twin = new TileLayer(shape.cols, shape.rows, { emptyCost: 1 });
        grid.insert(twin);
        const types = [];
        types[ctx.rock.id] = ctx.rock;
        types[ctx.mud.id] = ctx.mud;
        t.ok(grid.unpack(buf, (_l, id) => types[id]), "the blob unpacks into the fresh grid");
        t.ok(twin.get(1, 0) === ctx.rock, "a cell comes back as its type");
        t.ok(twin.get(2, 1) === ctx.mud, "another cell too");
        t.ok(!twin.get(0, 0), "an empty cell stays empty");
        buffer_delete(buf);
        grid.destroy();
      },
      teardown(ctx) {
        ctx.level.destroy();
      },
    },
    {
      id: "world.pool",
      // the world's store: a pooled map is an entity carrying its id and its Level (minted, freed
      // with it), and the roster survives an import without the Levels
      setup(ctx) {
        World.reset();
      },
      verify(ctx, t) {
        const lv = new Level({ id: "test_a", capacity: 4 });
        World.add("test_a", lv);
        t.ok(World.get("test_a") === lv, "get resolves the pooled level");
        t.eq(World.get("test_b"), null, "a map not pooled reads null");
        t.eq(World.ids().join(","), "test_a", "ids lists the resident maps");
        World.activeId = "test_a";
        t.ok(World.active() === lv, "active resolves through the pool");
        const exp = World.table.export();
        t.eq(exp.components.level, undefined, "the Level is minted — no export carries it");
        t.eq(exp.components.map.length, 1, "the map entity rides the export");
        World.table.import(exp);
        t.ok(World.table.isValid(World.self), "self survives the import");
        t.eq(lv.entities.count(), 0, "the import released the pooled Level");
        t.eq(World.get("test_a"), null, "an imported map entity has no Level yet");
        t.eq(World.ids().length, 0, "ids lists none");
        const lv2 = new Level({ id: "test_a", capacity: 4 });
        World.add("test_a", lv2);
        t.ok(World.get("test_a") === lv2, "add hands the map entity its Level back");
        t.eq(World.table.count(), 2, "add re-used the imported map entity");
        World.reset();
        t.eq(lv2.entities.count(), 0, "reset destroyed the pooled level");
        t.eq(World.ids().length, 0, "the pool is empty after reset");
        t.eq(World.activeId, null, "no map is active after reset");
      },
    },
    {
      id: "level.self.rebuild",
      // the derived rule itself: every derived entry is rebuilt from the level's data, so a level
      // whose derived entries are all freed mid-run ends where its untouched twin does
      setup(ctx) {
        const mk = () => {
          const c = _testLevel(8, 8);
          const s = c.entities;
          Colliders.box(s, 96, 0, 32, 224); // a wall down column 3, rows 0..6
          c.a = s.create();
          s.add(c.a, Position, { x: 40, y: 100, z: 0 });
          s.add(c.a, BBox, { x: -8, y: -8, width: 16, height: 16 });
          s.add(c.a, Collision, { solid: true });
          s.add(c.a, Velocity, { x: 600, y: 0, z: 0 });
          c.b = s.create();
          s.add(c.b, Position, { x: 48, y: 104, z: 0 });
          s.add(c.b, BBox, { x: -8, y: -8, width: 16, height: 16 });
          s.add(c.b, Collision, { solid: true });
          s.add(c.b, Velocity, { x: 0, y: 0, z: 0 });
          c.w = s.create();
          s.add(c.w, Position, { x: 16, y: 16, z: 0 });
          Cameras.create(s, { x: 100, y: 100 });
          return c;
        };
        ctx.p = mk();
        ctx.q = mk();
      },
      verify(ctx, t) {
        const step = (c) => {
          const s = c.entities;
          s.mint(c.w, PathRequest, { startX: 0, startY: 0, goalX: 7, goalY: 0 });
          PathfindingSystem.update(c.level);
          SolidSystem.update(c.level);
          SeparationSystem.update(c.level);
          CameraSystem.apply(c.level);
        };
        for (let k = 0; k < 10; k++) {
          step(ctx.p);
          step(ctx.q);
          if (k === 4) {
            // solid, nav, separation and camera go
            const q = ctx.q;
            const keys = [SolidSystem.KEY, PathfindingSystem.KEY, SeparationSystem.KEY, CameraSystem.KEY];
            for (let i = 0; i < keys.length; i++) q.entities.detach(q.level.self, keys[i]);
          }
        }
        const p = ctx.p;
        const q = ctx.q;
        const pa = p.entities.get(p.a, Position);
        const qa = q.entities.get(q.a, Position);
        const pb = p.entities.get(p.b, Position);
        const qb = q.entities.get(q.b, Position);
        t.near(qa.x, pa.x, 1e-6, "the mover lands where the twin's does");
        t.near(qa.y, pa.y, 1e-6, "the mover's y matches the twin's");
        t.near(qb.x, pb.x, 1e-6, "the pushed body lands where the twin's does");
        t.near(qb.y, pb.y, 1e-6, "the pushed body's y matches the twin's");
        t.eq(
          q.entities.get(q.w, PathResponse).path.length,
          p.entities.get(p.w, PathResponse).path.length,
          "the path re-plans to the twin's length",
        );
        t.eq(
          SolidSystem.colliders(q.level).statics.length,
          SolidSystem.colliders(p.level).statics.length,
          "the collider snapshot rebuilds whole",
        );
        t.eq(
          CameraSystem.view(q.level).width,
          CameraSystem.view(p.level).width,
          "the view record rebuilds to the twin's extent",
        );
      },
      teardown(ctx) {
        ctx.p.level.destroy();
        ctx.q.level.destroy();
      },
    },
    {
      id: "entity.transient",
      // a minted token's release hook frees a datum wherever it leaves its slot, so a native
      // handle needs no roster and no reap pass
      setup(ctx) {
        ctx.s = new Table(8);
        ctx.freed = [];
      },
      verify(ctx, t) {
        const s = ctx.s;
        const hook = (d) => ctx.freed.push(d.tag);
        const a = s.create();
        const b = s.create();
        const c = s.create();
        s.mint(a, "TestHandle", { tag: "a" }, hook);
        s.mint(b, "TestHandle", { tag: "b" }, hook);
        s.mint(c, "TestHandle", { tag: "c" }, hook);
        t.eq(s.export().components["TestHandle"], undefined, "a hooked token is transient");
        s.detach(a, "TestHandle");
        t.eq(ctx.freed.join(""), "a", "detach releases the handle");
        s.remove(b);
        t.eq(ctx.freed.length, 1, "a queued removal releases nothing yet");
        s.flush();
        t.eq(ctx.freed.join(""), "ab", "flush releases the removed entity's handle");
        s.add(c, "TestHandle", { tag: "c2" });
        t.eq(ctx.freed.join(""), "abc", "a replacing add releases the old handle");
        s.forEach(["TestHandle"], (id) => s.detach(id, "TestHandle"));
        t.eq(ctx.freed.join(""), "abcc2", "a detach mid-walk releases at once");
        s.mint(c, "TestHandle", { tag: "d" }, hook);
        s.destroy();
        t.eq(ctx.freed.join(""), "abcc2d", "the store's destroy releases what is left");
      },
    },
    {
      id: "system.movement",
      setup(ctx) {
        ctx.level = new Level({ id: "test", capacity: 8 });
        const s = ctx.level.entities;
        ctx.entities = s;
        ctx.id = s.create();
        s.add(ctx.id, Position, { x: 0, y: 0, z: 0 });
        s.add(ctx.id, Velocity, { x: 60, y: -30, z: 6 });
      },
      verify(ctx, t) {
        for (let k = 0; k < 10; k++) MovementSystem.update(ctx.level);
        const pos = ctx.entities.get(ctx.id, Position);
        const d = Time.step * 10;
        t.near(pos.x, 60 * d, 1e-6, "x integrates velocity per step");
        t.near(pos.y, -30 * d, 1e-6, "y integrates velocity per step");
        t.near(pos.z, 6 * d, 1e-6, "z integrates velocity per step");
      },
      teardown(ctx) {
        ctx.level.destroy();
      },
    },
    {
      id: "system.lifetime",
      setup(ctx) {
        ctx.level = new Level({ id: "test", capacity: 8 });
        const s = ctx.level.entities;
        ctx.entities = s;
        ctx.id = s.create();
        s.add(ctx.id, Lifetime, { secs: Time.step * 2.5 });
      },
      verify(ctx, t) {
        const s = ctx.entities;
        LifetimeSystem.update(ctx.level);
        s.flush();
        LifetimeSystem.update(ctx.level);
        s.flush();
        t.ok(s.isValid(ctx.id), "alive before the last step");
        LifetimeSystem.update(ctx.level);
        t.ok(s.isValid(ctx.id), "expiry is deferred to flush");
        s.flush();
        t.ok(!s.isValid(ctx.id), "expired at flush");
      },
      teardown(ctx) {
        ctx.level.destroy();
      },
    },
    {
      id: "system.solid",
      setup(ctx) {
        ctx.level = new Level({ id: "test", capacity: 8 });
        const s = ctx.level.entities;
        ctx.entities = s;
        ctx.wall = Colliders.box(s, 100, 0, 32, 64);
        ctx.body = s.create();
        s.add(ctx.body, Position, { x: 50, y: 16, z: 0 });
        s.add(ctx.body, BBox, { x: 0, y: 0, width: 16, height: 16 });
        s.add(ctx.body, Collision, { solid: true });
        s.add(ctx.body, Velocity, { x: 600, y: 0, z: 0 }); // 10 px per tick
      },
      verify(ctx, t) {
        const s = ctx.entities;
        for (let k = 0; k < 20; k++) SolidSystem.update(ctx.level);
        const pos = s.get(ctx.body, Position);
        const vel = s.get(ctx.body, Velocity);
        t.ok(pos.x + 16 <= 100 + 1e-6, "body never enters the wall");
        t.ok(pos.x >= 80, "body reaches the wall");
        t.eq(vel.x, 0, "blocked axis zeroes velocity");
        const wallPos = s.get(ctx.wall, Position);
        t.eq(wallPos.x, 100, "kinematic solid never moves");
        t.eq(
          SolidSystem.colliders(ctx.level).statics.length,
          1,
          "static snapshot holds the wall",
        );
      },
      teardown(ctx) {
        ctx.level.destroy();
      },
    },
    {
      id: "solid.fingerprint",
      // a kinematic collider's `solid` flipped IN PLACE (a door's leaf, a trunk growing solid)
      // re-bakes like a wall built or torn down — no call from the writer
      setup(ctx) {
        ctx.level = new Level({ id: "test", capacity: 8 });
        const s = ctx.level.entities;
        ctx.entities = s;
        ctx.wall = Colliders.box(s, 100, 0, 32, 64);
        ctx.body = s.create();
        s.add(ctx.body, Position, { x: 50, y: 16, z: 0 });
        s.add(ctx.body, BBox, { x: 0, y: 0, width: 16, height: 16 });
        s.add(ctx.body, Collision, { solid: true });
        s.add(ctx.body, Velocity, { x: 600, y: 0, z: 0 });
      },
      verify(ctx, t) {
        const s = ctx.entities;
        const level = ctx.level;
        const col = s.get(ctx.wall, Collision);
        SolidSystem.update(level);
        const c = SolidSystem.colliders(level);
        t.eq(c.statics.length, 1, "the wall bakes");
        t.eq(c.gen, 1, "the first bake counts");
        col.solid = false; // the leaf opens
        for (let k = 0; k < 20; k++) SolidSystem.update(level);
        t.eq(c.statics.length, 0, "an open leaf leaves the bake");
        t.eq(c.gen, 2, "the flip moved the generation");
        t.ok(s.get(ctx.body, Position).x > 100, "the body walks through the open leaf");
        col.solid = true; // the leaf closes behind it
        SolidSystem.update(level);
        t.eq(c.statics.length, 1, "a closed leaf re-enters the bake");
        t.eq(c.gen, 3, "the flip back moved the generation again");
        SolidSystem.update(level);
        t.eq(c.gen, 3, "an unchanged set holds the generation");
      },
      teardown(ctx) {
        ctx.level.destroy();
      },
    },
    {
      // the one collider walk per tick: update's refresh lists the bodies, and both its integrate
      // loop and SeparationSystem (through eachBody) read that list — a body without Velocity is
      // listed but never moved, a solid-off body is listed but not separated
      id: "system.solid.bodies",
      setup(ctx) {
        ctx.level = new Level({ id: "test", capacity: 8 });
        const s = ctx.level.entities;
        ctx.entities = s;
        ctx.wall = Colliders.box(s, 100, 0, 32, 64);
        ctx.still = s.create(); // no Velocity: a cast target, not a mover
        s.add(ctx.still, Position, { x: 10, y: 100, z: 0 });
        s.add(ctx.still, BBox, { x: 0, y: 0, width: 16, height: 16 });
        s.add(ctx.still, Collision, { solid: true });
        ctx.a = s.create();
        s.add(ctx.a, Position, { x: 40, y: 40, z: 0 });
        s.add(ctx.a, BBox, { x: 0, y: 0, width: 16, height: 16 });
        s.add(ctx.a, Collision, { solid: true });
        s.add(ctx.a, Velocity, { x: 0, y: 0, z: 0 });
        ctx.b = s.create(); // overlaps a by 8 px in x, 16 in y — separation pushes along x
        s.add(ctx.b, Position, { x: 48, y: 40, z: 0 });
        s.add(ctx.b, BBox, { x: 0, y: 0, width: 16, height: 16 });
        s.add(ctx.b, Collision, { solid: true });
        s.add(ctx.b, Velocity, { x: 0, y: 0, z: 0 });
        ctx.corpse = s.create(); // solid off: listed, never separated
        s.add(ctx.corpse, Position, { x: 40, y: 40, z: 0 });
        s.add(ctx.corpse, BBox, { x: 0, y: 0, width: 16, height: 16 });
        s.add(ctx.corpse, Collision, { solid: false });
        s.add(ctx.corpse, Velocity, { x: 0, y: 0, z: 0 });
      },
      verify(ctx, t) {
        const s = ctx.entities;
        SolidSystem.update(ctx.level);
        let listed = 0;
        let sawStill = false;
        SolidSystem.colliders(ctx.level).eachBody((id) => {
          listed++;
          if (id === ctx.still) sawStill = true;
        });
        t.eq(listed, 4, "eachBody lists every non-kinematic collider");
        t.ok(sawStill, "a body without Velocity is listed");
        t.eq(s.get(ctx.still, Position).x, 10, "a body without Velocity is not integrated");

        SeparationSystem.update(ctx.level);
        const pa = s.get(ctx.a, Position);
        const pb = s.get(ctx.b, Position);
        t.near(pa.x, 36, 1e-6, "separation pushes a back half the overlap");
        t.near(pb.x, 52, 1e-6, "separation pushes b forward half the overlap");
        t.eq(s.get(ctx.corpse, Position).x, 40, "a solid-off body is not separated");
      },
      teardown(ctx) {
        ctx.level.destroy();
      },
    },
    {
      id: "collision.aabb",
      setup(ctx) {
        const s = new Table(8);
        ctx.entities = s;
        ctx.id = s.create();
        s.add(ctx.id, Position, { x: 10, y: 20, z: 0 });
        s.add(ctx.id, BBox, { x: -4, y: -8, width: 8, height: 16 });
      },
      verify(ctx, t) {
        const e = AABB.of(ctx.entities, ctx.id);
        t.eq(e.x1, 6, "x1 = pos + anchor");
        t.eq(e.y2, 28, "y2 = y1 + height");
        t.eq(e.cx, 10, "centre x");
        const into = AABB.ofInto(ctx.entities, ctx.id, AABB.rect());
        t.ok(
          into.x1 === e.x1 &&
            into.y1 === e.y1 &&
            into.x2 === e.x2 &&
            into.y2 === e.y2,
          "ofInto matches of",
        );
        const b = { x1: 14, y1: 0, x2: 30, y2: 30 };
        t.eq(AABB.overlap(e, b), false, "touching edges do not overlap");
        b.x1 = 13.9;
        t.eq(AABB.overlap(e, b), true, "crossing edges overlap");
      },
      teardown(ctx) {
        ctx.entities.destroy();
      },
    },
    {
      id: "collision.query",
      setup(ctx) {
        const s = new Table(8);
        ctx.entities = s;
        ctx.near = s.create();
        s.add(ctx.near, Position, { x: 10, y: 0, z: 0 });
        ctx.far = s.create();
        s.add(ctx.far, Position, { x: 100, y: 0, z: 0 });
        s.add(ctx.far, "TestMarker", { on: true });
      },
      verify(ctx, t) {
        const s = ctx.entities;
        t.eq(Query.nearest(s, 0, 0), ctx.near, "nearest by distance");
        t.eq(
          Query.nearest(s, 0, 0, { has: "TestMarker" }),
          ctx.far,
          "has: joins the marker",
        );
        t.eq(
          Query.nearest(s, 0, 0, { maxDist: 5 }),
          -1,
          "maxDist caps the search",
        );
        t.eq(Query.farthest(s, 0, 0), ctx.far, "farthest by distance");
        t.eq(
          Query.inRadius(s, 0, 0, 50).length,
          1,
          "inRadius counts inside only",
        );
        t.eq(Query.inRect(s, 0, -1, 200, 1).length, 2, "inRect counts both");
      },
      teardown(ctx) {
        ctx.entities.destroy();
      },
    },
    {
      id: "collision.raycast",
      setup(ctx) {
        ctx.level = new Level({ id: "test", capacity: 8 });
        const s = ctx.level.entities;
        ctx.entities = s;
        ctx.wall = Colliders.box(s, 100, 0, 32, 64);
        SolidSystem.update(ctx.level); // takes the static snapshot the cast walks
      },
      verify(ctx, t) {
        const s = ctx.entities;
        const hit = Raycast.cast(ctx.level, 0, 16, 200, 16);
        t.ok(hit !== null, "a segment through the wall hits");
        if (hit !== null) {
          t.eq(hit.id, ctx.wall, "hit id is the wall");
          t.near(hit.x, 100, 1e-6, "hit lands on the near face");
          t.near(hit.t, 0.5, 1e-6, "t is the segment parameter");
          t.eq(hit.nx, -1, "normal points back along the ray");
        }
        t.eq(
          Raycast.cast(ctx.level, 0, 16, 90, 16),
          null,
          "a segment short of the wall misses",
        );
        t.eq(
          Raycast.cast(ctx.level, 0, 80, 200, 80),
          null,
          "a segment beside the wall misses",
        );
      },
      teardown(ctx) {
        ctx.level.destroy();
      },
    },
    {
      id: "level.grid",
      setup(ctx) {
        ctx.grid = new LevelGrid({
          cellWidth: 32,
          cellHeight: 32,
          cols: 8,
          rows: 4,
        });
      },
      verify(ctx, t) {
        const g = ctx.grid;
        const w = g.gridToWorld(3, 2);
        t.eq(w.x, 112, "gridToWorld is the cell centre");
        const back = g.worldToGrid(w.x, w.y);
        t.ok(back.x === 3 && back.y === 2, "worldToGrid inverts gridToWorld");
        const edge = g.worldToGrid(31.9, 32);
        t.ok(
          edge.x === 0 && edge.y === 1,
          "a cell edge belongs to the next cell",
        );
        t.eq(g.costAt(0, 0), Infinity, "no layer → blocked");
      },
      teardown(ctx) {
        ctx.grid.destroy();
      },
    },
    {
      id: "level.navSync",
      setup(ctx) {
        Object.assign(ctx, _testLevel(8, 8));
        _testTypes(ctx);
        ctx.nav = new NavGrid(ctx.grid);
      },
      verify(ctx, t) {
        const nav = ctx.nav;
        t.eq(nav.sync(), true, "first sync resamples");
        t.eq(nav.grid.get(2, 2), 1, "empty cell costs the layer's emptyCost");
        t.eq(nav.sync(), false, "unchanged layers → no resample");
        ctx.layer.set(2, 2, ctx.rock);
        t.eq(nav.sync(), true, "a tile write resamples");
        t.eq(
          nav.grid.get(2, 2),
          Infinity,
          "a blocking tile mirrors as Infinity",
        );
        ctx.layer.set(2, 2, ctx.mud);
        nav.sync();
        t.eq(nav.grid.get(2, 2), 3, "a weighted tile mirrors its cost");
        nav.stamp([{ x1: 96, y1: 96, x2: 128, y2: 128 }]);
        t.eq(nav.grid.get(3, 3), Infinity, "a static stamps its cell");
        t.eq(nav.grid.get(4, 4), 1, "x2/y2 are exclusive");
        t.eq(nav.grid.get(2, 2), 3, "the base survives a stamp");
        ctx.layer.set(0, 0, ctx.rock);
        nav.sync();
        t.eq(nav.grid.get(3, 3), Infinity, "a resample re-applies the stamp");
      },
      teardown(ctx) {
        ctx.nav.destroy();
        ctx.level.destroy();
      },
    },
    {
      id: "nav.restamp",
      setup(ctx) {
        Object.assign(ctx, _testLevel(8, 8));
        const s = ctx.entities;
        ctx.wall = Colliders.box(s, 96, 0, 32, 224); // column 3, rows 0..6: a detour through row 7
        ctx.walker = s.create();
        s.add(ctx.walker, Position, { x: 16, y: 16, z: 0 });
        s.mint(ctx.walker, PathRequest, { startX: 0, startY: 0, goalX: 7, goalY: 0 });
        ctx.other = s.create();
        s.mint(ctx.other, PathResponse, { path: [{ x: 0, y: 0 }], index: 0 }); // a held path a restamp drops
      },
      verify(ctx, t) {
        const s = ctx.entities;
        const level = ctx.level;
        const hold = () =>
          s.mint(ctx.other, PathResponse, { path: [{ x: 0, y: 0 }], index: 0 });
        const ask = () =>
          s.mint(ctx.walker, PathRequest, { startX: 0, startY: 0, goalX: 7, goalY: 0 });
        SolidSystem.update(level); // the tick's collider walk snapshots the wall
        PathfindingSystem.update(level); // seeds the nav grid, stamps the wall, serves the request
        const r1 = s.get(ctx.walker, PathResponse);
        t.ok(r1 !== undefined, "the request is served");
        t.ok(r1.path.length > 8, "the path detours around the stamped wall: " + r1.path.length);
        t.eq(s.get(ctx.other, PathResponse), undefined, "the first stamp drops every held path");
        // the wall goes: the next collider walk moves the generation, and the update after it
        // restamps with no hook and no call from the writer
        hold();
        s.remove(ctx.wall);
        s.flush();
        ask();
        SolidSystem.update(level);
        PathfindingSystem.update(level);
        t.eq(s.get(ctx.walker, PathResponse).path.length, 8, "with the wall gone the path runs straight");
        t.eq(s.get(ctx.other, PathResponse), undefined, "a restamp drops every held path");
        // a body spawn never enters the fingerprint (kinematic carriers only): no restamp, paths stay
        hold();
        const body = s.create();
        s.add(body, Position, { x: 200, y: 200, z: 0 });
        s.add(body, BBox, { x: -8, y: -8, width: 16, height: 16 });
        s.add(body, Collision, { solid: true });
        SolidSystem.update(level);
        PathfindingSystem.update(level);
        t.ok(s.get(ctx.other, PathResponse) !== undefined, "a body spawn keeps every held path");
        t.eq(SolidSystem.colliders(level).gen, 2, "the generation counts the static set's changes");
      },
      teardown(ctx) {
        ctx.level.destroy();
      },
    },
    {
      id: "level.remesh",
      setup(ctx) {
        Object.assign(ctx, _testLevel(4, 4));
        _testTypes(ctx);
        ctx.colliders = [];
      },
      verify(ctx, t) {
        const layer = ctx.layer;
        TileEdit.set(layer, 0, 0, ctx.rock);
        TileEdit.set(layer, 1, 0, ctx.rock);
        TileEdit.set(layer, 0, 1, ctx.rock);
        TileEdit.set(layer, 1, 1, ctx.rock);
        TileEdit.set(layer, 3, 3, ctx.rock);
        t.eq(TileEdit.occupied(layer, 1, 1), true, "occupied reads a set cell");
        t.eq(
          TileEdit.occupied(layer, 2, 2),
          false,
          "occupied reads an empty cell",
        );
        const rects = TileEdit.meshRects(ctx.grid, layer);
        t.eq(rects.length, 2, "greedy mesh joins the 2×2 block");
        const s = ctx.entities;
        TileEdit.remesh(s, ctx.grid, layer, ctx.colliders);
        t.eq(ctx.colliders.length, 2, "one collider per rect");
        t.eq(s.count(), 3, "the store holds the colliders and the level's own entity");
        const col = s.get(ctx.colliders[0], Collision);
        t.ok(
          col !== undefined && col.kinematic === true,
          "a collider is a kinematic solid",
        );
        TileEdit.clear(layer, 3, 3);
        TileEdit.remesh(s, ctx.grid, layer, ctx.colliders);
        t.eq(ctx.colliders.length, 1, "remesh replaces the set");
        t.eq(s.count(), 2, "old colliders are flushed");
        const box = s.get(ctx.colliders[0], BBox);
        t.ok(
          box.width === 64 && box.height === 64,
          "the block's collider spans 2×2 cells",
        );
      },
      teardown(ctx) {
        ctx.level.destroy();
      },
    },
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
    {
      id: "id.pack",
      setup() {},
      verify(ctx, t) {
        const id = Handle.make(5, 7);
        t.eq(Handle.index(id), 5, "index unpacks");
        t.eq(Handle.generation(id), 7, "generation unpacks");
        const top = Handle.make(
          Handle.INDEX_MASK,
          Handle.GENERATION_MASK,
        );
        t.eq(Handle.index(top), Handle.INDEX_MASK, "index at its mask");
        t.eq(
          Handle.generation(top),
          Handle.GENERATION_MASK,
          "generation at its mask",
        );
      },
    },
    {
      id: "frame.count",
      frames: 3,
      setup(ctx) {
        ctx.seen = 0;
        ctx.frame0 = Time.frame;
      },
      frame(ctx) {
        ctx.seen += 1;
      },
      verify(ctx, t) {
        t.eq(ctx.seen, 3, "a case spans its frames");
        t.eq(Time.frame - ctx.frame0, 2, "one real frame per step");
      },
    },
    {
      // `require` is `get` for a component the contract needs: the data, or a throw naming the
      // entity and the token — never undefined
      id: "entity.require",
      setup(ctx) {
        const s = new Table(8);
        ctx.entities = s;
        ctx.a = s.create();
        s.add(ctx.a, Position, { x: 1, y: 2, z: 3 });
      },
      verify(ctx, t) {
        const s = ctx.entities;
        t.eq(s.require(ctx.a, Position).x, 1, "require reads a carried component");
        let missing = "";
        try {
          s.require(ctx.a, Velocity);
        } catch (e) {
          missing = e.message;
        }
        t.ok(missing.indexOf("Velocity") !== -1, "an absent component throws, naming the token");
        let unregistered = "";
        try {
          s.require(ctx.a, "Unregistered");
        } catch (e) {
          unregistered = e.message;
        }
        t.ok(unregistered !== "", "an unregistered token throws too");
        t.eq(s.get(ctx.a, Velocity), undefined, "get still reads undefined for an absent one");
      },
      teardown(ctx) {
        ctx.entities.destroy();
      },
    },
    {
      // a facade is a plain object with no storage of its own: Registry seeds it on first use,
      // `make` normalizes each def, and a re-registered id keeps its position (docs/ARCHITECTURE.md
      // → Registry pattern)
      id: "registry.facade",
      setup(ctx) {
        const Tier = {
          register(defs) {
            Registry.register(Tier, defs, Tier.make);
          },
          make(d) {
            return { id: d.id, weight: d.weight ?? 1 };
          },
        };
        ctx.facade = Tier;
        ctx.before = Registry.all(Tier).length;
        Tier.register([{ id: "low" }, { id: "mid", weight: 2 }]);
        Tier.register([{ id: "high" }, { id: "low", weight: 5 }]);
      },
      verify(ctx, t) {
        const Tier = ctx.facade;
        t.eq(ctx.before, 0, "an unregistered facade reads empty, not undefined");
        t.eq(Registry.get(Tier, "mid").weight, 2, "make normalizes a def");
        t.eq(Registry.get(Tier, "high").weight, 1, "make applies a default");
        t.eq(Registry.get(Tier, "low").weight, 5, "a re-registered id overwrites its def");
        t.eq(Registry.rank(Tier, "low"), 0, "a re-registered id keeps its position");
        t.eq(Registry.rank(Tier, "none"), -1, "an unknown id ranks -1");
        t.ok(Registry.has(Tier, "high"), "has finds a registered id");
        t.ok(!Registry.has(Tier, "none"), "has misses an unknown id");
        const all = Registry.all(Tier);
        t.eq(all.length, 3, "all lists every def once");
        t.eq(all[2].id, "high", "all runs in registration order");
        t.eq(Registry.ids(Tier).join(","), "low,mid,high", "ids is the order itself");
      },
    },
    {
      // the asset-keyed registry: refs are found by identity, a re-registered asset replaces in
      // place, and each field reads its default off an undeclared or unset asset
      id: "assetmeta.lookup",
      setup(ctx) {
        ctx.before = AssetMeta.all().length;
        ctx.sheet = {};
        ctx.track = {};
        ctx.plain = {};
        AssetMeta.register([
          { asset: ctx.sheet, kind: "test", density: 2 },
          { asset: ctx.track, kind: "test", bpm: 90, name: "TEST_TRACK" },
        ]);
        AssetMeta.register([{ asset: ctx.sheet, kind: "test", density: 4 }]);
      },
      verify(ctx, t) {
        t.eq(AssetMeta.all().length - ctx.before, 2, "a re-registered asset adds no entry");
        t.eq(AssetMeta.of(ctx.sheet).density, 4, "a re-registered asset replaces its def");
        t.eq(AssetMeta.all()[ctx.before].asset, ctx.sheet, "a replaced def keeps its position");
        t.eq(AssetMeta.of(ctx.plain), undefined, "an undeclared asset has no def");
        t.eq(AssetMeta.density(ctx.sheet), 4, "density reads the declared value");
        t.eq(AssetMeta.density(ctx.plain), 1, "density defaults to 1 undeclared");
        t.eq(AssetMeta.density(ctx.track), 1, "density defaults to 1 when unset");
        t.eq(AssetMeta.fit(ctx.sheet, 2), 0.5, "fit divides the design scale by density");
        t.eq(AssetMeta.bpm(ctx.track), 90, "bpm reads the declared value");
        t.eq(AssetMeta.bpm(ctx.sheet), 0, "bpm defaults to 0 when unset");
      },
      teardown(ctx) {
        AssetMeta._assets.length = ctx.before;
        AssetMeta._defs.length = ctx.before;
      },
    },
    // ── perf.measured: the costs that decide the frame ─────────────────────────
    // A static-method call and an object literal each cost about a hundred plain reads, a hash
    // lookup a dozen: the rule for every hot loop is the cheap form in the paired row — the
    // inline mask over Handle.index, a cached column over store.get, edgesInto over edges, a
    // reused buffer over push, and never a per-element reset of a level-sized scratch (the
    // generation stamp, MotionPlanner.scratch's `stamp`).
    {
      id: "perf.measured",
      setup(ctx) {
        const n = N;
        ctx.vals = _testVals(n);
        ctx.packed = new Array(n);
        for (let i = 0; i < n; i++) ctx.packed[i] = Handle.make(i & 63, 3);
        _testStore(ctx, 64, n);
        ctx.pos = new Array(n);
        for (let i = 0; i < n; i++) ctx.pos[i] = { x: i, y: i, z: 0 };
        ctx.box = new Array(n);
        for (let i = 0; i < n; i++)
          ctx.box[i] = { x: -8, y: -8, width: 16, height: 16 };
        const map = new Map();
        const names = [];
        for (let k = 0; k < 43; k++) {
          // the colony's column count
          const name = "Component" + k;
          map.set(name, k);
          names.push(name);
        }
        ctx.map = map;
        ctx.keys = new Array(n);
        ctx.keyVals = new Array(n);
        for (let i = 0; i < n; i++) {
          ctx.keys[i] = names[i % names.length];
          ctx.keyVals[i] = i % names.length;
        }
        ctx.buf = [];
        ctx.fillArr = new Array(n).fill(0);
      },
      verify(ctx, t) {
        const n = N;
        const vals = ctx.vals;
        const readVals = _testRead(n, vals);
        const empty = _testEmpty(n);

        const f1 = (a) => a;
        t.measure("closure.call1", n, readVals, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += f1(vals[i]);
          return s;
        });
        const f3 = (a, b, c) => a + b + c;
        t.measure(
          "closure.call3",
          n,
          () => {
            let s = 0;
            for (let i = 0; i < n; i++) s += vals[i] + 1 + 2;
            return s;
          },
          () => {
            let s = 0;
            for (let i = 0; i < n; i++) s += f3(vals[i], 1, 2);
            return s;
          },
        );

        const packed = ctx.packed;
        const readPacked = _testRead(n, packed);
        t.measure("id.index", n, readPacked, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += Handle.index(packed[i]);
          return s;
        });
        const mask = Handle.INDEX_MASK;
        t.measure("id.index.inline", n, readPacked, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += packed[i] & mask;
          return s;
        });

        const store = ctx.entities;
        const ids = ctx.ids;
        const objs = ctx.objs;
        const col = ctx.col;
        const readObjs = () => {
          let s = 0;
          for (let i = 0; i < n; i++) {
            const p = objs[i];
            s += p.x;
          }
          return s;
        };
        t.measure("store.get", n, readObjs, () => {
          let s = 0;
          for (let i = 0; i < n; i++) {
            const p = store.get(ids[i], Position);
            s += p.x;
          }
          return s;
        });
        t.measure("store.get.cached", n, readObjs, () => {
          let s = 0;
          for (let i = 0; i < n; i++) {
            const p = col[ids[i] & mask];
            s += p.x;
          }
          return s;
        });

        const pos = ctx.pos;
        const box = ctx.box;
        const readPosBox = () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += pos[i].x + box[i].x;
          return s;
        };
        t.measure("aabb.edges", n, readPosBox, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += AABB.edges(pos[i], box[i]).x1;
          return s;
        });
        const rect = AABB.rect();
        t.measure("aabb.edgesInto", n, readPosBox, () => {
          let s = 0;
          for (let i = 0; i < n; i++)
            s += AABB.edgesInto(pos[i], box[i], rect).x1;
          return s;
        });

        const map = ctx.map;
        const keys = ctx.keys;
        t.measure("map.get", n, _testRead(n, ctx.keyVals), () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += map.get(keys[i]);
          return s;
        });

        t.measure("array.push", n, empty, () => {
          const out = [];
          for (let i = 0; i < n; i++) out.push(i);
          return out.length;
        });
        const buf = ctx.buf;
        t.measure("array.reuse", n, empty, () => {
          let w = 0;
          for (let i = 0; i < n; i++) buf[w++] = i;
          buf.length = w;
          return w;
        });
        const fillArr = ctx.fillArr;
        t.measure(
          "array.fill",
          n,
          () => 0,
          () => {
            fillArr.fill(1);
            return fillArr[n - 1];
          },
        );
      },
      teardown(ctx) {
        ctx.entities.destroy();
      },
    },
    // ── perf.plan: what one A* expansion costs ──────────────────────────────
    // THE record for what an expansion costs, measured on the shape a far plan has: a weighted
    // 128² field, corner to corner, where the unit heuristic is weak enough that most of the level
    // expands. `n` is the nav scratch's `iters`, so the row is ns per expansion and not per plan —
    // multiply by the iters in the log line for what one plan costs a frame.
    {
      id: "perf.plan",
      setup(ctx) {
        Object.assign(ctx, _testLevel(PLAN_COLS, PLAN_COLS));
        _testTypes(ctx);
        // a weighted field, not a maze: mud in a coarse checker so most cells stay reachable and
        // the cost spread is what defeats the heuristic
        for (let y = 0; y < PLAN_COLS; y++)
          for (let x = 0; x < PLAN_COLS; x++)
            if (((x >> 3) + (y >> 3)) % 2 === 0) ctx.layer.set(x, y, ctx.mud);
        ctx.nav = new NavGrid(ctx.grid);
        ctx.nav.sync();
      },
      verify(ctx, t) {
        const nav = ctx.nav;
        const a = { x: 0, y: 0 };
        const b = { x: PLAN_COLS - 1, y: PLAN_COLS - 1 };
        const opt = { allowDiag: true };
        const path = MotionPlanner.plan(nav, a, b, opt);
        const iters = nav.scratch.iters;
        t.ok(path.length > 0, "the corner-to-corner plan resolves");
        t.ok(
          iters > PLAN_COLS,
          "the plan expands more than a straight run of cells",
        );
        // the octile plan must be ADMISSIBLE: with diagonals costing only sqrt(2) it can never
        // come out dearer than the cardinal one over the same field. An octile search run on the
        // Manhattan heuristic overestimates and fails this while still returning a path, so the
        // row is what catches the heuristic losing its `allowDiag` (GMRT.md #15549).
        const walk = (pth) => {
          let cost = 0;
          let broken = 0;
          for (let i = 1; i < pth.length; i++) {
            const dx = pth[i].x - pth[i - 1].x;
            const dy = pth[i].y - pth[i - 1].y;
            const adx = dx > 0 ? dx : -dx;
            const ady = dy > 0 ? dy : -dy;
            if (adx > 1) broken += 1;
            if (ady > 1) broken += 1;
            const step = adx + ady === 2 ? MotionPlanner.SQRT_2 : 1;
            cost += ctx.nav.grid.get(pth[i].x, pth[i].y) * step;
          }
          return { cost, broken };
        };
        const diag = walk(path);
        const straight = walk(MotionPlanner.plan(nav, a, b, { allowDiag: false }));
        t.eq(diag.broken, 0, "every octile step lands on a neighbour cell");
        t.ok(
          path[0].x === 0 && path[path.length - 1].x === PLAN_COLS - 1,
          "the path spans corner to corner",
        );
        t.ok(
          diag.cost <= straight.cost + 1e-6,
          "the octile path costs no more than the cardinal one : " +
            diag.cost +
            " vs " +
            straight.cost,
        );
        t.measure(
          "plan.expansion",
          iters,
          () => 0,
          () => MotionPlanner.plan(nav, a, b, opt).length,
        );
        // the same plan with the heap and the grid reads left in but the neighbour scan cut to
        // cardinals: the row pairs with the one above to say how much of an expansion is the scan
        const cardinal = { allowDiag: false };
        MotionPlanner.plan(nav, a, b, cardinal);
        t.measure(
          "plan.expansion.cardinal",
          nav.scratch.iters,
          () => 0,
          () => MotionPlanner.plan(nav, a, b, cardinal).length,
        );
      },
      teardown(ctx) {
        ctx.nav.destroy();
        ctx.level.destroy();
      },
    },
    // ── perf.native: a GML built-in against its inline JS twin ──────────────────
    // The JS↔GML boundary costs ~35-57 ns whatever the call does, so a native pays only when it
    // replaces more JS than that: bulk work inside ONE call (draw_*, vertex_*, buffer_*, an
    // array_create fill, array_sort) wins outright, a scalar helper loses to a property read or
    // a comparison chain — and the JS standard library is itself slow here, so `Math.abs`/
    // `Math.sin` LOSE to their GML twins. That split is the one the code runs.
    // TODO when `js.abs` reaches `native.abs`, drop the native detours over `Math.*` and
    // `Array.sort` over `array_sort`; when the boundary (`native.clamp` vs `js.clamp`) falls
    // below ~10 ns, re-test natives at scalar sites and `tilemap_*` against RenderTileMap's
    // vertex buffers.
    {
      id: "perf.native",
      setup(ctx) {
        const n = N_NATIVE;
        ctx.vals = _testVals(n);
        // one loop per array: interleaving the allocations scatters each array's elements
        // through the others' and the read rows pay it back as cache misses (~3x)
        ctx.arrs = new Array(n);
        for (let i = 0; i < n; i++) ctx.arrs[i] = [i, i, i];
        ctx.a = new Array(n);
        for (let i = 0; i < n; i++) ctx.a[i] = { x1: 0, y1: 0, x2: 16, y2: 16 };
        ctx.b = new Array(n);
        for (let i = 0; i < n; i++)
          ctx.b[i] = { x1: (i % 3) * 8, y1: 0, x2: (i % 3) * 8 + 16, y2: 16 };
      },
      verify(ctx, t) {
        const n = N_NATIVE;
        const vals = ctx.vals;
        const readVals = _testRead(n, vals);
        const empty = _testEmpty(n);

        t.measure("native.clamp", n, readVals, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += clamp(vals[i], 0, 1);
          return s;
        });
        t.measure("js.clamp", n, readVals, () => {
          let s = 0;
          for (let i = 0; i < n; i++) {
            const v = vals[i];
            s += v < 0 ? 0 : v > 1 ? 1 : v;
          }
          return s;
        });
        t.measure("native.floor", n, readVals, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += floor(vals[i]);
          return s;
        });
        t.measure("js.floor", n, readVals, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += Math.floor(vals[i]);
          return s;
        });
        t.measure("native.sin", n, readVals, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += sin(vals[i]);
          return s;
        });
        t.measure("js.sin", n, readVals, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += Math.sin(vals[i]);
          return s;
        });
        t.measure("native.abs", n, readVals, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += abs(vals[i]);
          return s;
        });
        t.measure("js.abs", n, readVals, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += Math.abs(vals[i]);
          return s;
        });
        t.measure("native.pointDistance", n, readVals, () => {
          let s = 0;
          for (let i = 0; i < n; i++) {
            const v = vals[i];
            s += point_distance(0, 0, v, v);
          }
          return s;
        });
        t.measure("js.distance", n, readVals, () => {
          let s = 0;
          for (let i = 0; i < n; i++) {
            const v = vals[i];
            s += Math.sqrt(v * v + v * v);
          }
          return s;
        });

        const arrs = ctx.arrs;
        t.measure("native.arrayLength", n, empty, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += array_length(arrs[i]);
          return s;
        });
        t.measure("js.length", n, empty, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += arrs[i].length;
          return s;
        });

        const as = ctx.a;
        const bs = ctx.b;
        const readRects = () => {
          let s = 0;
          for (let i = 0; i < n; i++) {
            const a = as[i];
            const b = bs[i];
            s += a.x1 + b.x1;
          }
          return s;
        };
        t.measure("native.rectOverlap", n, readRects, () => {
          let s = 0;
          for (let i = 0; i < n; i++) {
            const a = as[i];
            const b = bs[i];
            s +=
              rectangle_in_rectangle(
                a.x1,
                a.y1,
                a.x2,
                a.y2,
                b.x1,
                b.y1,
                b.x2,
                b.y2,
              ) !== 0
                ? 1
                : 0;
          }
          return s;
        });
        t.measure("js.rectOverlap", n, readRects, () => {
          let s = 0;
          for (let i = 0; i < n; i++) {
            const a = as[i];
            const b = bs[i];
            s +=
              a.x2 > b.x1 && b.x2 > a.x1 && a.y2 > b.y1 && b.y2 > a.y1 ? 1 : 0;
          }
          return s;
        });
      },
    },
    // ── perf.access: one read at a loop-variant index ──────────────────────────
    // A JS property and a user-defined GM instance property cost the same (both a slot);
    // access by name (variable_struct_get) ~5x that, the price of any token-driven path; a TYPED
    // array element ~20x a plain one — the outlier, so a hot value stored in one is MIRRORED into
    // a plain array (Handle.packed). A BUILT-IN instance variable (x/y, image_*) goes through
    // accessors at 3-4.5x a column read, which is why an instance holds scope, never data.
    // TODO when `read.typed` reaches `read.array` (AOT does not close it: ~22x under `--runtime
    // native`), the `Handle.packed` mirror stops paying for itself and typed scratch is an
    // option again (MotionPlanner); when a built-in reaches a user-defined property, `Instance`
    // may hold data. The instance-scoped built-ins themselves are an API contract, not a gap.
    {
      id: "perf.access",
      setup(ctx) {
        const n = N;
        ctx.vals = _testVals(n);
        ctx.objs = new Array(n);
        for (let i = 0; i < n; i++) ctx.objs[i] = { v: i };
        ctx.typed = new Float64Array(n);
        for (let i = 0; i < n; i++) ctx.typed[i] = i;
      },
      verify(ctx, t) {
        const n = N;
        const vals = ctx.vals;
        const readVals = _testRead(n, vals);
        const empty = _testEmpty(n);
        const objs = ctx.objs;
        const typed = ctx.typed;

        t.measure("read.array", n, empty, readVals);
        t.measure("read.object", n, readVals, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += objs[i].v;
          return s;
        });
        t.measure("read.structGet", n, readVals, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += variable_struct_get(objs[i], "v");
          return s;
        });
        t.measure("read.typed", n, empty, () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += typed[i];
          return s;
        });
      },
    },
    // ── perf.layout: a walk costs per lead carrier, never per index ────────────
    // A walk runs down the lead token's dense list (Columns), so its cost is the lead's
    // carrier count: at 100% (`forEach.full`) it is the column scan plus an indirection, below
    // that it is the slots never visited — `forEach.sparse` against `forEach.trail` is the same
    // four matches led by the rare token and by Position, the lead-order rule measured (both gross
    // per store entity — the loop they would net out IS the walk). forEach
    // hands the walk's data to the callback where query + get pays a hash lookup per entity;
    // `store.churn` is the upkeep a detach + add pair costs over two column writes. No ratio here
    // retires an idiom on a runtime upgrade: the lead-order rule is a property of the layout.
    {
      id: "perf.layout",
      setup(ctx) {
        _testStore(ctx, ENTITIES, ENTITIES);
        const s = ctx.entities;
        for (let k = 0; k < 4; k++)
          s.add(ctx.ids[k * 100], "TestRare", { on: true });
        for (let i = 0; i < ENTITIES; i++)
          s.add(ctx.ids[i], "TestChurn", ctx.objs[i]);
        ctx.scratch = new Array(ENTITIES).fill(undefined);
      },
      verify(ctx, t) {
        const n = ENTITIES;
        const empty = _testEmpty(n);
        const store = ctx.entities;
        const col = ctx.col;
        const dense = ctx.dense;

        t.measure("forEach.full", n, empty, () => {
          let s = 0;
          store.forEach([Position], (id, p) => {
            s += p.x;
          });
          return s;
        });
        t.measure(
          "forEach.sparse",
          n,
          () => 0,
          () => {
            let s = 0;
            store.forEach(["TestRare", Position], (id, r, p) => {
              s += p.x;
            });
            return s;
          },
        );
        t.measure(
          "forEach.trail",
          n,
          () => 0,
          () => {
            let s = 0;
            store.forEach([Position, "TestRare"], (id, p) => {
              s += p.x;
            });
            return s;
          },
        );
        t.measure("query.get", n, empty, () => {
          const ids = store.query(Position);
          let s = 0;
          for (let k = 0; k < ids.length; k++)
            s += store.get(ids[k], Position).x;
          return s;
        });
        t.measure("column.loop", n, empty, () => {
          let s = 0;
          for (let i = 0; i < n; i++) {
            const d = col[i];
            if (d !== undefined) s += d.x;
          }
          return s;
        });
        t.measure("dense.loop", n, empty, () => {
          let s = 0;
          for (let k = 0; k < n; k++) {
            const d = col[dense[k]];
            if (d !== undefined) s += d.x;
          }
          return s;
        });

        const ids = ctx.ids;
        const objs = ctx.objs;
        const scratch = ctx.scratch;
        const mask = Handle.INDEX_MASK;
        t.measure(
          "store.churn",
          n,
          () => {
            for (let i = 0; i < n; i++) {
              const k = ids[i] & mask;
              scratch[k] = undefined;
              scratch[k] = objs[i];
            }
            return scratch[0];
          },
          () => {
            for (let i = 0; i < n; i++) {
              store.detach(ids[i], "TestChurn");
              store.add(ids[i], "TestChurn", objs[i]);
            }
            return store.get(ids[0], "TestChurn");
          },
        );
      },
      teardown(ctx) {
        ctx.entities.destroy();
      },
    },
  ],
};
