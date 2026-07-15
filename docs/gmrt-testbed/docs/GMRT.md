# GMRT-Safe Idioms

> **Archived 2026-07-15** — the `my-awesome-game` test-bed project was deleted after the re-audit finished; only these markdown write-ups were kept. Links to `../repros/gmrt-js-array-sort-comparator/` resolve to the archived README/GMRT.md write-ups, but the repro *projects* and `../demos/` are gone — rebuild a sample (scaffold recipe: `gm-cli init --no-interactive --name <slug> --no-ai --no-actions --template blank --toolchain GMRT`) if filing. The live, maintained quirk reference is [../../GMRT.md](../../GMRT.md).

Runtime-quirk reference for GMRT, copied from the **G.E.M.S.** project to re-test in `my-awesome-game`. Verified against **GMRT 0.20**; re-check against newer runtimes. Code references (`UIElement`, `World._keys`, …) point at G.E.M.S. source — they name the idiom, not this project.

Organised by ownership/status, so it doubles as a reporting worklist:

1. **Project idioms** — our design/workarounds, not GMRT defects.
2. **GMRT runtime bugs** — to file (currently none; see triage).
3. **JavaScript / ES2020 gaps** — JS-layer divergences to file.
4. **Known issues** — officially unsupported, or already ticketed.
5. **Easy to confuse** — investigated, not bugs (fixed / documented / out of scope).

> **Before logging a new quirk anywhere below, prove it's real.** Many past entries mistook documented behaviour for a defect. **(1)** `gm-cli manual read <fn>` — the contract often explains it. **(2)** `gh search issues --repo YoYoGames/GameMaker-Bugs "<keyword>"` — it may already be filed (thumbs-up/comment, don't duplicate). Only when both come up empty is it a genuine unreported quirk.

---

## 1. Project idioms

How this project stays GMRT-safe. Not defects, not things to report.

