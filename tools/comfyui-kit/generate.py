#!/usr/bin/env python
"""Queue a ComfyUI workflow (API format) with overrides, wait, save the images.

The workflow file IS the model combination (checkpoint/LoRA/sampler wiring) --
author it in the ComfyUI GUI and export with 'Export (API)', or write it as a
Python script defining build() over comfylib.Graph; drop either in workflows/
(gitignored). This script only overrides the per-run knobs:

  python generate.py workflows/flux_items.json -p "a flat wrench icon" --runs 4
  python generate.py wf.json -p "..." -n "blurry" --seed 42 --size 512x512
  python generate.py wf.json --set "KSampler.steps=30" --set "6.text=hello"
  python generate.py wf.json -p "..." --dry-run     # show what would be set

Each run lands in out/<name>/<stamp>-s<seed>/ with the images plus run.json
(server, seed, overrides, prompt_id, and the FINAL graph) -- the reproducible
record for comparing combinations. Default seed is random; --seed fixes it;
--runs N sweeps N consecutive seeds.
"""

import argparse
import copy
import datetime
import json
import os
import random
import sys

import comfylib as C


def apply_prompt(graph, text, negative):
    """Set positive/negative prompt text by tracing sampler conditioning links
    back to the text-encode nodes. Returns (positive_ids, negative_ids)."""
    set_pos, set_neg = [], []
    # standard samplers: inputs.positive / inputs.negative links
    for nid, n in graph.items():
        ins = n.get("inputs") or {}
        for key, val, bucket in (("positive", text, set_pos),
                                 ("negative", negative, set_neg)):
            if val is None or not C.is_link(ins.get(key)):
                continue
            tid = C.trace_text_node(graph, ins[key])
            if tid is not None and tid not in bucket:
                _set_text(graph[tid], val)
                bucket.append(tid)
    # guider-style graphs (Flux: BasicGuider has one `conditioning`, no negative)
    if text is not None and not set_pos:
        for nid, n in graph.items():
            ins = n.get("inputs") or {}
            if C.is_link(ins.get("conditioning")):
                tid = C.trace_text_node(graph, ins["conditioning"])
                if tid is not None and tid not in set_pos:
                    _set_text(graph[tid], text)
                    set_pos.append(tid)
    # last resort: a single text-encode node in the whole graph
    if text is not None and not set_pos:
        encoders = [nid for nid, n in graph.items()
                    if any(isinstance((n.get("inputs") or {}).get(k), str)
                           for k in C.TEXT_KEYS)]
        if len(encoders) == 1:
            _set_text(graph[encoders[0]], text)
            set_pos.append(encoders[0])
    return set_pos, set_neg


def _set_text(node, value):
    ins = node["inputs"]
    for k in C.TEXT_KEYS:
        if isinstance(ins.get(k), str):
            ins[k] = value


def apply_seed(graph, seed):
    """Set every literal seed/noise_seed input; returns the node ids touched."""
    touched = []
    for nid, n in graph.items():
        ins = n.get("inputs") or {}
        for key in ("seed", "noise_seed"):
            if isinstance(ins.get(key), (int, float)):
                ins[key] = seed
                touched.append(nid)
    return touched


def apply_size(graph, width, height, batch):
    """Set width/height/batch_size on empty-latent nodes; returns ids touched."""
    touched = []
    for nid, n in graph.items():
        if "Latent" not in n.get("class_type", ""):
            continue
        ins = n.get("inputs") or {}
        hit = False
        if width is not None and isinstance(ins.get("width"), (int, float)):
            ins["width"] = width
            hit = True
        if height is not None and isinstance(ins.get("height"), (int, float)):
            ins["height"] = height
            hit = True
        if batch is not None and isinstance(ins.get("batch_size"), (int, float)):
            ins["batch_size"] = batch
            hit = True
        if hit:
            touched.append(nid)
    return touched


def apply_sets(graph, sets):
    """--set 'node.input=value' overrides; node = id or exact title."""
    for spec in sets:
        if "=" not in spec:
            raise C.ComfyError(f"--set {spec!r}: expected node.input=value")
        target, value = spec.split("=", 1)
        if "." not in target:
            raise C.ComfyError(f"--set {spec!r}: expected node.input=value")
        node_key, input_key = target.rsplit(".", 1)
        hits = C.resolve_nodes(graph, node_key)
        if not hits:
            raise C.ComfyError(f"--set {spec!r}: no node with id, title, or "
                               f"class {node_key!r} in the workflow")
        if len(hits) > 1:
            raise C.ComfyError(f"--set {spec!r}: {node_key!r} is ambiguous "
                               f"(nodes {', '.join(hits)}) -- use the node id")
        nid = hits[0]
        try:
            parsed = json.loads(value)  # numbers/bools/null/quoted strings
        except ValueError:
            parsed = value  # bare string
        graph[nid].setdefault("inputs", {})[input_key] = parsed


