# GMRT

## Overview

G.E.M.S. targets GMRT — GameMaker's next-generation runtime — and nothing else: all game logic is JavaScript, which only GMRT executes (the legacy GMS2 runtime silently drops it). The toolchain is pinned to GMRT 0.20 by `gm-options.json`.

The JS↔GML boundary is direct: GML built-ins are in scope from JS, and a JS object/array IS a GML struct/array — pass them straight to built-ins (`json_stringify(jsObj)`, `variable_struct_get_names`/`_get`/`_exists`, `is_array`/`array_length` all operate on JS data directly, nested included).

This file is the quirk reference for that target — GMRT is young: it miscompiles or chokes on several standard JS forms, and a built-in can diverge from the contract the manual states for it (CLAUDE.md → Manual). Everything below is verified against 0.20 (A/B-run vs GMS2, Node as the ES2020 oracle for JS) — re-audit this document on a runtime upgrade. A tracked issue carries its ticket as a bare [#00000] on the tracker, `YoYoGames/GameMaker-Bugs` (the form: CLAUDE.md → Citations); [unreported] marks a verified divergence with no ticket of its own — one closing with a why is a decision not to file, not an omission.

Never record a ticket's state here — not open/closed, not "in QA", not "fixed in 0.21": state is owned by the tracker and rots the moment upstream moves, and a stale "fixed" reads as permission to use a built-in that still bites on the pinned runtime. Every entry is live on 0.20, so it needs no state to be actionable.

Working rules: avoid the quirks, don't "clean up" code back into them, and leave a one-line comment where a quirk forces an unusual idiom so it isn't "fixed" back. Codegen is name-sensitive ([#15597]'s built-in collisions, the per-unit budgets), so verify any identifier rename by running the game, never by compiling alone. Recording a new one: Recording a Quirk (below).

Recording a Quirk (the maintenance workflow) comes first, then the entries organised by failure phase: Runtime and Build Issues (what breaks a build, a built-in, or running JS) · Known Incompatibilities (the changelog's declared gaps) · Differences from ES2020 (JS spec features unimplemented or behaving like GameMaker built-ins). This file is a deny-list: it records what to avoid, never an allow-list of what works — a built-in absent from it is simply usable, and "it works now" is history, which git owns. Area-scoped rules (UI first-frame guards, camera/cursor conversion, shader conventions) live at their area's owner (its JSDoc — e.g. `UI.insert`, `Camera.cursorWorld`, `sh_meshlit`), not here — this file keeps only what can bite in any script.

## Recording a Quirk

Before logging a new quirk, prove it's real: `gm-cli manual read <fn>` (it may be documented behaviour), then `gh search issues --repo YoYoGames/GameMaker-Bugs` (it may already be ticketed — thumbs-up/comment, don't duplicate). An entry states the rule, its ticket, and the safe idiom — never a ticket's state (Overview) or discovery narration (CLAUDE.md → Record). A divergence that reproduces on both runtimes is general GameMaker behaviour, not a GMRT bug — if it needs a rule, record it closing with its why-not-filing; file nothing.

An agent NEVER creates a tracker issue — only the IDE's reporter can attach the reproduction project; a "Worth filing" closer hands the entry to the user, never an instruction to file. When a ticket's state matters (planning an upgrade, deciding whether to re-probe), read it from the tracker: `gh issue view <number> --repo YoYoGames/GameMaker-Bugs`.

## Runtime and Build Issues

What fails loudly, by phase: at runtime, a built-in diverging from its manual contract or JS that hangs, corrupts a value, or returns garbage; at build, JS the compiler refuses or a compilation unit it corrupts.

### Runtime

- [#15546] `merge_colour` FLOORS its channel math where GMS2 rounds — re-merging a packed color into itself every frame drifts it to black, and a rounded packed-int lerp freezes on sub-1 steps (both acute at high FPS). One-shot merges are fine (`Color.merge`); animate a color as float r/g/b channels, rounding only the final `make_colour_rgb` (see `UIButton._easeColor`).
- [#14737] the fixed-function alpha test (`gpu_set_alphatestenable`/`_ref`) is INERT — a transparent fragment still writes depth, so a sprite's empty pixels occlude what's behind (the 2.5D billboard bug). `discard` in the fragment shader instead — `sh_meshlit`'s `u_alphaRef`, cutting on the TEXEL alpha so a dimmed/tinted entity stays visible; `RenderBillboard` sets it, `RenderMesh._setupLights` pins it 0. The commented-out `gpu_set_alphatestenable(true)` in `obj_game` Create_0 records the dead end — leave it.
- [#15140] `rectangle_in_rectangle` misses real overlaps (containment direction-swapped, cross-shaped overlap → `0`) and is no faster from JS anyway — overlap tests stay on `AABB.overlap`. `point_in_rectangle` is unaffected; the UI hit-testing use is fine.
- `gpu_set_scissor` quirk cluster — it is the UI clip mechanism (`UIElement._drawClipped`). The rules:
  1. Coords are render-target PIXELS, not GUI units — convert by `k = target/gui`. ([#11377] — intended behaviour.)
  2. [#15476] `window_get_width/height()` and the application surface lag the back buffer on a resize — a scissor sized from a raw query can overflow the target (fatal error). Size clips from `Display.clipW/clipH`.
  3. The scissor is not cleared between frames — `UI.draw()` re-anchors it to the full target at the start of each frame.
  4. `gpu_get_scissor()` returns `{0,0,0,0}` when unset — treat it as a nesting parent only when `w`/`h` are positive, and never restore a saved `{0,0,0,0}`; reset to the full target instead.
  5. [#6523] setting the scissor does NOT flush the pending vertex batch: `draw_flush()` at the END of `_drawClipped` (a start-of-clip flush corrupts the clip), and the preceding drawer must end with a flushed primitive (`UITabs.onDraw`'s trailing re-stroke — leave it; `CraftingUI` avoids clips in its master-detail row). `draw_flush` is manual-flagged debug-only but is the only flush primitive — once per clip per frame is fine; a text-only clip can compute the visible substring itself (`UIInput.onDraw`).
- [#15095] a `Map` iterator's internal pointer never advances — `next()` yields the first entry with `done: false` forever, so `for...of` (or any `next()`-driven loop) hangs the game: no exception, `game.log` just stops. Keep parallel arrays and index-loop (see `World._keys`/`_storages`). `Set` iteration, array/string `for...of`, and `for...in` over a plain object are fine.
- [#15549] short-circuit `&&`/`||` corrupts its LEFT operand — codegen writes the operator's result back into the operand's local (`let b = true; const r = b && false;` → `b === false`); only `?:` is safe. Never reuse a variable after it has been a `&&`/`||` left operand — cache the object and read the property live (`PlatformerController.update`).
- [#15563] `toUpperCase()`/`toLowerCase()` return garbage Unicode, even for ASCII; GML `string_upper`/`string_lower` are correct. Map case via char codes (see `VirtualKeyboard._upper`, `InvTable.lower`).
- [unreported] `working_directory` is the BUILD asset dir (lost on a rebuild), not the manual's save dir — root persistent paths on `game_save_id` (`%LOCALAPPDATA%\gems\`). A RELATIVE path lands beside `Runner.exe`; a bare filename through the `File` APIs still resolves to the save dir. Worth filing — no existing ticket; distinct from the sandbox refusals [#15395]/[#15397].
- [unreported] `screen_save` auto-creates a subdir path's directories, but a BARE filename logs a bogus `Failed to create directories for ''` error — the PNG is still written. GMRT-only noise: don't chase it, don't "fix" a subdir path back to bare. Worth filing — no existing ticket; not [#11067], a different `screen_save` report.
- [unreported] `fps` and `fps_real` always read `0` from JS (other builtin globals read live; GML-side untested). Measure instead: count frames between `current_time` samples ≥1s apart (see `DebugGeneral`'s Perf section).
- [unreported] `display_set_timing_method` is INERT (the getter always reports `tm_countvsyncs`), so the manual's `tm_systemtiming` uncap TIP is a dead end — uncap with a large `game_set_speed`, which is honored in both directions (see `Display.UNCAPPED_FPS`). Worth filing — no existing ticket; the GMS2-era #14499/#13918 are different failures.
- [unreported] `console.log` and `show_debug_message` are separate output streams — their relative order in a captured log is NOT execution order. When order matters stay on ONE API, or use `Log` (file-backed, strictly ordered). Low-severity tooling; the six-line alternating probe is the repro if filing.

### Build

- [#15079] no optional chaining (`?.`) — any `a?.b` crashes the compiler with no file/line. Write the guard explicitly. Nullish `??`/`??=` are fine (exact null/undefined-only semantics).
- [#15566] no empty `for` initializer — `for (; c<n; c++)` in a `.js` file fails the BUILD. Add an initializer or use `while`.
- [#15065] a class with ~50 methods corrupts its compilation unit — the symptom varies with the exact count, and the enclosing unit's own body counts against the budget. Split into collaborators, free functions, or composition (as `UIElement`/`Item` do). Same per-unit budget defect as #15564 at class scale; when the ceiling lifts, `UIElement`'s commented-out flexpanel setters can return.
- [#15067] class inheritance is broken: `super.method()` is a compile error, and a subclass silently skips its BASE class's field initializers/constructor (its own do run). Use composition (a flat class + `components: []` queried by `instanceof`); assign anything a base would have initialized in a method that runs (e.g. `create()`).
- [#15564] a file with roughly 200+ top-level `function` declarations corrupts its compilation unit — the game faults at startup. Assign explicitly (`globalThis.X = function X(…)`) and keep files small (why the GemsUI kit is split). Same per-unit budget defect as #15065 at file scale.

## Known Incompatibilities

The gaps GMRT's changelog itself declares — upstream-known, listed so nobody re-probes them.

- Prefabs
- Video playback (other platforms)
- SVG Assets
- flexpanel_node_get_measure() / flexpanel_node_set_measure()
- vertex_buffer_exists() / vertex_format_exists()
- application_surface_is_draw_enabled()
- Lots of error spam from SDL

## Differences from ES2020

The spec boundary rather than broken features (those are Runtime and Build Issues): a feature GMRT doesn't implement — using it throws or faults — or one that behaves like an existing GameMaker built-in rather than ES2020 (Node as the oracle); a few entries note where the spec itself leaves room.

- [#15567] a `Map`/`Set` keyed by an OBJECT (asset ref, array, or plain object) crashes natively — hard process death, nothing logged (minimal: `new Set().add({})`); string/number keys are fine. For object-identity membership use parallel arrays + an `===` identity scan (see `SpriteMeta`, `Json._onPath`). (Distinct from #15095, the iterator hang.)
- [#15194] no array destructuring in a `for...of` header (`ReferenceError` at runtime) — destructure inside the loop body. (Object destructuring and a `.forEach(([a,b]) => …)` param are fine.)
- [#15565] `JSON.stringify` faults natively on any nested object/array (flat is fine, though pretty-printed with `1` → `1.0`). Serialize with GML `json_stringify()` — a JS object IS a GML struct (the interop rule — Overview) — and read back with native `JSON.parse` (only stringify faults); the `Json` codec adds ref-tagging + cycle-safety for save-game bundles.
- [#15593] `Array.prototype.sort` truncates the comparator's return toward zero AND is not stable — ties are actively reordered, so a fractional difference comparator shuffles near-equal items arbitrarily. Return a SIGN (`a < b ? -1 : a > b ? 1 : 0`, see `Raycast.castAll`) and break ties explicitly in the comparator when their order matters. (GML `array_sort` truncates too — there it's documented.)
- [#15597] a top-level/event-body `var` named after a GML built-in resolves to the BUILT-IN (built-ins are in scope from JS — the interop rule, Overview) — the `var` binding never exists, so every read yields the function or constant (garbage arithmetic, `Invalid call target`). `let`, `const`, parameters, and `var` inside a function body all shadow correctly. The project uses `let`/`const` exclusively — never introduce `var`, and prefer non-colliding names regardless.
- [unreported] Top-level bare `const` isn't visible to other scripts — scoping is module-like per file, and a `.js` GMScript's top-level code auto-runs at startup; share via `globalThis.Name`. Not filing — coherent module semantics, not a bug (the hoisting FAILURE past ~200 top-level functions is the bug — [#15564], Runtime and Build Issues).
- [unreported] No TDZ for `const` — a read above the declaration yields `undefined` where ES2020 mandates a `ReferenceError` (`let` throws correctly; the hoisted `const` does still shadow a same-named built-in). Keep declarations above first use; `checkJs` flags straight-line use-before-declare.
- [unreported] Chained 32-bit bitwise (an xorshift PRNG) computes silently WRONG values — GMRT bitwise uses GML 64-bit numbers, not ES2020 ToInt32; single ops (`EntityID`'s packing) are fine. Use float math: `Utils.hash2` (sine position hash) or a Park–Miller LCG (`s = (s*48271) % 2147483647`). Not filing — a consequence of GMRT's number model, themed at [#15060]/[#11835]; comment there rather than filing new.
- [unreported] `Math.random()` draws from GML's global generator stream — `random_set_seed(k)` fixes its output, and every call shifts each following `irandom`/`random` draw; `uuid()`'s unpredictability rests on the boot `randomize()` in `obj_game` Create_0. Keep reproducible data on `Utils.hash2` (no shared stream) and never pin the global seed while other consumers draw. (Adjacent trap: `randomize(k)` silently discards `k` — the seeding call is `random_set_seed(k)`.) Not filing — ES2020 leaves the algorithm implementation-defined.
- [unreported] JS `Date` is UTC-pinned and second-granular — `getTimezoneOffset()` is `0`, the local getters read UTC (the shift-by-offset idiom is a silent no-op), and `Date.now()`/`getTime()` zero the milliseconds; `toISOString()` is well-formed. Local wall clock lives on the GML side (`current_*`, `date_current_datetime()` + `date_get_*`), sub-second stamps on `current_time` — `Screenshot._autoname` composes both. (`date_datetime_string` is unusable regardless — mojibake on a non-ASCII locale.) Worth filing — no existing ticket.
- [unreported] An asset ref reflects as an empty object (`typeof` `"object"`, `is_struct` even `true`, `Object.keys` `[]`) — a generic deep copy silently turns a stored handle into `{}`, and JS reflection cannot identify one. Discriminate plain data by `v.constructor === Object`, pass refs through by reference (see `EntityPreset._clone`), and asset-validate with GM functions (`sprite_exists`/`asset_get_type`). Likewise documented: `asset_get_index` returns a handle, not a number. Not filing — documented handle behaviour, shared by both runtimes.
- [unreported] A GML pointer value is NEVER `===`-equal in JS, not even to itself (`h === h` → `false`; probed with `dbg_view` handles) — an identity scan over stored pointers, sound for asset refs and JS objects ([#15567]), silently matches nothing; an emptiness check (`h !== undefined`) still discriminates (see `Debug._handles`). Test a pointer only through its owning API predicate (`dbg_view_exists`, `surface_exists`, …).
- [unreported] A `static` field initializer can't reference its own class — `static x = ClassName.y` throws at load and `static x = this.y` silently reads `undefined`; only a literal is safe. Use a static method, or assign `Foo.x = …` after the class body; referencing another already-loaded class is fine. Not filing — static class fields are ES2022, outside GMRT's ES2020 target.
