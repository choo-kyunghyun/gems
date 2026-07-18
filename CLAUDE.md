# CLAUDE.md

Project guidelines for Claude Code.

## Project Overview

**G.E.M.S.** (GameMaker Entity & Map System) is a UI and entity management library for GameMaker, published as a public repository under the MIT license. The essentials:

- **Library**: everything is built for reuse — hold every piece to library-grade code quality (the demo is the showcase, not the product).
- **GMRT**: runs on GMRT, GameMaker's next-generation runtime (0.20 — see GameMaker CLI; its quirks live in docs/GMRT.md).
- **JS**: JavaScript is the main language — all game logic is JS, never GML; TypeScript serves as the type checker (`jsconfig.json` `checkJs` over JSDoc + `.d.js` stubs), not a source language.
- **ECS**: data-oriented programming, not object-oriented — entities are ids, components plain data, systems plain objects.
- **Layers**: the project splits into four top-level pillars for reuse — `Core` (pure engine) / `Gameplay` (genre-agnostic gameplay kit) / `GemsUI` (themed UI kit) / `Demo` (the integrated showcase consuming the other three). Placement rule + full breakdown: docs/ARCHITECTURE.md.

## Working Guidelines

Quality over speed. Follow these principles:

- **Think before acting.** State assumptions before writing code; when anything is uncertain or ambiguous, ask the user rather than guess silently.
- **Verify after implementing.** Never assume a result — run the code and confirm the behavior yourself (there are no tests; run the game — see GameMaker CLI + Debugging & Verification). Verification results are reported in conversation, never recorded in the repo: this is a public library, not a lab notebook — no run output, probe narration, or "verified <date>" stamps in code or docs. A recorded fact pins to a version or ticket ("safe on 0.20", "#15095"), never to when it was checked; git owns history.
- **Simple is best.** Shorter and leaner is better, as long as readability doesn't suffer — add nothing unnecessary.
- **Don't hide errors.** Write code so an error surfaces as early as possible; an object must never handle an error that is not its responsibility.
- **Change only what's needed.** Touch only the code the task requires, and report pre-existing dead or broken code to the user instead of fixing it on the spot — but this rule bounds scope, never quality. When the proper fix is improving an API, improve the API and update its callers: a call-site workaround that avoids touching the API is bloat, not restraint — it violates the Library rule above. Only a redesign far broader than the task needs proposing first; a right-layer fix is just doing the job.
- **Keep CLAUDE.md stable.** This file is the rarely-edited core; record new knowledge in its proper home instead — module contracts in the owning declaration's JSDoc (Comments law 2), cross-cutting rules in docs/ARCHITECTURE.md, runtime quirks in docs/GMRT.md, tool details in the tool's README, plans in docs/ROADMAP.md. Edit this file only when a core rule itself changes.

## GameMaker CLI

`gm-cli` is the official GameMaker CLI — it provides the commands to drive GameMaker's features from the terminal.

### Compile & Run

```sh
gm-cli run gems.yyp      # build + run
gm-cli compile gems.yyp  # compile only
gm-cli package gems.yyp  # package a distributable build
```

Optional flags: `--target`, `--runtime`, `--toolchain`, and `--errors-only`. The toolchain (**GMRT@0.20**) is already pinned by `gm-options.json`, so no `--toolchain` flag is needed.

### Manual

`gm-cli manual read "<query>"` prints the official GameMaker manual page — the full specification of a built-in (signature, arguments, return, accepted constants) with usage examples. When anything is uncertain, check the manual first. The query is a semantic search, so pass the exact page name to be sure of the article you get. Note that the manual does **not** reflect GMRT: it states an API's intended contract only — whether GMRT honors it is a separate question (the known divergences live in docs/GMRT.md).

Example:

```sh
gm-cli manual read buffer_save_ext
gm-cli manual read "Flex Panel Struct Members"
```

### Resourcetool

**Never create GameMaker assets (scripts, objects, rooms, sprites) by hand-writing files/folders or editing the `Resources` list in `gems.yyp`.** GameMaker manages asset metadata strictly — manual edits corrupt the project or are silently ignored. Creating, renaming, and deleting an asset all go through **`gm-cli resourcetool eval`** — CLI only. **Never wire resourcetool up as an MCP server**: a long-lived server process holds the project model in memory and can mutate asset files while bypassing the `gems.yyp` save (or write stale state over hand-edited `.yy`/yyp entries); each CLI `eval` is atomic — load, apply, save, exit.

#### Script

For a new script `<name>`:

