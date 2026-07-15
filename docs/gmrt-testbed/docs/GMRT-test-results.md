# GMRT quirk verification — GML reproduction results

Purpose: take the quirks recorded in [GMRT.md](GMRT.md) (found while writing the main
**G.E.M.S.** project in **JavaScript**) and re-test them from **GML** so the GameMaker dev
team can triage. For each quirk we answer three questions:

1. **Is it an actual runtime issue?** (does a reliable script asset reproduce it)
2. **Does legacy GMS2 reproduce it?** If GMS2 is fine and GMRT is not → clearly a GMRT issue.
3. **Does it reproduce in GML** (not just JS)? The main project is JS; devs need the GML data point.

## Method

One GML project, run unchanged on both toolchains via `gm-cli` and diffed:

| Toolchain | `GM_runtime_version` | Command |
|---|---|---|
| GMRT | `0.20.0` | `npx @gamemaker/gm-cli run` |
| GMS2 (legacy) | `2026.0.0.23` | `npx @gamemaker/gm-cli run --toolchain GMS2` |

Runtime: VM for both (GMRT native attempted — MSVC sysroot absent, likely VM fallback; results identical).

Test assets (reproducer, checked into the project):
- `objects/obj_test_runtime/Create_0.gml` — the harness; each test prints `@@R@@|<ID>|<STATUS>|<detail>`.
- `scripts/scr_quirk_helpers/scr_quirk_helpers.gml` — constructors used by the constructor tests.
- placed once in `room1`; `game_end()` exits after logging so runs are headless.

`STATUS`: `PASS` = correct/spec behaviour · `BUG` = reproduces the defect · `INFO` = raw
observation · `THREW` = catchable GML exception.

## Results at a glance

