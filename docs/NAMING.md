# Naming

Naming rules for API members, GameMaker assets, and the data keys they meet.

## API

- A member is a short idiomatic verb or noun. The owner is the namespace, so a member never restates it or pads with filler.
- A class is named for what it is, not for its role pattern (`*Manager`, `*Helper`, `*Impl`).
- A qualifier exists only to split two real members; everything else a long name would carry belongs in JSDoc.

## Assets

- An asset name is a global identifier: GameMaker binds it in global scope and code reads it bare, so it is cased like one — PascalCase, with any kind prefix in lowercase.
- A script is named for the identifier it exposes, cased to JS norms: PascalCase for a class, a namespace object, or a bucket of free functions with no single matching global; camelCase for a plain function.
- A lowercase prefix marks a script that is not logic: `scene*` for a screen, whose one global is a factory function of the same name, and `content*` for a data module whose whole body is defs handed to a registry. A module that decides something stays PascalCase even when it registers defs.
- A script family keeps its conventional affix (`Render*`, `*System`).
- Content and its scene take the game's name, never the genre, the layer, or the engine's name. The prefix is dropped wherever the folder and suffix already scope the name, and kept only where the bare name would collide with a Core script or read as engine.
- An object or a room hosts code, so it follows the script rule: PascalCase, named for what it is, with no media prefix and no restated resource type.
- A shader is `sh<Name>`, a particle system `ps<Name>`, an animation curve `ac<Name>`.
- A sprite is `<kind><Family><Subject>[<Variant>]`:
    - `kind` names what the art IS, never which resource holds it: `pix` (pixel art), `vec` (vector), `spine` (skeletal rig).
    - `Family` names the consumer that reads the asset, from a closed set: `Item` (bag icons), `Tex` (wall/floor textures), `Terrain` (dual-grid sets), `Tile` (autotile sets), `Grass` (ground sheets), `Ui` (widget chrome), `Fx` (particle art). A bare subject with no family is reserved for entity art and the garments its doll wears; a garment's kind leads, naming the slot it dresses.
    - `Subject` is what a stranger would call the thing, in one to three words. Material leads when it splits same-object variants; on themed items and furniture the material or design is the subject, not a variant. A size or style qualifier comes last.
    - An item icon names the art, not an item id: a def names its sprite explicitly, several ids may share one, and a sprite is never derived from an id.
    - Game-data metadata (manufacturer, rarity, stats, tier) never enters a name; it lives on the def. A brand appears only when the art itself is branded.
- A sound is `snd<Subject>[<Event>]` for SFX and `mus<Track>` for music.
- A media name cases acronyms as words, following word boundaries.

## Included Files & Data Keys

- An included file, an item id, an i18n key, and anything a save file holds are strings the engine compares, not identifiers: ids and keys are lowercase snake_case, i18n keys ALL_UPPER. Renaming an asset is a rename; renaming a key is a migration.
- An i18n key is `<AREA>_<SUBJECT>`, the area naming the consumer that reads it (`INV_` the bag, `BUILD_` build mode, `FACET_` the kit showcase, `SURVIVAL_` the needs) — never a genre, a layer, or the widget that shows it (`TOAST_`, `KEY_`). A locale's `text/<area>.json` holds one area's keys and nothing else; the loader merges the files into one flat map, so a key is unique across the locale and its prefix says which file holds it. A word every page shares (`COMMON_CANCEL`, `COMMON_EMPTY`) lives in `common.json` once, never re-keyed per page.
- Where the two meet, each keeps its own casing: an item def carries its id as a string and its icon as a bare ref side by side.
- A mesh (`.vox`/`.mesh` under `datafiles/meshes/`) follows the sprite rule with no kind prefix, since the directory and extension are the kind: the file and its `Mesh.model` string share one camelCase `<material><Object>[<Variant>]` name. The string reaches a save, so renaming a mesh bumps `Snapshot.VERSION`.
