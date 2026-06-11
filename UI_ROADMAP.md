# UI Roadmap

A commit-per-item plan for rounding out the GemsUI kit before returning to game
logic. The kit currently ships: `UIButton`, `UIText`, `UIImage`, `UIPanel`,
`UITrigger`, `UISlider`, `UISelect`, `UIInput`, `UITooltip` + the standalone
`Tooltip` singleton. That covers input and static layout; what's missing is most of
the **display**, **container**, and **feedback** widgets games lean on.

Work top-to-bottom — the order respects dependencies, so nothing is blocked when you
reach it. Each numbered item is **one commit**.

## Per-commit checklist

Every component commit follows the same steps (stated once here, not repeated below):

1. **Create the asset** via `gm-cli resourcetool` — never hand-edit `gems.yyp`'s
   resource list. `RESOURCE CREATE TYPE=Script NAME=<X>` → `RESOURCE SET
   EXPR=<X>.scriptSource VALUE=<X>.js` → delete the generated `.gml` stub → write the
   `.js` → set the `.yy` `parent` to the right IDE folder.
2. **Implement** against the `UIComponent` interface
   (`onUpdate(element, block) → bool`, `onDraw(element)`, `onDestroy(element)`),
   exposing the class via `globalThis`.
3. **Add a `gems*` factory** + any new `GemsTheme` keys; thread an optional
   `opts.tooltip` through (the kit convention).
4. **Demo it** — add a row/section to `sceneUIKit` + `en-US`/`ko-KR` strings, so it's
   eyeball-verifiable in one place.
5. **Verify** — `prettier --end-of-line crlf` → `gm-cli compile --errors-only` →
   boot and check `game.log`.

## Ground rules (GMRT 0.19)

- **No runtime flexpanel mutation.** Set layout once at construction; drive runtime
  motion (scroll, expand, modal, tabs, drag) with draw-time offset/clip math, not
  `flexpanel_node_style_set_*`. See [FLEXPANEL.md](FLEXPANEL.md) for the property
  reference and the bug #15065 note.
- Honour the existing GMRT idioms in `CLAUDE.md` (no `for...of` over Map/Set, no array
  destructuring in `for...of`, no `gpu_set_scissor` for clipping — its global state
  leaks, clip via substring/offset like `UIInput`, etc.).
- Show/hide subtrees with our own `element.enabled` flag, not `display:"none"`.
- **Guard `!(pos.width > 0)` in components that draw filled geometry/sprites** (the
  interactive widgets + panels). On the first frame after a scene transition the layout
  isn't computed, so `getLayoutPosition()` returns NaN width/height and drawing
  roundrects/sprites with NaN coords faults. Test `> 0`, not `<= 0` — `NaN <= 0` is
  `false`, so the naive guard misses it. Now guarded: `UIStepper`/`UISlider`/`UIProgress`/
  `UISelect`/`UICheckbox`/`UIInput`. **Do NOT guard text drawers** (`UIText`, or anything
  that self-sizes via `setWidth` in `onUpdate`): runtime flexpanel mutation is a no-op on
  0.19, so those elements run at width 0 *permanently*, and the guard would hide them for
  good — `draw_text` tolerates a 0/NaN width anyway. (`UINineSlice` draws sprites → it
  needs the guard.)
