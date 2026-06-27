# GEMS Project Tree

A tiny, **local** VS Code extension that shows the GameMaker IDE folder tree
(Core / Gameplay / GemsUI / Demo / Media) in the Explorer sidebar — because
GameMaker stores every resource flat on disk (`scripts/<name>/`,
`sprites/<name>/`, …) and the IDE tree is virtual (encoded in `gems.yyp`'s
`Folders` list + each resource `.yy`'s `parent.path`), which VS Code's Explorer
can't see.

- **Read-only** — it mutates nothing. No symlinks/junctions/hardlinks, so
  there's nothing to drift, de-sync, or corrupt. Clicking a node opens the
  **real** source file (full IntelliSense, no jsconfig hacks).
- Scripts appear as flat `<name>.js` leaves; other resources open their `.yy`.
- **Live** — auto-refreshes when you add/move/rename assets (watches `*.yy` /
  `*.yyp`). Manual refresh + "reveal active file" buttons on the view title.
- Activates only in workspaces that contain a `.yyp`.

## Install (local, no marketplace)

From this folder:

```sh
npm run package    # -> gems-project-tree-<version>.vsix  (uses @vscode/vsce)
npm run install-ext
# then: Reload Window (Ctrl+Shift+P -> "Developer: Reload Window")
```

Or by hand:

```sh
npx --yes @vscode/vsce package
code --install-extension gems-project-tree-0.1.1.vsix --force
```

## Develop

Open this folder in VS Code and press **F5** to launch an Extension
Development Host with the extension loaded (no install needed while iterating).
It's plain JavaScript — no build/compile step.