```sh
gm-cli resourcetool eval "RESOURCE CREATE TYPE=Script NAME=<name>"                # registers it in gems.yyp
gm-cli resourcetool eval "RESOURCE SET EXPR=<name>.scriptSource VALUE=<name>.js"  # point at .js, not the .gml stub
```

Then delete the generated `scripts/<name>/<name>.gml` stub and `Write` `scripts/<name>/<name>.js`. Once the asset exists, edit its `.js`/`.yy` freely.

#### Cautions & Details

- **Filing under a project folder** (`folders/*.yy`): **edit the asset's own `.yy`** `parent` (`path: folders/<Folder>.yy`, `name: <Folder>`) to match a sibling — safe local metadata. Do **not** `RESOURCE SET` `.parent` (it mis-writes the path); left unset, the asset stays at the project root.
- **New folders**: `gm-cli resourcetool eval "FOLDER CREATE FOLDER=Parent/Child"`. Its name validator rejects spaces/`&` (over-strict — existing folder names like `UI Sprites` legally contain them); for such names hand-add a `GMFolder` line to the `Folders` array in `gems.yyp` — that array (unlike `resources`) is safe to hand-edit, and editing it is also how empty folders are deleted (resourcetool has no FOLDER DELETE).
- **Delete**: `gm-cli resourcetool eval "RESOURCE DELETE NAME=<name> TYPE=Script"` — removes the asset from `gems.yyp` and deletes its `scripts/<name>/` folder. Never delete by removing files manually.
- **Rename**: `gm-cli resourcetool eval "RESOURCE SET EXPR=<name>.name VALUE=<newname>"` — renames the folder + `.yy` + `gems.yyp` entry, churn-free (a script's `.js` source file + `scriptSource` are NOT renamed — `mv` the file, then `RESOURCE SET EXPR=<newname>.scriptSource`). **One CLI `eval` per rename, never via `SCRIPT PATH=`** — it renames the asset files without saving `gems.yyp`, leaving the project unloadable (verified; recover by reverting the fs renames, then redo via CLI evals).
- **Two renames resourcetool can't do**: an **included file** (its dotted name defeats the EXPR parser — rename the file + hand-edit its one line in the yyp's `IncludedFiles` array, safe to hand-edit like `Folders`), and an **importer-owned sprite** (additionally needs the importer's name derivation updated + a re-run).
- **Sprite churn**: a resourcetool CREATE/DELETE can leave mass churn under `sprites/` — after any mutation, revert it (`git checkout -- sprites/`) and confirm `git status` shows only your intended files before committing.
- **Verify**: `gm-cli resourcetool eval "CHECK PROJECTPATH=gems.yyp"`, then `gm-cli compile`.

## Debugging & Verification

### Runtime Log (`game.log`)

The **`Log`** class (`Log.info/warn/error/debug`, see docs/architecture/utilities.md → _Log_) buffers timestamped lines that `obj_game` flushes to **`game.log`** in the save dir (`%LOCALAPPDATA%\gems\`) once per frame — `Read` it after a `gm-cli run` to confirm runtime behavior without watching the window (add temporary `Log.debug` lines around the code under test, then revert). An uncaught runtime fault is also recorded there by `Log.exception` (the registered unhandled-exception handler) as `UNHANDLED EXCEPTION: <message>` — if a run dies with no such line, the crash was native and the log simply stops at its last flush.

### Visual Verification (Screenshot)

The agent can't press F5, so add a temporary auto-capture: in `obj_game/Draw_75.js` add a frame counter on `this`, call `screen_save("<name>.png")` at the frame(s) you want, then `game_end()` a couple frames after the **last** capture so the run self-terminates. A single run can take **multiple** shots (distinct bare filenames at different frames, to compare states). Then `gm-cli run` (blocks until `game_end`), `Read` each PNG, and **revert the temp code**. Gotchas: `screen_save` does **not** create dirs (use a bare filename, not `screenshots/x.png`); a bare filename lands in `.gmcache/build-gmrt-windows-vm/build/<name>.png`, not the `%LOCALAPPDATA%\gems\` save dir (where `game.log`/`settings.json`/`save.json` live).

### Live State Inspection (`entities.dump`)

To _read_ live entity state as data (not pixels), call **`entities.dump(idOrIds, file?)`** from a temp harness — `entities` is the level's `Entity` store (e.g. `game.scenes.current.world`). It writes the components of one id (or an id array; whole store via `dump(entities.query())`) to a `.json` file in the save dir (default `entity.json`) and returns the string — `Read` it after a `gm-cli run` like `game.log`. It serializes through the **`Json`** codec, so nested component data, sprite refs, and even cyclic runtime references are safe (native `JSON.stringify` faults on nested data — GMRT.md).

The **`Debug`** back-end (F3 overlay) is a **human-only** tool for tuning: it renders **outside** the game surface via `show_debug_overlay` + `dbg_*`, so `screen_save` can't capture it. `Debug.panel(name, (p) => …)` registers live-bound panels; an agent can still `Debug.set(panel, label, value)` / `Debug.press(panel, label)` from a harness to tune a value or fire a button, then screenshot to verify.

### Stale-Cache Reset

gm-cli's build state lives in `.gmcache/` (incremental compile cache; git-ignored and regenerable — `gm-cli cache info`/`cache clean`). When a build acts as if an asset still has its old state (renamed/deleted asset still "present", or an error not matching the source), run `gm-cli cache clean` (also re-downloads the shared runtime, so the next build is slower) and rebuild. The sibling `Build/` dir is the GameMaker IDE's temporary output — confirmed unrelated to gm-cli builds (git-ignored, safe to delete, but clearing it cannot fix a gm-cli staleness issue).

## Tools

The repo bundles standalone tools under `tools/` — not part of the game itself (never imported by it) — for fast prototyping and maintenance. Each tool is self-contained with its own README (and `.gitignore`); consult that README before working with a tool.

- `tools/pixel-art-kit/` — a pure-Python (stdlib-only) pipeline with which AI agents author pixel-art sprites from data files and import them into the project as GameMaker sprites.
- `tools/audio-kit/` — the audio sibling: synthesizes SFX and MIDI-based BGM from data files and imports them as GameMaker sounds. The committed `snd_*`/`mus_*` set is hand-authored — read its GEMS.md before re-running any importer.
- `tools/gems-tree-ext/` — a VS Code extension that shows the GameMaker asset tree (read from `gems.yyp`) in the Activity Bar, for humans navigating the flat project layout.
- `tools/vox-kit/` — MagicaVoxel `.vox` templates + the `vox2vbuf.py` baker emitting the `.vbuf` meshes (and `meshes.json` manifest) that `RenderMesh` and the prop colliders consume.

## Code Style & Conventions

### General

- **Language**: JavaScript (GMRT JS runtime), not GML. All scripts in `scripts/` use `.js`.
- **Global exposure**: scripts expose globals via `globalThis.Name = ...`. Components are string tokens; systems and classes follow the patterns in docs/ARCHITECTURE.md.
- **Formatter**: [Prettier](https://prettier.io/) with `{ "bracketSameLine": true }` (MDN config). Working tree is CRLF (`core.autocrlf=true`); run `prettier --end-of-line crlf`. `.d.js` stubs and `Build/`/`.gmcache/` are in `.prettierignore`.
- **Register**: repo prose — docs, comments, commit messages — is technical reference, not a blog. No emojis. Markdown is structure, never decoration: inline code for identifiers, bold for the defined term or the one load-bearing clause of an entry, tables for enumerable facts.

### Comments

1. A comment states what the code cannot: an invariant, a unit, a coordinate space, a why. Never narrate what the code does — nor when or how a fact was established (no dates, no probe stories; pin to a version or ticket).
2. A contract — an invariant, cross-module coupling, a why — lives in JSDoc at its **owning declaration** and may be as long as the contract needs; a cross-file mechanism is owned by its enforcing/orchestrating site, and every other site cites the owner (law 3), never re-explains. Non-contract prose stays one line. Outside the code live only cross-cutting rules (docs/ARCHITECTURE.md) and runtime quirks (docs/GMRT.md).
3. A known quirk or invariant is cited, never re-explained: `// #15549: no && reuse`, `// Time.raw: UI runs while paused`.
4. A file header is at most 2 lines: what the file is + one pointer.
5. JSDoc carries types and contracts, not essays: `@typedef`s, typed `@param`s, and the owning contract blocks (law 2) stay; prose restating the identifier goes. An opts-struct factory gets one prose block, no per-field `@param`.
6. JSDoc tags cluster, they don't stack: bare typed tags share a line (`@param {number} r @param {number} g @returns {number}`), wrapping whenever a line would pass 80 chars (the Prettier print width — comments included); a tag takes its own line only when it carries a description (typedef `@property` lists, a param needing a why).
7. Existing comments are grandfathered — tighten only code you are already touching (migration plan: docs/ROADMAP.md → Comment Refactor).

### API Naming

Members are short idiomatic verbs and nouns — `Entity.create`/`Entity.remove`, `Item.get`, `File.read`. The owner is the namespace: a member never restates it and never pads with filler (`createNew`, `getInfo`, `doUpdate`); a class is named for what it is (`Entity`), not its role pattern (`EntityManager`, `EntityStorage`, `*Helper`, `*Impl`). A qualifier exists only to split two real members (`add` vs `addSlot`, `read` vs `readBuffer`). Everything else a long name would carry belongs in JSDoc, not the identifier.

### Script Naming

A script's directory + filename matches the identifier it exposes, cased to JS norms — **PascalCase** for a class or namespace object (classes `World`/`Camera`; namespace objects `CameraFollow`/`CameraFly`), **camelCase** for a plain function (`teardownScene`). A script exposing a _family_ of free functions (no single matching global) is a **PascalCase category bucket**: the GemsUI kit (`GemsTheme`/`GemsContainers`/`GemsWidgets`/`GemsControls`), `Utils` (`noop`/`uuid`/`rem`), `UIDraw` (`drawUIArrow`/`drawUICheck`). GameMaker-asset families keep their conventional prefix (`scene*`, `Render*`, `*System`, `obj_*`/`rm_*`/`sh_*`).

### Media Asset Naming

`<prefix>_<family>_<subject>[_<variant>]`, all-lowercase **snake_case** after the GM type prefix (`spr_`/`snd_`/`mus_`/`sh_`/`ps_`/`obj_`/`rm_`).

- **`family`** names the CONSUMER that reads the asset — a closed set: `item` (bag icons, auto-wired — `spr_item_<item_id>`, the item id verbatim), `wear` (paper-doll overlay strips), `tex` (wall/floor face textures), `terrain` (dual-grid terrain sets), `tile` (autotile piece sets), `ui` (widget chrome/glyphs), `fx` (particle art). A **bare subject with no family tag is reserved for entity animation strips** (`spr_human`, `spr_rat`).
- **`subject`** is what a stranger would call the thing (1–3 words), material leading when it distinguishes same-object variants (`wooden_table`, `military_crate`), size/style qualifier **last** (`_small`, `_round`).
- **Game-data metadata never enters a name** — manufacturer/rarity/stats/tier live on the def (`maker`, `rarity`, ops) and reach the player through UI; a brand string appears only inside an item id the sprite mirrors (`spr_item_aeon_pistol` encodes "which item", not "which company").
- **Sounds**: `snd_<subject>[_<event>]` for SFX (`snd_gun_fire`, `snd_button_click`, bare `snd_coin`), `mus_<track>` for music.
- **Vox meshes** (plain files, not GM assets): the `.vox` template, `.vbuf` bake, and `Mesh.model` string share one `<material>_<object>[_<variant>]` name.
- **Legacy names**: the remaining pre-rule names are **grandfathered** — never rename as a sweep; migrate one only when already touching it (rename mechanics: see Resourcetool above). The set: the UI glyphs/lobby art (`spr_check`/`spr_play`/`spr_uibox`/…), unused spare icons (`spr_apple`), the `spr_fenceSquare`/`spr_fenceRound` sheets, and the `spr_tile16`/`spr_tilecornerRough` autotile sets.

### ECS Bootstrap

Each level owns its `Entity` store (canonically `this.entities = new Entity(maxEntities, opts)`); `World` is the world-manager singleton (`World.sim`, `World.levels`) and holds no entity data. The store's ubiquitous legacy name `world` (bindings + system params) is grandfathered — rename to `entities` only in files already being touched (plan: docs/ROADMAP.md → Code Review).

## GMRT-Safe Idioms

See @docs/GMRT.md for the full list — the GMRT JS runtime/compiler miscompiles or chokes on several standard JS forms, and that always-in-context reference catalogues the quirks still live on 0.20 by ownership/status (reported & tracked bugs with `[#00000]` tickets, unreported divergences, officially unsupported features, project idioms) plus the verified **Capabilities** to use freely. Avoid the quirks, don't "clean up" code back into them, and record new ones there as found.

## Architecture

See @docs/ARCHITECTURE.md — the always-loaded architecture doc (the layer map, the cross-cutting invariants, and the area index), kept in context alongside this file by the `@`-import. **The code is the primary reference**: module contracts live in JSDoc at their owning declarations (Comments law 2) — read an area's owning files before designing or modifying it. The legacy `docs/architecture/*.md` ledgers are frozen mid-migration into JSDoc (docs/ROADMAP.md → JSDoc Contract Migration): treat their claims as leads to verify against the code, never as authority, and add nothing to them.
