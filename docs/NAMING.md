# Naming

Naming rules for API members, scripts, GameMaker assets, and the data keys they meet.

## API

Members are short idiomatic verbs and nouns (`EntityStore.create`, `Item.get`, `File.read`); the owner is the namespace, so a member never restates it or pads with filler (`createNew`, `getInfo`). A class is named for what it is (`EntityStore`), not its role pattern (`*Manager`, `*Helper`, `*Impl`). A qualifier exists only to split two real members (`read` vs `readBuffer`); everything else a long name would carry belongs in JSDoc.

## Scripts

A script's directory + filename matches the identifier it exposes, cased to JS norms: PascalCase for a class or namespace object (`World`, `CameraFollow`), camelCase for a plain function (`teardownScene`), and a PascalCase category bucket for a family of free functions with no single matching global (`Utils`, `UIDraw`, the `Facet*` buckets). A script family keeps its conventional affix (`scene*`, `Render*`, `*System`).

A lowercase prefix marks a script that is not logic: `scene*` for a screen, `content*` for a data module whose whole body is defs handed to a registry (`contentItems`, `contentRecipes` — the case itself says data, not engine). A module that decides something stays PascalCase even when it registers defs (`ColonySpawn`). Content and its scene take the GAME's name, never the genre or the layer — `Colony*`/`sceneColony`, not `Rpg*` (a genre label), `Game*` (the layer + the shell object) or `Gems*` (the engine's own name — why the Game-layer UI kit is `Facet*`, a name of its own). Drop the prefix wherever the folder and suffix already scope the name (`Hud`, `InventoryUI` next to `StorageUI`/`TradeUI`); keep it only where the bare name would collide or read as engine (`ColonyLevel` vs Core `Level`, `ColonyCombat` vs `Combat`).

## Objects & Rooms

Named like a class rather than like media — PascalCase, for what it is (`Game`, `Room`, `Puppet`). They host code or stage the run, so no media prefix applies, and the name never restates the resource type: `EntityObj` is the `*Manager` mistake in another costume.

## Media Assets

`<kind><Family><Subject>[<Variant>]` — a lowercase kind prefix, then camelCase (`pixItemLeadPipe`, `sndGunFire`). The kind names what the art IS, never which GameMaker resource holds it: `pix` (pixel art), `vec` (vector) and `spine` (skeletal rig) are all GMSprites, and that split is the point — a name says which render path the asset takes (`pix*`/`vec*` through `Visual`, `spine*` through `Skeleton`) and, for `vec*`, that it is inert on the pinned runtime (GMRT.md → Known Incompatibilities). `snd`/`mus` divide GMSound the same way; `sh`/`ps` hold one member each.

Casing follows word boundaries. Where a name is COMPUTED from a snake_case key the transform is mechanical (`_x` → `X`, acronyms included — `pixUiBox`, not `pixUIBox`), which is what keeps the item auto-wire a rule instead of a lookup table.

- `family` names the CONSUMER that reads the asset — a closed set: `item` (bag icons, auto-wired — `pixItem<ItemId>`, the item id camelised), `tex` (wall/floor face textures), `terrain` (dual-grid terrain sets), `tile` (autotile piece sets), `decor` (ground pieces `RenderDecor` strews over a material), `ui` (widget chrome/glyphs), `fx` (particle art). A bare subject with no family tag is reserved for entity art (`spineHuman`) and the garments its doll wears (`pixHatRedBandana`, `pixShoeDarkBrown` — the garment kind leads, naming the slot it dresses).
- `subject` is what a stranger would call the thing (1–3 words), material leading when it splits same-object variants (`pixWoodenTable`), size/style qualifier last (`pixFenceRoundSmall`).
- Game-data metadata (manufacturer/rarity/stats/tier) never enters a name — it lives on the def and reaches the player through UI; a brand string appears only inside an item id the sprite mirrors (`pixItemAeonPistol`).
- Sounds: `snd<Subject>[<Event>]` for SFX (`sndGunFire`, bare `sndCoin`), `mus<Track>` for music.

## Data Keys

An asset name is an IDENTIFIER — GameMaker binds it in global scope and code reads it bare, so it is cased like one. A data key is not: item ids, `.vox` model strings, i18n keys, and anything a save file holds are strings the engine compares, and they stay lowercase snake_case (`lead_pipe`, `wooden_altar`). The line matters where the two meet — `contentItems` builds a sprite name out of an item id, so the id keeps the form a save already holds and the camel transform happens at the lookup, never in the data. Renaming an asset is a rename; renaming a key is a migration.

Vox meshes are keys, not assets (plain files, not GM resources): the `.vox` model in `datafiles/meshes/` and its `Mesh.model` string share one `<material>_<object>[_<variant>]` name.
