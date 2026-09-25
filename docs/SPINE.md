# Spine

The Spine (skeletal sprite) half of the GMRT deny-list, split out of `GMRT.md` because it bites only
the skeletal area — `Sprite` (the component), `SpriteSystem` (playback), `Anim` (the verbs, sheet
metadata), `AppearanceSystem` (dressing), `RenderBillboard` (the draw). GMRT.md's rules apply here
unchanged: an entry is a DEFECT of the pinned 0.21 — the rule, its ticket as [#00000], and the safe idiom — never
a ticket's state. What the manual documents, and what the classic runtime does the same, is not an
entry: the manual and the owning code's comments carry it. "A/B-run" means checked against the
classic runtime on a minimal GML repro; a defect A/B-run gets its own ticket ([#15998] the
transform constraints, [#15999] the mix that vanishes the doll, [#16001] proportional path
spacing); one without is a comment on [#14773], which reports GMRT Spine failing broadly (sprite
not drawing, texture group not fetched).

## Drawing and Playback

- Playback advances only while the puppet DRAWS: with no `draw_self` its `image_index` runs but
  `skeleton_animation_get_position(0)` stays 0, since the pose is read off `image_index` at draw
  time (so two `draw_self` calls a frame advance it once); the classic runtime advances the
  position undrawn (A/B-run). With an asset speed of 0 (where an imported skeleton lands)
  `image_number` reads 0 and `image_index` NaN until a set is bound (not A/B-run).
- A one-shot (`skeleton_animation_set(name, false)`) replays from its first key once
  `image_index` wraps past `image_number`, where the manual's loop flag holds it: park it yourself
  the step before it would wrap — `image_speed` 0 and `image_index` a hair under `image_number`
  (`SpriteSystem`). Not A/B-run.
- `skeleton_animation_mix` blends on the `image_index` clock.
    - `skeleton_animation_set` keeps `image_index` across a mixed pair (the manual's note), and
      writing 0 there yourself FREEZES a loop-to-loop blend at its first weight for good, the
      from-set stuck at its last pose under the running to-set (a switch with a one-shot on either
      side blends through regardless; not A/B-run).
    - [#15999] A pair with a single-key set (0 frames) on either side poisons the puppet: the pose
      reads NaN from the second frame and the doll stops drawing, unrecovered by any later
      `skeleton_animation_set` — so a mix table skips every 0-frame set. Measured with 0.1 s on all
      72 ordered pairs of spineHuman's 9 sets; the blends themselves look clean (no limb through
      the body). A/B-run against the legacy runtime on a GML project (the ticket's): it plays the
      same `idle0`/`down0`/`attack0` mixes through, doll intact.
- Build: the Sprite compile cache keys on the `.yy`, not on the skeleton's `.json` — an in-place
  edit of an exported skeleton json is served STALE until its `.yys` under
  `.gmcache/build-cache-*/…/Sprite/` is evicted (a fresh editor import writes a new GUID trio and
  misses this). And a UTF-8 BOM on that json kills the runner NATIVELY at boot (nothing logs past
  `game start`; the visible error is an uncaptured Dawn `Present` validation failure) — PowerShell
  5.1 `Set-Content -Encoding UTF8` writes one, so save skeleton edits BOM-less. Tooling debt, not
  filing.

## Attachments and Skins

- `skeleton_skin_get` THROWS from JS and kills the runner NATIVELY from GML where the manual
  returns the name (the classic runtime does, A/B-run); `skeleton_skin_list` THROWS from JS (it
  fills the list from GML). A skin can be set, never read back — keep one skin in the file and
  dress through attachments (`sprite_get_info(sprite).skin_names` still enumerates them).
- `skeleton_attachment_create` returns `undefined`, not the manual's 1/-1 (the classic runtime's 1,
  A/B-run), and FAULTS inside a draw event from JS (from GML it returns there on either runtime,
  A/B-run): build attachments from a step-time system and let the draw pass only pose, and guard a
  create with `_exists` (`AppearanceSystem._attach`), never with the return value or a try/catch.
- Slot ALPHA is ignored: `skeleton_slot_colour_set` with alpha 0 draws the part at the slot colour,
  fully opaque, where the manual promises a composite and the classic runtime hides the part
  (A/B-run) — so slot alpha cannot hide a part; clear the slot instead.
- The packer trims every sprite to its alpha>0 bounding box and the texture group's
  `autocrop: false` does not stop it, where the manual says an unflagged group adds the sprite "as
  is" (verified on a clean build cache; not A/B-run). A trimmed sprite bound to a Spine slot logs
  `Sprite '<name>' is cropped, sprites used by Spine must be uncropped` once per `_create`, is
  centred by its TRIMMED rect, then has the trim offset subtracted in bone-local coordinates. The
  trim is exactly `sprite_get_uvs` on the attachment sprite — [4]/[5] the pixels cut from the
  left/top, [6]/[7] the kept fraction of the width/height — and an alpha-1 pixel counts as opaque
  and moves it, so read it back at runtime, never predict it from the files
  (`AppearanceSystem._attach` compensates it; verified at scale 1, the scaled case unmeasured). The
  ignored group flag is the reportable half.

## Bones and Constraints

- `skeleton_slot_data` with a string first argument is rejected from JS and kills the runner
  NATIVELY from GML, where the classic runtime throws a type error (A/B-run): pass the sprite.
  `skeleton_bone_state_get` reads 0 for every key on the create frame, before the first pose,
  where the classic runtime reads the instance position (A/B-run).
- The runtime spaces a path constraint's bones in the constraint's ARRAY order where the editor
  renders the physical chain — Spine serializes add-order, and a multi-selected add comes out
  scattered, dragging the mesh through the body with no log — so keep the bones array in
  parent→child order (re-add one by one, or sort the exported array). Not A/B-run.
- [#16001] PROPORTIONAL path spacing is broken outright (the bundled spine-cpp is an old build with
  a known json-parse defect, fixed upstream, waiting on a runtime update): the chain lands past the
  path's end, unfixable by tuning — A/B-run against the legacy runtime, which places it as authored
  (the ticket's project: spineHuman's `pathLegL`/`pathLegR` exported with proportional spacing).
  PERCENT spacing evaluates exactly — n bones at 1/(n-1) span the whole path with the tip on the
  end bone — so author path constraints with percent spacing (6.67% for spineHuman's 16-bone limbs,
  14.29% for its 8-bone neck). On a runtime that ends a proportional chain on the path, the rigs
  may go back to proportional, which needs no re-tuning when a chain gains or loses a bone — no
  case flips for it (no rig in the project carries a proportional constraint any more), so it is
  re-checked by hand on an upgrade.
- [#15998] TRANSFORM constraints are INERT (the same old-build cluster): a rotation-mix constraint
  leaves its bone's `worldAngleX` frozen across every pose, an explicit `mixRotate:1` included.
  A/B-run against the legacy runtime, which applies them (the ticket's project: spineHuman's
  `footLAngle`/`footRAngle`, watched on `idle0`). Rotation a constraint would supply is baked into
  each set's bone keys instead; on a runtime that applies them (`testGame` spine.constraint flips),
  the rotation comes back out of the keys so the constraint owns it again.
