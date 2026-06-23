#!/usr/bin/env python3
"""comfy_run — ComfyUI pixel text2img driver (LOCAL DEPENDENCY: a running server).

Composes comfy_graph builders into the pixel-batch text2img pipeline (waiIllustrious +
pixel LoRA, logical 16/32 px, BiRefNet alpha). Output is **max fidelity** (full-color
32px) — no palette reduction here; run common/quantize.py separately to lock a palette.

Saves out/comfyui[16]/<subject>.png (first of batch) + _batch/ variants.
Usage: python comfy_run.py [16|32] [subject ...]   (default 32, all subjects)
"""
import os, sys, random
import comfy_api as A
import comfy_graph as G

BATCH = 6
NEG = "bad quality, worst quality, worst detail, sketch, censor"
SUFFIX = "masterpiece, best quality, amazing quality, no humans, simple background"
PROMPTS = {
    "potion": "red health potion, glass flask with cork",
    "coin": "a single gold coin",
    "sword": "a sword",
    "bed": "a bed, top down view",
}


def build(subject, size, batch, seed):
    g = {}
    m, c, v = G.models(g)
    p, n = G.prompts(g, c, PROMPTS[subject] + "\n\n" + SUFFIX, NEG)
    lat = G.empty_latent(g, size, batch)
    lat = G.sample(g, m, p, n, lat, seed, denoise=1.0)
    img = G.decode_downscale(g, lat, v)
    img = G.bg_removal(g, img)
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
    subjects = args or list(PROMPTS)
    sub = "comfyui" if size == 32 else f"comfyui{size}"
    out_dir, batch_dir = A.out_dir(sub), A.out_dir(sub, "_batch")
    print(f"text2img {subjects} size={size} batch={BATCH} -> out/{sub}")
    for s in subjects:
        run_subject(s, size, out_dir, batch_dir)


if __name__ == "__main__":
    main()
