// Cases over the pinned runtime itself, no Core area: the frame clock the harness spans, and
// the perf.* families that decide the hot-path idioms — perf.measured (the costs that decide the
// frame), perf.native (a GML built-in against its inline JS twin) and perf.access (one read at a
// loop-variant index). Every case here references Core only; the case contract and the perf.*
// rule are Test's.

const N = 4000; // the perf.measured / perf.access loop length
const N_NATIVE = 20000; // the perf.native loop length — a ~40 ns boundary wants the resolution

Test.register(Test.CHECK, [
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
  // ── perf.measured: the costs that decide the frame ─────────────────────────
  // A static-method call and an object literal each cost about a hundred plain reads, a hash
  // lookup a dozen: the rule for every hot loop is the cheap form in the paired row — the
  // inline mask over Handle.index, a cached column over store.get, edgesInto over edges, a
  // reused buffer over push, and never a per-element reset of a level-sized scratch (the
  // generation stamp, MotionPlanner.scratch's `stamp`). The overlap pair is why a
  // per-candidate loop inlines the test —
  // the call is about twice it; the centre pair the Into rect once carried was about half of
  // an edgesInto, which is why it holds four edges.
  {
    id: "perf.measured",
    setup(ctx) {
      const n = N;
      ctx.vals = Test.vals(n);
      ctx.packed = new Array(n);
      for (let i = 0; i < n; i++) ctx.packed[i] = Handle.make(i & 63, 3);
      Test.store(ctx, 64, n);
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
      // rect pairs, every other one overlapping (an odd i's b starts 8 px into a, an even's 20 px past)
      ctx.ra = new Array(n);
      ctx.rb = new Array(n);
      for (let i = 0; i < n; i++) {
        ctx.ra[i] = { x1: i, y1: 0, x2: i + 16, y2: 16 };
        const bx = i + (i & 1 ? 8 : 20);
        ctx.rb[i] = { x1: bx, y1: 0, x2: bx + 16, y2: 16 };
      }
      ctx.buf = [];
      ctx.fillArr = new Array(n).fill(0);
    },
    verify(ctx, t) {
      const n = N;
      const vals = ctx.vals;
      const readVals = Test.read(n, vals);
      const empty = Test.empty(n);

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
      const readPacked = Test.read(n, packed);
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
      t.measure("aabb.literal", n, readPosBox, () => {
        let s = 0;
        for (let i = 0; i < n; i++) {
          const x1 = pos[i].x + box[i].x;
          const y1 = pos[i].y + box[i].y;
          const x2 = x1 + box[i].width;
          const y2 = y1 + box[i].height;
          s += { x1, y1, x2, y2, cx: (x1 + x2) * 0.5, cy: (y1 + y2) * 0.5 }.x1;
        }
        return s;
      });
      const rect = AABB.rect();
      t.measure("aabb.edgesInto", n, readPosBox, () => {
        let s = 0;
        for (let i = 0; i < n; i++)
          s += AABB.edgesInto(pos[i], box[i], rect).x1;
        return s;
      });
      const ra = ctx.ra;
      const rb = ctx.rb;
      const readRects = () => {
        let s = 0;
        for (let i = 0; i < n; i++) s += ra[i].x1 + rb[i].x1;
        return s;
      };
      t.measure("aabb.overlap", n, readRects, () => {
        let s = 0;
        for (let i = 0; i < n; i++) s += AABB.overlap(ra[i], rb[i]) ? 1 : 0;
        return s;
      });
      t.measure("aabb.overlap.inline", n, readRects, () => {
        let s = 0;
        for (let i = 0; i < n; i++) {
          const a = ra[i];
          const b = rb[i];
          s +=
            a.x2 > b.x1 && b.x2 > a.x1 && a.y2 > b.y1 && b.y2 > a.y1 ? 1 : 0;
        }
        return s;
      });

      const map = ctx.map;
      const keys = ctx.keys;
      t.measure("map.get", n, Test.read(n, ctx.keyVals), () => {
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
      ctx.vals = Test.vals(n);
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
      const readVals = Test.read(n, vals);
      const empty = Test.empty(n);

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
      ctx.vals = Test.vals(n);
      ctx.objs = new Array(n);
      for (let i = 0; i < n; i++) ctx.objs[i] = { v: i };
      ctx.typed = new Float64Array(n);
      for (let i = 0; i < n; i++) ctx.typed[i] = i;
    },
    verify(ctx, t) {
      const n = N;
      const vals = ctx.vals;
      const readVals = Test.read(n, vals);
      const empty = Test.empty(n);
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
]);