- **Class getters/setters work** (verified by probe this session — the earlier "getters
  never fire" note was a misdiagnosis of the large-file hoisting fault). Use them freely;
  inlining is a style choice, not a requirement.
- **Use `Time.raw`, not `Time.delta`, for any UI timer/easing** — `Time.delta` is
  scaled by `Time.scale`, so menus freeze/slow when a sim pauses or dilates time.

## Lessons from this session (UITooltip → UIStepper)

The kit hit GMRT's **large-file ceiling**: once a script grows past a threshold, GMRT
stops hoisting some bare top-level `function` declarations into global scope and faults
at *startup* (`cannot coerce undefined or null value into object`, no usable stack
trace). Mitigations, now standard for the kit:

- Assign factories as `globalThis.X = function X(…)`, never a bare `function X(…)`.
- Keep files small — the kit lives in `GemsTheme` / `GemsContainers` / `GemsWidgets` /
  `GemsControls`, not one `demo.js`. **New widget factories go in the matching
  `Gems*` file (or a new small one), not appended to a big file.**

Debugging GMRT with no stack trace: instrument the suspects with `Log.info` and make
`Log.write` flush eagerly (temporarily) so a mid-build/mid-draw crash still leaves a
complete trail on disk; read the tail of `game.log`. That's how the `UIStepper` NaN
cause was pinned down. (The getter was *also* blamed at the time but later cleared — a
probe confirmed getters/setters work on 0.19; the real co-cause was the large-file
hoisting fault.)

---

## Phase 1 — Display widgets (small, independent, high value)

- [x] **1. `UIProgress` (bar)** — non-interactive 0–1 fill (health/mana/XP/loading/
  cooldown). `gemsProgress(getValue, opts)`: fill color, optional `label`/percent,
  track styling. Add a `radial` mode flag later (ability-cooldown sweep) or fold it in
  now. *No deps.*
- [x] **2. `UICheckbox` / `UISwitch`** — a real visual toggle (box+check or pill+knob)
  vs. the current text-on-a-button `gemsToggle`. `gemsCheckbox(label, getValue,
  onToggle)`. *No deps.*
- [x] **3. `UIStepper` (numeric `< n >`)** — cheap; reuse `UISelect`'s arrow
  hit-testing over a min/max/step range. `gemsStepper(getValue, onChange,
  {min,max,step})`. *No deps.*
- [x] **4. `UINineSlice` (sprite-framed panel)** — draw bordered panels from a 9-slice
  sprite instead of `draw_roundrect`, so the kit can wear hand-drawn game skins. A
  `UIPanel` sibling. GMRT honours the sprite's IDE nine-slice in
  `draw_sprite_stretched_ext`, so no manual corner/edge/center sampling is needed — the
  component just stretches the sprite to the element rect (NaN-guarded). `gemsNineSlice`
  factory; `spr_uibox` (16×16, 3px insets) is the demo skin. Foundational for a
  sprite-themed look.

## Phase 2 — Containers (the architectural unblockers)

- [x] **5. `UIScroll` container** — clip + content-offset scroller (wheel + drag-thumb)
  via draw-time clipping, **not** flex mutation. The keystone for every list-heavy
  scene given the `display/2` (~540px) GUI clamp. Done: `UIElement` gained `scrollY`
  (subtracted in `getLayoutPosition`, so draw + hit-test shift through one chokepoint)
  and surface-based `clip` (`_drawClipped` renders children to an off-screen surface +
  blits — NOT `gpu_set_scissor`, verified surfaces work on GMRT 0.19 by probe);
  `update` gates child input to the viewport rect. `gemsScroll({height})` → insert items
  into `.scrollBody`.
- [ ] **6. `UIModal` / dialog** — dimmed full-screen backdrop root + centered card +
  button row, layered through `UI.insert` index/block. `gemsModal({title, body,
  buttons})` → handle with `.close()`. *No deps.*
- [ ] **7. `UITabs`** — tab strip + swappable content (toggle child `enabled`, no
  reflow). `gemsTabs([{label, content}])`. Payoff: **split the crowded `sceneUIKit`
  into tab pages** (Widgets / Containers / HUD) in this same commit. *No deps.*
- [ ] **8. `UIAccordion` / collapsible section** — expand/collapse titled groups
  (height driven by draw-time clip, content `enabled` toggled). Good for settings.
  *Soft dep on UIScroll patterns.*

## Phase 3 — HUD & feedback

- [ ] **9. `Toast` notifications** — `Toast.push(str, opts)` singleton mirroring
  `Tooltip` (timed stack, drawn in `Draw_75`). "Item acquired", quest updates,
  achievements. *No deps.*
- [ ] **10. `UIList` / slot grid with selection** — item-slot grid (`UIImage`/
  `UIPanel`) with hover + selection state. Lives inside a `UIScroll` for overflow.
  Foundation for inventory. *Dep: #5.*
- [ ] **11. Drag-and-drop slots** — pointer-follow drag + drop-target resolution over
  the slot grid; rearrange items between grids. *Dep: #10.*
- [ ] **12. `UIRichText`** — colored spans + inline icons in one string (item rarity,
  damage colors, keybind glyphs in help text). Extends `UIText` parsing. *No deps.*

## Phase 4 — Input & navigation

- [ ] **13. Input rebinding widget** — "Press a key…" capture row bridging the existing
  `Input` / `InputAction` (`bindButton` / `bindAxis`). `gemsRebind(actionKey)`.
  *No deps (uses existing Input).*
- [ ] **14. Gamepad/keyboard UI navigation** — focus model + directional traversal over
  `UIElement` so menus are playable without a mouse. A **system**, not a widget;
  touches `UI`/`UIElement` (focus ring, focus state in `onUpdate`). Biggest/riskiest —
  last in the core path so it doesn't churn the foundation under everything else.
  *Soft dep: every interactive widget exists.*
- [ ] **15. On-screen / virtual keyboard** — gamepad text entry feeding `UIInput`.
  *Dep: #13/#14 + `UIInput`.*

## Phase 5 — Theming & motion (polish layer)

- [ ] **16. `Tween` helper** — shared `Time.delta` easing util (fade/slide/scale)
  factored out of `UIButton`'s ad-hoc lerps; consumed by modals/toasts/accordion for
  enter/exit motion. *No deps; refactor opportunity.*
- [ ] **17. Scene transition / fade** — full-screen fade (or wipe) between scenes,
  hooked into `obj_game`'s pending-transition step. Removes the hard cut on
  `openScene`. *Soft dep: #16.*

## Phase 6 — Game-specific HUD (genre, optional)

These lean toward the Templates genres rather than the generic kit — pull them in when
the matching game work resumes, but they're listed so the plan is complete.

- [ ] **18. RPG dialogue box + typewriter text** — paged dialogue with reveal speed +
  advance; pairs with the RPG templates and `QuestLog`. *Dep: #12 (UIRichText) ideal.*
- [ ] **19. Floating combat text** — world-space damage/heal numbers that rise + fade
  (drawn in the scene camera, not the GUI layer). *Dep: #16 (Tween).*
- [ ] **20. Quest tracker HUD** — on-screen list bound to the existing `QuestLog`.
  *Dep: #5 (scroll), #12 (rich text).*
- [ ] **21. Minimap / radar** *(stretch)* — entity blips from `Query`/`World` on a
  framed `UINineSlice` panel. Genre-specific; lowest priority.

---

## Suggested commit order

Land **1–4** first (quick wins, each a day or less), then **5** (the ceiling-raiser
everything list-heavy needs). **6–9** give the demo real interactivity. **10–11** build
the inventory stack. **13–14** make it controller-playable. **16–17** are polish you can
slot in anytime. **18–21** wait for the matching genre work.

Two housekeeping commits already adjacent to this plan:
- `docs:` this file + `FLEXPANEL.md` (the flexpanel reference) — landing now.
- `refactor: split sceneUIKit into tab pages` — fold into #7 or do standalone once the
  scene outgrows two columns.
