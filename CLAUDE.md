# CLAUDE

Project guidelines for Claude Code.

## Project Overview

- This project is G.E.M.S. (GameMaker Entity & Map System), a public repository under the MIT license — exercise caution with all code and actions.
- It uses GMRT, the new runtime for GameMaker, with JavaScript as the scripting language.
- It follows the ECS pattern: entities are ids, components are pure data, and logic runs separately from the data.

## Working Guidelines

- Plan before implementing.
- After changing code, run the game and verify the behavior. Verification is reported in conversation, never written into the repo — no run output or "verified <date>" stamps in code, docs, or commit messages.
- A comment states only what the code cannot, briefly.
    - A known runtime quirk is cited from `docs/GMRT.md`, never re-explained.
    - Runtime quirks and future work carry a conventional tag such as `TODO` or `BUG`.
- Commit messages are `type(scope): what changed` — one line, imperative, pitched at the module or rule that changed.
- Don't hide errors; an object never handles an error that is not its responsibility.
- Never cite or mention other GitHub repositories or external projects directly.
    - An external link only as a required license attribution or with the user's permission.
    - An upstream ticket is tool + bare number (`gm-cli #000`, GMRT `#00000`), never an issue URL or `owner/repo#n`.
- Names — API members, scripts, media assets — are short, consistent terms per `docs/NAMING.md`.
- Record newly discovered knowledge in subdocuments under `docs/`, not in CLAUDE.md.

## GameMaker CLI

@docs/GMCLI.md

## GMRT

`docs/GMRT.md` is the deny-list of JS forms and built-ins the pinned runtime breaks — read it before writing or modifying any script. When verification reveals unexpected runtime behavior, check the doc and record the quirk there.

## Architecture

Read `docs/ARCHITECTURE.md` before modifying code.

## Debugging

- Log with `Log`, then read `%LOCALAPPDATA%/gems/game.log`.
    - An uncaught runtime error is logged (`UNHANDLED EXCEPTION`) unless the runtime died natively.
- `Screenshot.take()` captures the screen on the frame it runs; capture under different names at different frames to compare, then read the PNGs from `%LOCALAPPDATA%/gems/screenshots/`.
- Inspect entity state with `entities.dump()`.
- Drive a debug run with a temporary frame counter in the `Game` object's `Step` event: log/screenshot at the target frames, then call `game_end()` a few frames later so the run exits on its own.

## Tools

`tools/` holds standalone tools independent of GameMaker; when the user asks for one, read its `README` first. The committed `snd*`/`mus*` set is hand-authored — read audio-kit's GEMS.md before re-running any importer.
