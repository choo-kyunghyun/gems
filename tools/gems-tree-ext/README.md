# GEMS Project Tree

A tiny, local VS Code extension that shows the GameMaker IDE folder tree
(`Core` / `Game`) in its own activity-bar sidebar — because GameMaker stores
every resource flat on disk (`scripts/<name>/`, `sprites/<name>/`, …) and the
IDE tree is virtual (encoded in `gems.yyp`'s `Folders` list + each resource
`.yy`'s `parent.path`), which VS Code's Explorer can't see.

- Read-only — it mutates nothing. No symlinks/junctions/hardlinks, so
  there's nothing to drift, de-sync, or corrupt. Clicking a node opens the
  real source file (full IntelliSense, no jsconfig hacks).
- Scripts appear as flat `<name>.js` leaves; other resources open their `.yy`.
- Live — auto-refreshes when you add/move/rename assets (watches `*.yy` /
  `*.yyp`), and the selection follows the active editor. Manual refresh and
  "reveal active file" buttons sit on the view title.
- Whatever folders the project declares are what it shows; a workspace with no
  `.yyp` gets an empty tree.

## Install (local, no marketplace)

From this folder:

```sh
npm run package    # -> gems-project-tree-<version>.vsix  (uses @vscode/vsce)
npm run install-ext
# then: Reload Window (Ctrl+Shift+P -> "Developer: Reload Window")
```

## Develop

Open this folder in VS Code and press F5 to launch an Extension
Development Host with the extension loaded (no install needed while iterating).
It's plain JavaScript — no build/compile step.
