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
- [x] **6. `UIModal` / dialog** — dimmed full-screen backdrop root + centered card +
  button row, layered through `UI.insert` index/block (top root: draws last, returns
  `true` to block every root beneath). `gemsModal({title, body, buttons})` → UIModal
  handle with `.close()`; closes on Esc / backdrop click too. Modal text uses
  explicit-height rows (UIText can't self-size at runtime). Closing destroys the root
  mid-`UI.update`, so `UIElement` gained a `_destroyed` guard (idempotent destroy +
  skip refresh/draw/update on a torn-down node). *No deps.*
- [x] **7. `UITabs`** — tab strip + swappable content (toggle child `enabled`, no
  reflow). `gemsTabs([{label, content}])`. Payoff: **split the crowded `sceneUIKit`
  into tab pages** (Widgets / Inputs & Values / Containers) in this same commit. Done:
  `UITabs` draws N equal-width segments directly in `onDraw` (active fill + accent
  underline, like `UISelect`) and hit-tests clicks per segment; selecting toggles each
  page's `enabled`. `gemsTabs(tabs, {height})` wraps each page in a `positionType:
  "absolute"` overlay (insets 0) so they stack in one rect — no reflow on switch. Pages
  that overflow the display/2 clamp are wrapped in a `gemsScroll` (tabs + scroll
  compose). *No deps.*
- [x] **8. `UIAccordion` / collapsible section** — expand/collapse titled groups.
  `gemsAccordion([{title, content, open}])`. Done: each section is a `UIAccordion`
  header (draws its own bg + title + a `draw_triangle` chevron, no font glyph) over a
  padded body. Unlike `UITabs` (stack + `enabled` toggle), an accordion must change
  the layout height, so toggling **inserts/removes the body element** from the item
  container — a structural change that reflows reliably (probe-verified this session:
  runtime `insertChild`/`removeChild` + `markDirty` recompute correctly; the #15065
  bug is only the per-frame style *setters*). Sections are independent (multiple open).
  Demoed in the sceneUIKit Containers tab.

## Phase 3 — HUD & feedback

- [x] **9. `Toast` notifications** — `Toast.push(str, opts)` singleton mirroring
  `Tooltip` (timed stack, drawn in `Draw_75` after `Tooltip`). Done: bottom-center
  stack, newest at the bottom; each entry has a type-colored left accent stripe
  (`info`/`success`/`warn`/`error`, or `accent` override) and fades + slides in/out,
  aged by `Time.raw` (so it ignores time dilation/pause) and culled when expired
  (`maxItems` cap drops the oldest). Demoed by the "Toast" button in sceneUIKit.
  *No deps.*
- [x] **10. `UIList` / slot grid with selection** — shipped as **`UISlots`** +
  `gemsSlots(items, opts)`. A flat array of slot data (`{sprite, subimg, count,
  color}`) or null; the whole grid is drawn directly in `onDraw` across one
  fixed-size element (cols × cellSize + gaps — no child-per-slot), so it's cheap and a
  `gemsScroll` can measure it. Hover highlights, click selects (`onSelect(i, item)`),
  count badges, 2px accent selection outline. `sprite` must be raster (SVG faults).
  Demoed in a new sceneUIKit **Inventory** tab inside a scroll. *Dep: #5.*
- [x] **11. Drag-and-drop slots** — shipped as **`SlotDrag`** (a standalone static
  singleton like Tooltip/Toast) + a `draggable` opt on `UISlots`/`gemsSlots`. Press a
  filled slot → `SlotDrag.begin` picks it up (source slot empties, floating icon
  follows the cursor, drawn in `Draw_75` after `UI`); release over a slot → `drop`
  (swaps any occupant back to the source — a plain move if empty), works across grids;
  release over nothing → `cancel` returns it (caught in `SlotDrag.draw` since grids
  only see the release when the pointer is over them); a click that doesn't move
  selects. Probe-verified the cross-grid move this session. Demoed by two draggable
  3×3 grids in the sceneUIKit Inventory tab. *Dep: #10.*
- [x] **12. `UIRichText`** — colored spans + inline icons in one string (item rarity,
  damage colors, keybind glyphs in help text). Extends `UIText` parsing. Done: a
  square-bracket markup — `[c=#hex]…[/c]` / `[c=name]…[/c]` (nesting color stack,
  resolved through an `opts.palette` of name→color) for spans, `[spr=spr_name]` /
  `[spr=spr_name:sub]` for an inline icon, `\n` for a hard break — is parsed once and
  cached, then drawn run-by-run advancing x (`draw_text_color` + `draw_sprite_stretched_ext`),
  with per-line internal halign against the widest line. Like `UIText` it self-sizes via
  `setWidth/Height` (a no-op at runtime on 0.19) so it's a text drawer (no NaN-width
  guard) and stacked lines need explicit-height host rows. `gemsRichText(markup, opts)`
  merges the kit's semantic palette names for free. Found a new GMRT idiom in the process:
  `asset_get_index` returns an opaque sprite *ref*, not a numeric index, so the icon
  validity test must be `sprite_exists`, never `>= 0` (now in CLAUDE.md). Demoed in the
  sceneUIKit Widgets tab (loot lines with rarity colors + terrain-tile icons, a keybind
  help line). *No deps.*