def parse_size(s):
    try:
        w, h = s.lower().split("x", 1)
        return int(w), int(h)
    except ValueError:
        raise argparse.ArgumentTypeError(f"{s!r}: expected WxH, e.g. 512x512")


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("workflow",
                    help="API-format workflow JSON, or a .py defining build()")
    ap.add_argument("-p", "--prompt", help="positive prompt text")
    ap.add_argument("-n", "--negative", help="negative prompt text")
    ap.add_argument("--seed", type=int, help="fixed seed (default: random)")
    ap.add_argument("--runs", type=int, default=1,
                    help="number of runs, consecutive seeds (default 1)")
    ap.add_argument("--size", type=parse_size, metavar="WxH",
                    help="latent width x height, e.g. 512x512")
    ap.add_argument("--batch", type=int, help="latent batch_size")
    ap.add_argument("--set", action="append", default=[], metavar="NODE.INPUT=V",
                    help="generic override; NODE is an id, exact title, or "
                         "class_type (repeatable)")
    ap.add_argument("--name", help="output folder name (default: workflow stem)")
    ap.add_argument("--server", help="host:port (default: local/config.json "
                                     "or " + C.DEFAULT_SERVER + ")")
    ap.add_argument("--timeout", type=float, default=600,
                    help="per-run wait timeout in seconds (default 600)")
    ap.add_argument("--dry-run", action="store_true",
                    help="show what would be overridden, don't submit")
    args = ap.parse_args()

    graph = C.load_workflow(args.workflow)
    client = C.Client(server=args.server)
    name = args.name or os.path.splitext(os.path.basename(args.workflow))[0]
    width, height = args.size if args.size else (None, None)

    # apply the non-seed overrides once on a template copy so --dry-run and
    # every run agree; the seed is per run
    template = copy.deepcopy(graph)
    pos, neg = apply_prompt(template, args.prompt, args.negative)
    sized = apply_size(template, width, height, args.batch)
    apply_sets(template, args.set)

    if args.prompt is not None and not pos:
        print("WARNING: --prompt matched no text node -- use --set NODE.text=...")
    if args.negative is not None and not neg:
        print("WARNING: --negative matched no text node -- use --set NODE.text=...")
    if (args.size or args.batch is not None) and not sized:
        print("WARNING: --size/--batch matched no latent node -- use --set")

    def label(nid):
        t = C.title(template[nid])
        return f"{nid} ({t})" if t else nid

    seed_base = args.seed if args.seed is not None else random.randrange(2 ** 31)
    seeded = apply_seed(copy.deepcopy(template), seed_base)  # probe only

    print(f"workflow : {args.workflow} ({len(template)} nodes)")
    print(f"server   : {client.server}")
    if pos:
        print(f"positive : {', '.join(label(n) for n in pos)}")
    if neg:
        print(f"negative : {', '.join(label(n) for n in neg)}")
    if sized:
        print(f"latent   : {', '.join(label(n) for n in sized)}")
    print(f"seed     : {seed_base}"
          + (f" (+{args.runs - 1} consecutive)" if args.runs > 1 else "")
          + (f" -> {', '.join(label(n) for n in seeded)}" if seeded
             else "  WARNING: no seed input found"))
    if args.dry_run:
        print("dry run -- nothing submitted")
        return

    for i in range(args.runs):
        seed = seed_base + i
        g = copy.deepcopy(template)
        apply_seed(g, seed)

        prompt_id = client.submit(g)
        stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        run_dir = os.path.join(C.OUT_DIR, name, f"{stamp}-s{seed}")
        print(f"[{i + 1}/{args.runs}] queued {prompt_id} (seed {seed})")

        def tick(elapsed, position):
            state = "running" if position == 0 else (
                f"queue position {position}" if position else "waiting")
            sys.stdout.write(f"\r  {elapsed:5.0f}s  {state}   ")
            sys.stdout.flush()

        entry = client.wait(prompt_id, timeout=args.timeout, on_tick=tick)
        sys.stdout.write("\r" + " " * 40 + "\r")
        files = client.download_outputs(entry, run_dir)

        manifest = {
            "server": client.server,
            "workflow": os.path.abspath(args.workflow),
            "prompt": args.prompt,
            "negative": args.negative,
            "seed": seed,
            "size": list(args.size) if args.size else None,
            "batch": args.batch,
            "set": args.set,
            "prompt_id": prompt_id,
            "files": [os.path.basename(f) for f in files],
            "graph": g,
        }
        with open(os.path.join(run_dir, "run.json"), "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)

        rel = os.path.relpath(run_dir, C.KIT_DIR)
        print(f"  {len(files)} file(s) -> {rel}")
        for p in files:
            print(f"    {os.path.basename(p)}")


if __name__ == "__main__":
    try:
        main()
    except C.ComfyError as e:
        print("ERROR:", e, file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\ninterrupted (the server keeps running its queue -- jobs.py "
              "--interrupt to stop it)", file=sys.stderr)
        sys.exit(130)
