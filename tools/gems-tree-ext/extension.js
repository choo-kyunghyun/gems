// GEMS Project Tree — a read-only VS Code sidebar that mirrors the GameMaker
// IDE folder tree. GameMaker keeps every resource flat on disk under
// `scripts/<name>/`, `sprites/<name>/`, ...; the IDE tree is virtual, encoded
// in `gems.yyp` (the `Folders` list) + each resource `.yy`'s `parent.path`.
// This reads that and presents a tree whose leaves open the REAL files — no
// links, no filesystem mutation, nothing to drift or de-sync. Scripts show as
// flat `<name>.js` leaves; other resources show by name and open their `.yy`.
// Auto-refreshes when the project changes.

const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

// GameMaker .yy/.yyp are JSON with trailing commas — not valid JSON.
function readYY(file) {
  try {
    const raw = fs.readFileSync(file, "utf8").replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

class Node {
  constructor(label, kind) {
    this.label = label;
    this.kind = kind; // "folder" | "resource"
    this.children = [];
    this.parent = null;
    this.file = null; // resource: absolute path to open
    this.id = null; // stable, unique tree id
  }
}

class GemsTreeProvider {
  constructor(root) {
    this.root = root;
    this._emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._emitter.event;
    this.roots = [];
    this.byFile = new Map(); // lowercased abs path -> Node (for reveal)
    this.build();
  }

  _findYyp() {
    try {
      const hit = fs.readdirSync(this.root).find((f) => f.endsWith(".yyp"));
      return hit ? path.join(this.root, hit) : null;
    } catch (e) {
      return null;
    }
  }

  build() {
    this.roots = [];
    this.byFile = new Map();
    const yyp = this._findYyp();
    const proj = yyp && readYY(yyp);
    if (!proj) return;

    // folderPath ("folders/Core/Render.yy") -> folder Node, creating ancestors.
    const folders = new Map();
    const ensureFolder = (folderPath) => {
      if (folders.has(folderPath)) return folders.get(folderPath);
      const inner = folderPath.replace(/^folders\//, "").replace(/\.yy$/, "");
      const segs = inner.split("/");
      const node = new Node(segs[segs.length - 1], "folder");
      node.id = "folder:" + folderPath;
      folders.set(folderPath, node);
      if (segs.length === 1) {
        this.roots.push(node);
      } else {
        const parent = ensureFolder("folders/" + segs.slice(0, -1).join("/") + ".yy");
        parent.children.push(node);
        node.parent = parent;
      }
      return node;
    };
    for (const f of proj.Folders || []) {
      if (f && f.folderPath) ensureFolder(f.folderPath);
    }

    for (const r of proj.resources || []) {
      const ref = r && r.id;
      if (!ref || !ref.path) continue;
      const resPath = ref.path; // "scripts/World/World.yy"
      const name = ref.name || path.basename(resPath, ".yy");
      const resType = resPath.split("/")[0]; // "scripts" | "sprites" | ...
      const resDir = path.join(this.root, path.dirname(resPath));

      // scripts -> flat <name>.js leaf; everything else -> name, opens its .yy
      const js = path.join(resDir, name + ".js");
      const isScript = resType === "scripts" && fs.existsSync(js);
      const node = new Node(isScript ? name + ".js" : name, "resource");
      node.file = isScript ? js : path.join(this.root, resPath);
      node.id = "res:" + resPath;
      this.byFile.set(node.file.toLowerCase(), node);

      const yy = readYY(path.join(this.root, resPath));
      const parentPath = yy && yy.parent && yy.parent.path;
      const parent = parentPath ? ensureFolder(parentPath) : null;
      if (parent) {
        parent.children.push(node);
        node.parent = parent;
      } else {
        this.roots.push(node);
      }
    }

    this._sort(this.roots);
  }

  _sort(nodes) {
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1; // folders first
      return a.label.localeCompare(b.label);
    });
    for (const n of nodes) if (n.children.length) this._sort(n.children);
  }

  refresh() {
    this.build();
    this._emitter.fire();
  }

  nodeForFile(file) {
    return file ? this.byFile.get(file.toLowerCase()) : undefined;
  }

  // --- TreeDataProvider ---
  getChildren(node) {
    return node ? node.children : this.roots;
  }

  getParent(node) {
    return node ? node.parent : null;
  }

  getTreeItem(node) {
    const state =
      node.kind === "folder"
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;
    const item = new vscode.TreeItem(node.label, state);
    item.id = node.id;
    if (node.kind === "folder") {
      item.iconPath = new vscode.ThemeIcon("folder");
      item.contextValue = "gemsFolder";
    } else {
      const uri = vscode.Uri.file(node.file);
      item.resourceUri = uri; // lets the file-icon theme pick the icon
      item.contextValue = "gemsResource";
      item.tooltip = vscode.workspace.asRelativePath(node.file);
      item.command = { command: "vscode.open", title: "Open", arguments: [uri] };
    }
    return item;
  }
}

function activate(context) {
  const folder =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  if (!folder) return;
  const provider = new GemsTreeProvider(folder.uri.fsPath);
  const view = vscode.window.createTreeView("gemsProjectTree", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  context.subscriptions.push(view);

  context.subscriptions.push(
    vscode.commands.registerCommand("gemsProjectTree.refresh", () =>
      provider.refresh()
    )
  );

  const reveal = (file) => {
    const node = provider.nodeForFile(file);
    if (node && view.visible) {
      try {
        view.reveal(node, { select: true, focus: false });
      } catch (e) {
        /* node not yet materialized — ignore */
      }
    }
  };
  context.subscriptions.push(
    vscode.commands.registerCommand("gemsProjectTree.revealActive", () => {
      const ed = vscode.window.activeTextEditor;
      if (ed) reveal(ed.document.uri.fsPath);
    }),
    vscode.window.onDidChangeActiveTextEditor((ed) => {
      if (ed && ed.document.uri.scheme === "file") reveal(ed.document.uri.fsPath);
    })
  );

  // Auto-refresh on project-structure changes (asset add/move/rename), debounced.
  let timer = null;
  const bump = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => provider.refresh(), 400);
  };
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.{yy,yyp}");
  watcher.onDidCreate(bump);
  watcher.onDidDelete(bump);
  watcher.onDidChange(bump);
  context.subscriptions.push(watcher);
}

function deactivate() {}

module.exports = { activate, deactivate };