## Phase 4 — Input & navigation

- [x] **13. Input rebinding widget** — "Press a key…" capture row bridging the existing
  `Input` / `InputAction` (`bindButton` / `bindAxis`). `gemsRebind(actionKey)`. Done:
  **`UIRebind`** draws the action's current keyboard binding (via a `_keyName` map) over
  a `UIPanel`; click arms capture (`_capturing` instance flag — not a clobber-prone
  local), then `keyboard_check_pressed(vk_anykey)` + `keyboard_lastkey` rebinds the
  action's first button in place (Esc / mouse-click cancels). Mouse/gamepad bindings show
  read-only as `Mouse N` / `Pad N`. Keyboard-only rebinding (the common case); no
  persistence (Input.export is nested → `JSON.stringify` faults, see the idiom note).
  `gemsRebind(actionKey, opts)`; demoed in the sceneUIKit Inputs & Values tab with two
  actions (Jump=Space, Fire=F) + a live `down()` held-state readout. (Probed at runtime:
  `vk_anykey` and `keyboard_lastkey` are exposed GMRT globals — `lastkey` is a number.)
  *No deps (uses existing Input).*
- [x] **14. Gamepad/keyboard UI navigation** — focus model + directional traversal over
  `UIElement` so menus are playable without a mouse. Done as **`UINav`**, a standalone
  static system that — notably — touches *neither* `UI` nor `UIElement`: an element is
  focusable purely by duck-typing (a component exposes `navActivate`/`navAxis`), so the
  foundation stayed untouched and any future widget opts in just by adding those methods.
  `UINav.update()` (Step_0) walks the enabled roots, collects focusables with a valid
  on-screen rect (skips ones scrolled out of a `clip` ancestor), and routes arrows /
  dpad / left-stick to geometric nearest-neighbor focus moves, a horizontal press to
  `navAxis` on slider/select/stepper (else a focus move), Enter/Space/A to `navActivate`,
  Esc/B to disengage. `UINav.draw()` (Draw_75) renders a pulsing accent focus ring.
  Engagement model: first input engages+focuses without acting, mouse movement
  disengages (ring hidden), and nav is suspended while a `UIInput` is typed (`UIInput.active`).
  Nav hooks added to `UIButton`/`UICheckbox`/`UISelect`/`UIStepper`/`UISlider`; works in
  every scene for free (probe-verified in Settings: 10 focusables collected, directional
  moves walk them, ring renders on the focused widget). Keyboard + gamepad (dpad + left
  stick). *Soft dep: every interactive widget exists.*
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