- **RNG built-ins work; two behaviours are documented GameMaker quirks (identical on GMS2), not GMRT bugs** — `random_get_seed()` returns the last seed *set*, not the advanced stream position (so only capture-at-area-start works, which is all the manual promises); and a time-seeded `randomize()` can return the same seed twice in one frame. Fine for one-shot randomness; deterministic worldgen uses the hand-rolled MINSTD (`Rand`) for position hashing + per-chunk streams.
- **`asset_get_index(name)` returns an asset *handle*, not a number** (documented; `is_real()` is false on both runtimes, `-1` if missing). Validate with `sprite_exists()`/`object_exists()` — the documented contract.
- **Read the view rect from the `Camera` instance's own fields, not `camera_get_view_*`** — the project drives the view by matrix, so `camera_get_view_*` returns 0. (`view_camera[]` indexing itself works fine on both runtimes.)
- **`mouse_x`/`mouse_y` are wrong under a pitched matrix camera** (off by 100+ world px). Convert the cursor yourself — `Camera.unproject(sx,sy)` / `Camera.cursorWorld()` — and latch once per frame. Cursor-over-entity tests hit the ground plane (an entity's feet).
- **Guard NaN width before drawing filled UI geometry** — on the first frame after a scene transition the flexpanel layout isn't computed, so `getLayoutPosition()` returns NaN and drawing faults. Test `!(pos.width > 0)` (not `<= 0`; `NaN <= 0` is false). Skip text widgets — they draw from `pos.left/top`.
- **Resolve `I18n.font(key)` at draw time, never cache the handle** — a language switch `font_delete()`s old handles (a cached one dangles) and an undeclared key falls back to the current font. Widgets take `font` as a handle OR a key and resolve live: `typeof this.font === "string" ? I18n.font(this.font) : this.font`.
- **Screen-space overlay matrices: up `+1` AND negative ortho height** — a surface-pixel ortho pass (`RenderLighting` composite, `RenderWeather`) needs `matrix_build_projection_ortho(w, -h, 0, 2)`. The overlay path has an inherent Y-flip; negating the UP vector instead is a 180° roll that X-mirrors off-center content.
- **Custom shaders run — guard them** — `shaders_are_supported()` + `shader_is_compiled(...)` before `shader_set`, with a fallback. A shader on an *untextured* primitive reads `gm_BaseTexture` as black, so compute from uniforms, don't sample. (`sh_meshlit` is the one world shader.)
- **Declare each shader uniform in exactly ONE stage** (general GameMaker behaviour, not a GMRT bug — same on GMS2). A single-stage uniform works; the same name in *both* stages splits — `shader_get_uniform` returns one stage's location, the other reads 0 (a "working" shader that ignores its flag). Pass vertex→fragment via a varying. Repro: `sh_vsh_uni`/`sh_fsh_uni`/`sh_both_uni`.
- **Poll each mouse edge-query once per frame and share it** (`UIPointer.poll()` latches `pressed`/`released`/`down`/`wheel`); don't derive edges from the button level. (The "sampled realtime" rationale is unverified — but poll-once is good practice regardless.)
- **`keyboard_lastkey` is by design the *previous* frame's key** (documented) — don't use it for a same-frame rebind; it binds the stale key. Scan the keycode range for the one live this frame (`UIRebind._scanKey`, 8..255).
- **flexpanel: style mutation works; follow the design rule** — set fixed layout props once at construction; drive runtime change with draw-time offset/clip math; show/hide with `child.enabled`, not `display`. Structural `insertChild`/`removeChild` → `markDirty` reflows reliably; `UIText`/`UIRichText` self-size via runtime `flexpanel_node_style_set_*`. (Measure-callback self-sizing is unsupported — §4a.)
- **JS objects/arrays ARE GML structs/arrays — pass them straight to GML functions.** In GMRT a JS object literal is a GML struct and a JS array is a GML array, so GML built-ins operate on JS data directly: `json_stringify(jsObj)`, `variable_struct_get_names`/`_get`/`_exists`, `is_array`/`array_length`, etc. Verified: `json_stringify({a:1,b:[1,2,3],c:{d:"x"}})` → `{"a":1.0,"b":[1.0,2.0,3.0],"c":{"d":"x"}}` — the workaround for the JS `JSON.stringify` nested crash (§4b, [#15565](https://github.com/YoYoGames/GameMaker-Bugs/issues/15565)).
- **JavaScript events are GMRT-only — the GMS2 toolchain silently ignores `.js`.** A `.js` event (`scriptSource` = `Create_0.js`) runs on GMRT but is **dropped without any build error or warning** on GMS2 — even when the event has *only* a `.js` and no `.gml`. So any `.js`-backed logic is dead code under GMS2, with nothing to flag it; keep dual-runtime logic in `.gml` (or add a `.gml` fallback event). Switchable demo: [`demos/js-vs-gml-runtime`](../demos/js-vs-gml-runtime/) (`gm-cli run` vs `run --toolchain GMS2`).

## 2. GMRT runtime bugs

Genuine GMRT runtime/codegen defects (would affect GML too, or are miscompiles/faults). Before filing, confirm it reproduces on GMRT but **not** GMS2 — a divergence on both is general GameMaker behaviour.

> **Currently none.** All three former entries were reclassified after testing:
> - Fixed-function alpha test → already ticketed **#14737** → §4b.
> - Top-level `const` / function-hoisting fault → JavaScript-only; hoisting fault now filed **#15564** → §4b.
> - "`.vsh` uniform never receives its value" → not a GMRT bug (repro's on GMS2 too) → §1.

## 3. JavaScript / ES2020 gaps

Where GMRT's JS runtime diverges from ES2020 (baseline = Node/V8, not GMS2). File as **[JavaScript]** items; verify against Node first. **3a** = clear bugs (crash / miscompile / garbage). **3b** = follows GML rules instead of ES2020 — a policy question.

### 3a. GMRT JS bug

> **Previously listed bugs all filed (Jul 2026) → §4b:** `Map`/`Set` object-key crash (#15567), empty `for` build fail (#15566), `toUpperCase`/`toLowerCase` garbage (#15563), `JSON.stringify` nested crash (#15565), >200 top-level functions fail to hoist (#15564).

- **`Array.prototype.sort` intermittently throws `TypeError: Invalid call target`** — GMRT's JS compiler emits invalid code for some `.sort()` calls, so a perfectly valid sort crashes at runtime (the same source runs on Node and every browser). The trigger is fragile: it flips between crashing and running on edits with no meaning in JavaScript — variable *names* alone, an inline array literal vs a variable, integer vs non-integer values, or any unrelated statement placed before the sort — which is itself the evidence it's a code-generation defect, not semantics. The comparator's return value is irrelevant (an integer `sign`-style comparator crashes the same way), so this is **distinct from the fractional-comparator truncation in §3b**. Because the trigger depends on undefined optimizer behaviour there is no dependable source-level workaround — the "runs fine" variants only happen to avoid it. _Verified GMRT 0.20 / gm-cli 2.2.0, Windows 11; unreported — file as **[JavaScript]**. Repro: [repros/gmrt-js-array-sort-comparator](../repros/gmrt-js-array-sort-comparator/) — two structurally identical Create scripts differing only in variable names, one crashes ([GMRT.md](../repros/gmrt-js-array-sort-comparator/GMRT.md))._

### 3b. Not ES2020 but GMS2 semantics

Diverges from ES2020 because GML rules are in force — a policy question, not a plain bug.

- **`array_sort`/`Array.sort` truncate a fractional comparator return on GMRT** — the same GML `array_sort(arr,(a,b)=>a-b)` **sorts on GMS2 but is a no-op on GMRT** (`[0.3,0.1,0.2]` unchanged); GMRT's JS `Array.sort` truncates too (`[0.1,0.3,0.2]`), while standard JS ([ES2020 §Array.prototype.sort](https://tc39.es/ecma262/2020/#sec-array.prototype.sort) reads the comparator's return by *sign only*) honors it like GMS2. Return an explicit sign (`sign(a-b)` / `Math.sign(a-b)` / `a<b?-1:a>b?1:0`). _Verified live 0.20 vs GMS2; unreported. Two filing angles: the GML side as a **descriptive GMS2-vs-GMRT divergence** (JS is seasoning), no bug-vs-docs verdict — GMRT matches only the `array_sort` manual's letter ([compat-js-array-sort-comparator.md](compat-js-array-sort-comparator.md)); the JS side as a **[JavaScript] ES2020-conformance report** bundling this with the stability deviation below ([repro README](../repros/gmrt-js-array-sort-comparator/README.md))._
- **JS `Array.prototype.sort` is not stable on GMRT** — ES2020 *requires* a stable sort (equal elements keep their input order); GMRT reorders them even with a plain integer comparator: an always-`0` comparator on `[1..12]` returns `[6,7,2,8,4,9,1,10,5,11,3,12]` instead of the input unchanged. Node/browsers conform. GML `array_sort` is *documented* as a non-stable `qsort` and GMRT's JS sort appears to inherit that algorithm — but `Array.prototype.sort` has no such licence in the spec (and the two produce different orders on the same input, confirming they're separate functions). **No workaround** — unlike truncation, a sign-returning comparator doesn't help. _Verified GMRT 0.20 / gm-cli 2.2.0 vs Node — the repro's guarded `Create_0.js` runs unmodified in both (`gm-cli run` vs `node objects/obj_repro/Create_0.js`); unreported — file as **[JavaScript]** together with the truncation deviation ([repros/gmrt-js-array-sort-comparator](../repros/gmrt-js-array-sort-comparator/), [README](../repros/gmrt-js-array-sort-comparator/README.md))._
- **Chained 32-bit xorshift PRNGs compute silently wrong values** — GMRT bitwise ops use GML 64-bit semantics, not ES2020 ToInt32, so an overflowing `s ^= s<<13; …` chain diverges from Node (from the 2nd round on; nothing throws). Use bitwise-free integer math — a Park–Miller MINSTD (`Rand`). (Single bitwise ops are fine.) _Verified 0.20; **not filing** — a deliberate consequence of GMRT's number model (no `int32` type; NaN-boxed doubles/int64), part of the number-semantics theme already open as [#15060](https://github.com/YoYoGames/GameMaker-Bugs/issues/15060) (int64 promotion) / [#11835](https://github.com/YoYoGames/GameMaker-Bugs/issues/11835) (type predicates). Documented as a compat note ([compat-js-bitwise-int32.md](compat-js-bitwise-int32.md))._

## 4. Known issues

### 4a. Officially unsupported

Release notes list these as GMS2 features **not yet supported on GMRT**. Declared, not discovered — don't re-probe or read as project bugs.

- **Prefabs** — GameMaker's asset-prefab feature (unrelated to the project's own `Prefab` registry).
- **Video playback** — `video_*` unavailable.
- **SVG assets** — `sprite_get_number()` returns 0 for an SVG, so frame math underflows and `draw_sprite_ext` throws. Use raster sprites; clamp frame count ≥1, subimg ≥0.
- **`flexpanel_node_get_measure()` / `set_measure()`** — no measure-callback self-sizing; use style mutation (§1).
- **`vertex_buffer_exists()` / `vertex_format_exists()`** — no existence probes; keep your own handle bookkeeping.
- **`application_surface_is_draw_enabled()`** — absent.
- **SDL console spam** — upstream-acknowledged runner noise; ignore unless the game also misbehaves.

### 4b. Reported & ticketed

Filed on `YoYoGames/GameMaker-Bugs` — thumbs-up/comment, don't re-report.

- **[JS] Class with >50 methods faults** ([#15065](https://github.com/YoYoGames/GameMaker-Bugs/issues/15065) — fix in **0.22**/QA) — the 51st method call throws `Invalid call target`. Split the class or use composition.
- **[JS] Class inheritance / `super` is broken** ([#15067](https://github.com/YoYoGames/GameMaker-Bugs/issues/15067), open) — `super.method()` won't compile, and the base constructor/field initializers never run (inherited fields are `undefined`). Use composition; init inherited state in a method that runs.
- **[JS] No optional chaining `?.`** ([#15079](https://github.com/YoYoGames/GameMaker-Bugs/issues/15079), open) — any `a?.b` crashes the compiler. Guard explicitly. (`??` and `??=` are fine.)
- **[JS] `for...of` over a Map iterator hangs** ([#15095](https://github.com/YoYoGames/GameMaker-Bugs/issues/15095), open) — `next()` never advances; the game silently loops forever. Use parallel arrays + an index loop. (`Set` iteration and array/string `for...of` are fine.)
- **[JS] No array destructuring in a `for...of` header** ([#15194](https://github.com/YoYoGames/GameMaker-Bugs/issues/15194), open) — `for (const [a,b] of arr)` throws. Destructure in the body. (`.forEach(([a,b]) => …)` is fine.)
- **[JS] Short-circuit `&&`/`||` corrupts its left operand** ([#15549](https://github.com/YoYoGames/GameMaker-Bugs/issues/15549), open) — `const r = b && expr` writes the result back into `b`. Observable when the result ≠ `b`; only `?:` is safe. Don't reuse a variable after using it as a `&&`/`||` left operand. Repro: `obj_bool_flip_js`.
- **[JS] `toUpperCase()`/`toLowerCase()` return garbage Unicode** ([#15563](https://github.com/YoYoGames/GameMaker-Bugs/issues/15563), open) — even for ASCII (`"q".toUpperCase()` → `"ଊ"`, not `"Q"`); GML `string_upper`/`string_lower` are correct. Map case via char codes (`String.fromCharCode(c-32)`).
- **[JS] >~200 top-level `function`s in one `.js` file fail to hoist** ([#15564](https://github.com/YoYoGames/GameMaker-Bugs/issues/15564), open) — past ~200–250 top-level functions some don't hoist and a call faults at startup (`cannot coerce…` / `unable to access property`). Assign to `globalThis` and keep files small. (Same count-limit family as #15065, but distinct: higher threshold, different error.)
- **[JS] `JSON.stringify` crashes on nested values, pretty-prints flat output** ([#15565](https://github.com/YoYoGames/GameMaker-Bugs/issues/15565), open) — a nested object/array value kills the process (flat `{key: scalar}` survives); flat output is indented, not compact. (`1`→`1.0` too, but that's built-in `json_stringify` behaviour.) **Workaround: call GML `json_stringify()` on the JS object** (a JS object is a GML struct — see the interop idiom in §1), or serialize scalars yourself.
- **[JS] Empty `for` initializer fails the build** ([#15566](https://github.com/YoYoGames/GameMaker-Bugs/issues/15566), open — a **build-time** issue, labelled `gmrt`) — `for (; cond; update)` in a JS event stops the build; no game is produced. Add an initializer or use `while`. (GML builds either way; valid ES2020 on Node.)
- **[JS] Object key/value in `Map`/`Set` crashes the runtime** ([#15567](https://github.com/YoYoGames/GameMaker-Bugs/issues/15567), open) — `map.set(obj,…)` / `set.add(obj)` hard-crash with `Bad optional access` (uncatchable); construction and string/number keys are fine. For identity membership use parallel arrays + an `===` scan. (Distinct from #15095, the `for...of` Map-iterator hang.)
- **[runtime] `merge_colour` floors channels (GMS2 rounds)** ([#15546](https://github.com/YoYoGames/GameMaker-Bugs/issues/15546), open) — easing a *packed* colour int every frame drifts to black (or freezes, if rounded). Ease float r/g/b channels instead and round only at the final `make_colour_rgb`.
- **[runtime] Fixed-function alpha test doesn't apply** ([#14737](https://github.com/YoYoGames/GameMaker-Bugs/issues/14737), open — Ready for QA) — still present in 0.20 (the ticket's version field is a known IDE mislabel). A valid repro needs `ztest` + `alphatest` on + an opaque-pixel sprite: transparent fragments still write depth. Not a project concern — a custom shader disables fixed-function alpha test, so `sh_meshlit`'s `u_alphaRef` does the `discard` itself (the correct approach).
- **[runtime] `gpu_set_scissor` clip quirks** — coordinates are render-target **pixels**, not GUI units; `UIElement._drawClipped` is the combined workaround.
  - [#15476](https://github.com/YoYoGames/GameMaker-Bugs/issues/15476) render-target overflow (fatal) — **fixed in 0.22**; pre-0.22, size clips from `Display.clipW/clipH`.
  - [#6523](https://github.com/YoYoGames/GameMaker-Bugs/issues/6523) scissor doesn't flush the batch — fixed GMS2 2024.8, **not yet on GMRT**; call `draw_flush()` before the scissor restore.
  - [#11377](https://github.com/YoYoGames/GameMaker-Bugs/issues/11377) uses back-buffer pixels, not GUI units — **intended**; multiply x/y/w/h by `window_get_width() / display_get_gui_width()`.
  - Project notes: reset the scissor to the full target each frame (it isn't auto-cleared); never restore a saved `{0,0,0,0}`.

## 5. Easy to confuse — investigated, not bugs

Things that look like GMRT defects but aren't — each was tested and dismissed. **Don't re-investigate or file these.** Tag shows why it's out.

- **[fixed] `static get` with a computed body "miscompiles to a constant"** — reported to freeze at its first value; **does not reproduce on GMRT 0.20** (tested plain, `static` field + getter, and `this._m` reads — all recompute correctly, `before=false`/`after=true`, matching Node). Fixed since first seen on an older runtime. (A static *method* over an accessor stays a cheap defensive habit.)
- **[fixed] An instance `get` whose name shadows a GM built-in "faults on access"** — `get index()`/`get value()`/`get depth()`, including `this._field` getters and a get/set pair, **all work on GMRT 0.20**. Fixed since observed on `UIDropdown`.
- **[not a bug] An asset ref reflects as an empty struct** (`typeof "object"`, `is_struct` `true`, `Object.keys` `[]`) — a GM handle, not an ES2020 object; JS reflection can't identify it (a generic deep copy would flatten one to `{}`). **Check asset refs with GM functions**, not reflection: `sprite_exists(ref)`/`object_exists(ref)` (true only for a live asset of that type, and safely reject non-asset data), `asset_get_type(name)`, `asset_get_index(name)` (`-1` if missing); for data-vs-handle in generic code use `v.constructor === Object`. ([compat-js-asset-ref-reflection.md](compat-js-asset-ref-reflection.md))
- **[out of scope] A `static` field referencing its own class** — `static x = ClassName.y` throws a `ReferenceError` (class binding in TDZ during static init), and `static x = this.y` silently returns the **wrong** value (`0`). A real divergence, but public static class fields are **ES2022**, outside GMRT's **ES2020** target — likely unplanned, so **not filing**. Avoid `static x = value` field syntax; use a static method or assign `Foo.x = …` after the class (ES2015). Note: JS class statics init *eagerly* here (not GameMaker's lazy constructor statics — those are a separate, documented mechanism). ([bug-js-static-field-self-ref.md](bug-js-static-field-self-ref.md))
