#!/usr/bin/env python
"""Run a .py workflow script through the kit, with universal overrides.

  python generate.py workflows/pixel.py
  python generate.py workflows/testrun.py --seed 42 --runs 4
  python generate.py workflows/pixel.py --server host:port --out ./sprites --no-review

A workflow script defines build(graph, client) and (optionally) module-level
SERVER / OUTPUT_PATH / REVIEW / SEED constants -- the flags here override them.
Running a script directly (python workflows/pixel.py) uses its own defaults;
this runner adds seed sweeps (--runs) and one-off overrides without editing it.
"""

import argparse
import importlib.util
import os
import sys

import comfylib as C


def load_workflow(path):
    """Import a .py workflow as a module (its __main__ block does NOT run)."""
    if not os.path.isfile(path):
        raise C.ComfyError("workflow not found: " + path)
    # let the module's `import comfylib` / `import nodes` resolve to the kit dir
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    spec = importlib.util.spec_from_file_location("_workflow", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    if not hasattr(mod, "build"):
        raise C.ComfyError(path + ": no build(graph, client) function")
    return mod


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("workflow", help="path to a .py workflow script")
    ap.add_argument("--seed", type=int, help="override the script's SEED")
    ap.add_argument("--runs", type=int, default=1,
                    help="number of runs, consecutive seeds (default 1)")
    ap.add_argument("--out", help="override OUTPUT_PATH (dir for saved images)")
    ap.add_argument("--server", help="override the server host:port")
    ap.add_argument("--no-review", action="store_true",
                    help="save every image without the keep/discard prompt")
    args = ap.parse_args()

    mod = load_workflow(args.workflow)
    server = args.server or getattr(mod, "SERVER", None)
    output = args.out if args.out is not None else getattr(mod, "OUTPUT_PATH", "")
    review = getattr(mod, "REVIEW", True) and not args.no_review
    base = args.seed if args.seed is not None else getattr(mod, "SEED", 0)

    for i in range(args.runs):
        if hasattr(mod, "SEED"):
            mod.SEED = base + i  # build() reads the module global
        if args.runs > 1:
            print(f"[{i + 1}/{args.runs}] seed {base + i}")
        C.generate(mod.build, server=server, output=output, review=review)


if __name__ == "__main__":
    try:
        main()
    except C.ComfyError as e:
        print("ERROR:", e, file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\ninterrupted (the server keeps its queue -- jobs.py --interrupt)",
              file=sys.stderr)
        sys.exit(130)