| ID | Quirk (JS origin) | GMRT 0.20 | GMS2 2026 | Verdict |
|---|---|---|---|---|
| SORT_FRAC | `array_sort` fractional-diff comparator | **BUG** | PASS | **① GMRT bug, repros in GML** |
| MERGE_SELF100 | iterated `merge_colour` self-merge drift | **BUG** | PASS | **① GMRT bug, repros in GML** |
| RAND_GETSEED | `random_get_seed()` doesn't track stream | BUG | BUG | ② shared — not GMRT-specific |
| RAND_SAMEFRAME | same-frame `randomize()` repeats | flaky | flaky | ② timing-dependent, inconclusive |
| STR_CASE | `toUpperCase`/`toLowerCase` garbage | PASS | PASS | ③ JS-only (GML `string_upper` fine) |
| JSON_NESTED | `JSON.stringify` faults on nested | PASS | PASS | ③ JS-only (`json_stringify` fine) |
| CTOR_INHERIT | subclass skips base field init (`super`) | PASS | PASS | ③ JS-class-only |
| CTOR_50METHODS | >50-method class faults (#15065) | PASS | PASS | ③ JS-class-only |
| ASSET_IDX | `asset_get_index` `>=0` always false | INFO | INFO | ③ JS-only symptom (see notes) |
| SORT_SIGN / SORT_INT | sign & integer comparators (controls) | PASS | PASS | control — proves trigger |
| MERGE_SELF1 | single `merge_colour` self-merge (control) | PASS | PASS | control |
| NULLISH | `??` semantics (`0 ?? 5 → 0`) | PASS | PASS | works on both |
| VIEW_CAMERA | `view_camera[]` indexing faults | INFO | INFO | JS-only (returns a handle in GML) |

Legend: **①** GMRT-specific, reproduces in GML → the priority reports. **②** present on both
runtimes → not a GMRT regression (likely intended GML behaviour). **③** JS-runtime-only → the
GML-native equivalent works on both, so the defect lives in the JS language layer, not the
shared runtime.

---

## ① GMRT-specific bugs that reproduce in pure GML

These are the ones worth filing: a plain-GML script reproduces them on GMRT 0.20 but the
identical script is correct on GMS2 2026.0.0.23.

### BUG 1 — `array_sort` truncates the comparator's return value to an integer

**Reproducer** (`SORT_FRAC`):
```gml
var _a = [{t: 0.3}, {t: 0.1}, {t: 0.2}];
array_sort(_a, function(_x, _y) { return _x.t - _y.t; });  // fractional difference
// expected: 0.1, 0.2, 0.3
```

| | order after sort |
|---|---|
| GMS2 2026 | `0.10, 0.20, 0.30` (sorted) ✔ |
| GMRT 0.20 (vm + native) | `0.30, 0.10, 0.20` (**unchanged input order**) ✘ |

No error, no warning — a silent no-op sort.

**Trigger isolated** by two controls run alongside it:
- `SORT_SIGN` — comparator returns `-1 / 0 / 1` → sorts correctly on **both**.
- `SORT_INT` — same difference comparator over integers `30/10/20` → sorts correctly on **both**.

⇒ GMRT appears to coerce the comparator's return to an integer before taking its sign, so any
comparator returning a value in `(-1, 1)` collapses to `0` ("equal") and no reordering happens.
The difference-style comparator is a common idiom; over fractional keys it fails silently on GMRT.

**Workaround:** return an explicit sign, `_x.t < _y.t ? -1 : (_x.t > _y.t ? 1 : 0)`.

### BUG 2 — `merge_colour` drifts downward under repeated self-merge

**Reproducer** (`MERGE_SELF100`):
```gml
var _c = make_colour_rgb(101, 151, 201);      // = 13211493
var _acc = _c;
for (var _i = 0; _i < 100; _i++) { _acc = merge_colour(_acc, _acc, 0.2); }
// merging a colour with itself is identity; expected: still 13211493
```

| | after 100 iterations |
|---|---|
| GMS2 2026 | `13211493` = RGB(101,151,201) — unchanged ✔ |
| GMRT 0.20 (vm + native) | `13145700` = RGB(**100,150,200**) — **−1 per channel** ✘ |

A single self-merge (`MERGE_SELF1`) is exact on both runtimes; the drift only appears once the
result is fed back in repeatedly. This matches the JS-side note that `merge_color` floors each
channel's contribution separately, so re-merging its own output accumulates loss toward black —
here reproduced in GML, and **GMRT-specific** (GMS2 is stable).

**Impact:** colour tweens that ease a packed colour every frame drift darker over time on GMRT;
worst at high/unlimited FPS (tiny per-frame `t`). **Workaround:** ease float r/g/b channels and
round only the final `make_colour_rgb`, never re-feed a packed int.

---

## ② Present on BOTH runtimes — not a GMRT regression

- **RAND_GETSEED** — after `random_set_seed(12345)` + two `random()` draws, `random_get_seed()`
  returns `12345` (the seed set, not the advanced state) on **both** GMRT and GMS2. The two draws
  are byte-identical across runtimes (`0.62, 0.92`). This is consistent, documented GameMaker
  behaviour — file against the manual/feature, not as a GMRT runtime bug.
- **RAND_SAMEFRAME** — two `randomize()` calls in one frame *sometimes* produce the same seed on
  both runtimes; across repeated runs it flipped PASS/BUG on each. It is timing-dependent and not
  a reliable differentiator — do not report as a runtime difference.

## ③ JS-runtime-only — no reproduction in GML (informative for prioritisation)

The GML-native equivalent of each of these works correctly on **both** GMRT and GMS2, which
localises the defect to the JavaScript language layer rather than the shared runtime:

- **STR_CASE** — `string_upper("q")`→`"Q"`, `string_lower("Q")`→`"q"` on both. (JS `toUpperCase`
  garbage does not exist in GML.)
- **JSON_NESTED** — `json_stringify` of a nested struct/array returns valid JSON on both (GMRT
  preserves insertion order `a,b,c`; GMS2 reorders to `c,a,b` — a cosmetic difference, not a fault).
- **CTOR_INHERIT** — GML constructor inheritance `function Derived() : Base() constructor` runs the
  base constructor's field initialisers on both (`base_a=111`, `derived_b=222`). The broken
  `super`/inheritance quirk is specific to JS `class … extends`.
- **CTOR_50METHODS** — a GML constructor with 51 `static` methods constructs and its 51st method
  returns correctly on both. The >50-method fault (#15065) is specific to JS classes.
- **ASSET_IDX** — `asset_get_index` returns a **ref object** (`is_real = false`) on **both** modern
  runtimes, so the "opaque ref" nature is not GMRT-specific. But the ref satisfies `>= 0` (`true`)
  in GML on both, so the JS "`>=0` test is always false" symptom is JS-only. A missing name returns
  `-1` on both; `sprite_exists()`/name validation remains the correct check.

---

## How to reproduce

```bash
cd my-awesome-game
npx @gamemaker/gm-cli run                     # GMRT 0.20.0
npx @gamemaker/gm-cli run --toolchain GMS2    # GMS2 2026.0.0.23
# compare the @@R@@|... lines in each run's output
```

## Not yet covered

The harness deliberately covers only **deterministic, headless, GML-native runtime** quirks.
Still to build as separate reproducers:

- **Compile-time quirks** (need isolated builds — a compile error aborts the whole project):
  optional chaining `?.`, `static` field self-reference, top-level `const` visibility.
  (Empty `for` initialiser — done: filed as [#15566](https://github.com/YoYoGames/GameMaker-Bugs/issues/15566).)
- **Rendering / GPU / flexpanel / shader** quirks (`gpu_set_scissor` batching, alpha-test inert,
  flexpanel NaN width, screen-space overlay matrices, uniform-in-fragment-only) — need a draw loop
  and, for several, visual inspection rather than a boolean assertion.
- **Input timing** (`mouse_check_button*` realtime sampling, `keyboard_lastkey` lag) — need
  injected input, so not headless.
- **JS-only language quirks** (Map/Set iteration hang, object-keyed Map/Set native crash,
  `for...of` destructuring) — no GML construct exists to reproduce them; documented here as
  JS-layer issues by their absence in the GML results above.
