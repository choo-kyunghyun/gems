#!/usr/bin/env python
"""Inventory a running ComfyUI server: version, VRAM, and installed models.

  python probe.py                    # stats + all model lists + samplers
  python probe.py --node KSampler    # dump one node class's input spec
  python probe.py --server host:port

The model lists are the raw material for the combination hunt -- pair with a
workflow authored in the GUI and sweep seeds via generate.py.
"""

import argparse
import json
import sys

import comfylib as C

# loader class -> input holding the model-file dropdown
MODEL_SOURCES = [
    ("checkpoints", "CheckpointLoaderSimple", "ckpt_name"),
    ("diffusion models (unet)", "UNETLoader", "unet_name"),
    ("clip", "CLIPLoader", "clip_name"),
    ("vae", "VAELoader", "vae_name"),
    ("loras", "LoraLoader", "lora_name"),
    ("controlnets", "ControlNetLoader", "control_net_name"),
    ("upscalers", "UpscaleModelLoader", "model_name"),
]


def options(client, node_class, input_name):
    """The dropdown options list for one node input, or None if unavailable."""
    try:
        info = client.object_info(node_class).get(node_class)
    except C.ComfyError:
        return None
    if not info:
        return None
    spec = (info.get("input", {}).get("required", {}).get(input_name)
            or info.get("input", {}).get("optional", {}).get(input_name))
    if isinstance(spec, list) and spec and isinstance(spec[0], list):
        return spec[0]
    return None


def print_stats(client):
    stats = client.system_stats()
    system = stats.get("system", {})
    print(f"ComfyUI @ {client.server}")
    print(f"  version : {system.get('comfyui_version', '?')}"
          f"   pytorch {system.get('pytorch_version', '?')}")
    for dev in stats.get("devices", []):
        total = dev.get("vram_total", 0) / 2 ** 30
        free = dev.get("vram_free", 0) / 2 ** 30
        print(f"  device  : {dev.get('name', '?')}  "
              f"vram {free:.1f} / {total:.1f} GiB free")


def print_models(client):
    for label, node_class, input_name in MODEL_SOURCES:
        opts = options(client, node_class, input_name)
        if opts is None:
            print(f"\n{label}: (node {node_class} not available)")
            continue
        print(f"\n{label} ({len(opts)}):")
        for o in opts:
            print(f"  {o}")
    samplers = options(client, "KSampler", "sampler_name") or []
    schedulers = options(client, "KSampler", "scheduler") or []
    print(f"\nsamplers  : {', '.join(samplers)}")
    print(f"schedulers: {', '.join(schedulers)}")


def print_node(client, node_class):
    info = client.object_info(node_class).get(node_class)
    if not info:
        raise C.ComfyError(f"node class {node_class!r} not found on the server")
    print(f"{node_class} -- {info.get('description') or info.get('display_name', '')}")
    for group in ("required", "optional"):
        spec = info.get("input", {}).get(group, {})
        if not spec:
            continue
        print(f"  {group}:")
        for name, entry in spec.items():
            kind = entry[0] if isinstance(entry, list) and entry else entry
            extra = entry[1] if isinstance(entry, list) and len(entry) > 1 else None
            if isinstance(kind, list):  # dropdown
                kind = f"one of {len(kind)} options" if len(kind) > 8 else \
                    "|".join(str(k) for k in kind)
            line = f"    {name}: {kind}"
            if isinstance(extra, dict) and "default" in extra:
                line += f" (default {json.dumps(extra['default'])})"
            print(line)


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--node", metavar="CLASS",
                    help="dump one node class's input spec instead")
    ap.add_argument("--server", help="host:port (default: local/config.json "
                                     "or " + C.DEFAULT_SERVER + ")")
    args = ap.parse_args()

    client = C.Client(server=args.server)
    if args.node:
        print_node(client, args.node)
    else:
        print_stats(client)
        print_models(client)


if __name__ == "__main__":
    try:
        main()
    except C.ComfyError as e:
        print("ERROR:", e, file=sys.stderr)
        sys.exit(1)
