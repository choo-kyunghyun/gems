#!/usr/bin/env python3
"""comfy_run — ComfyUI pixel text2img driver (LOCAL DEPENDENCY: a running server).

Composes comfy_graph into a text2img pipeline (an SDXL checkpoint + a pixel-art LoRA + BiRefNet
alpha), logical 16/32 px. Model filenames + prompts come from the local config
(`local/comfy.config.json`, gitignored) — the kit ships none. Output is **max fidelity**
(full-color) — run common/quantize.py separately to lock a palette.

Saves out/comfyui[16]/<subject>.png (first of batch) + _batch/ variants.
Usage: python comfy_run.py [16|32] [subject ...]   (default 32, all configured subjects)
"""
import os, sys, random
import comfy_api as A
import comfy_graph as G

BATCH = 6


def build(subject, size, batch, seed):
    cfg = A.config()
    g = {}
    m, c, v = G.models(g, cfg["ckpt"], cfg["lora"], cfg.get("lora_strength", 1.0))
    p, n = G.prompts(g, c, cfg["prompts"][subject] + "\n\n" + cfg["suffix"], cfg["neg"])
    lat = G.empty_latent(g, size, batch)
    lat = G.sample(g, m, p, n, lat, seed, denoise=1.0)
    img = G.decode_downscale(g, lat, v)
    img = G.bg_removal(g, img, cfg["birefnet"])
    G.save(g, img, f"pixelcmp/{subject}{size}")
    return g


def run_subject(subject, size, out_dir, batch_dir):
    seed = random.randint(0, 2**31)
    imgs = A.run_job(build(subject, size, BATCH, seed))
    for i, im in enumerate(imgs):
        blob = A.view(im["filename"], im.get("subfolder", ""), im.get("type", "output"))
        open(os.path.join(batch_dir, f"{subject}_{i}.png"), "wb").write(blob)
        if i == 0:
            open(os.path.join(out_dir, f"{subject}.png"), "wb").write(blob)
    print(f"  {subject}: {len(imgs)} imgs (seed {seed})")


def main():
    args = sys.argv[1:]
    size = 32
    if args and args[0] in ("16", "32"):
        size = int(args[0]); args = args[1:]
    subjects = args or list(A.config()["prompts"])
    sub = "comfyui" if size == 32 else f"comfyui{size}"
    out_dir, batch_dir = A.out_dir(sub), A.out_dir(sub, "_batch")
    print(f"text2img {subjects} size={size} batch={BATCH} -> out/{sub}")
    for s in subjects:
        run_subject(s, size, out_dir, batch_dir)


if __name__ == "__main__":
    main()
