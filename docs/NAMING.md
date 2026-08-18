# Naming

Naming rules for API members, scripts, and media assets.

## API

Members are short idiomatic verbs and nouns (`Entity.create`, `Item.get`, `File.read`); the owner is the namespace, so a member never restates it or pads with filler (`createNew`, `getInfo`). A class is named for what it is (`Entity`), not its role pattern (`*Manager`, `*Helper`, `*Impl`). A qualifier exists only to split two real members (`read` vs `readBuffer`); everything else a long name would carry belongs in JSDoc.

## Scripts

A script's directory + filename matches the identifier it exposes, cased to JS norms: PascalCase for a class or namespace object (`World`, `CameraFollow`), camelCase for a plain function (`teardownScene`), and a PascalCase category bucket for a family of free functions with no single matching global (`Utils`, `UIDraw`, the `Gems*` buckets). GameMaker-asset families keep their conventional prefix (`scene*`, `Render*`, `*System`, `obj_*`/`rm_*`/`sh_*`).

A lowercase prefix marks a script that is not logic: `scene*` for a screen, `content*` for a data module whose whole body is defs handed to a registry (`contentItems`, `contentRecipes` — the case itself says data, not engine). A module that decides something stays PascalCase even when it registers defs (`ColonySpawn`). Content and its scene take the GAME's name, never the genre or the layer — `Colony*`/`sceneColony`, not `Rpg*` (a genre label), `Game*` (the layer + the shell object) or `Gems*` (the engine, and the UI kit's). Drop the prefix wherever the folder and suffix already scope the name (`Hud`, `InventoryUI` next to `StorageUI`/`TradeUI`); keep it only where the bare name would collide or read as engine (`ColonyLevel` vs Core `Level`, `ColonyCombat` vs `Combat`).

## Media Assets

`<prefix>_<family>_<subject>[_<variant>]`, all-lowercase snake_case after the GM type prefix (`spr_`/`snd_`/`mus_`/`sh_`/`ps_`/`obj_`/`rm_`).

- `family` names the CONSUMER that reads the asset — a closed set: `item` (bag icons, auto-wired — `spr_item_<item_id>`, the item id verbatim), `wear` (paper-doll overlay strips), `tex` (wall/floor face textures), `terrain` (dual-grid terrain sets), `tile` (autotile piece sets), `ui` (widget chrome/glyphs), `fx` (particle art). A bare subject with no family tag is reserved for entity animation strips (`spr_human`).
- `subject` is what a stranger would call the thing (1–3 words), material leading when it splits same-object variants (`wooden_table`), size/style qualifier last (`_small`).
- Game-data metadata (manufacturer/rarity/stats/tier) never enters a name — it lives on the def and reaches the player through UI; a brand string appears only inside an item id the sprite mirrors (`spr_item_aeon_pistol`).
- Sounds: `snd_<subject>[_<event>]` for SFX (`snd_gun_fire`, bare `snd_coin`), `mus_<track>` for music.
- Vox meshes (plain files, not GM assets): the `.vox` model in `datafiles/meshes/` and its `Mesh.model` string share one `<material>_<object>[_<variant>]` name.
