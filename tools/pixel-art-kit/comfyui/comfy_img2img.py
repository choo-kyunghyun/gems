#!/usr/bin/env python3
"""comfy_img2img — hybrid driver: agent blockout -> ComfyUI img2img (LOCAL DEP: server).

Composes comfy_graph: uploads out/agent/<subject>.png as the structural blockout, runs
img2img across a denoise sweep (low keeps the blockout's shape -> kills text2img drift;
high maximizes detail). **Max fidelity** output (no quantize) -> out/hybrid_d<NN>/<subject>.png;
run common/quantize.py afterwards to lock a palette.

Usage: python comfy_img2img.py [subject ...]   (default all; sweep 0.45/0.65/0.85)
"""
import os, sys
import comfy_api as A
import comfy_graph as G
import comfy_run as R   # reuse PROMPTS / NEG / SUFFIX

SWEEP = [0.45, 0.65, 0.85]
WORK = 256  # blockout upscaled to this; output = WORK/8 = 32px


def build(subject, image_name, seed, denoise):
    g = {}
    m, c, v = G.models(g)
    p, n = G.prompts(g, c, R.PROMPTS[subject] + "\n\n" + R.SUFFIX, R.NEG)
    lat = G.img2img_latent(g, v, image_name, WORK)
    lat = G.sample(g, m, p, n, lat, seed, denoise=denoise)
    img = G.decode_downscale(g, lat, v)
    img = G.bg_removal(g, img)
    G.save(g, img, f"hybrid/{subject}")
    return g


def main():
    subjects = sys.argv[1:] or list(R.PROMPTS)
    print(f"img2img {subjects} sweep={SWEEP}")
    names = {}
    for s in subjects:
        bp = os.path.join(A.KIT, "out", "agent", s + ".png")
        if not os.path.isfile(bp):
            print(f"  ! missing blockout {bp} (run common/draw.py first)")
            continue
        names[s] = A.upload_image(bp)
    for d in SWEEP:
        dd = int(round(d * 100))
        out_dir, batch_dir = A.out_dir(f"hybrid_d{dd}"), A.out_dir(f"hybrid_d{dd}", "_batch")
        for s in subjects:
            if s not in names:
                continue
            seed = hash(s) & 0x7FFFFFFF  # fixed per subject -> denoise axis is comparable
            imgs = A.run_job(build(s, names[s], seed, d))
            for i, im in enumerate(imgs):
                blob = A.view(im["filename"], im.get("subfolder", ""), im.get("type", "output"))
                open(os.path.join(batch_dir, f"{s}_{i}.png"), "wb").write(blob)
                if i == 0:
                    open(os.path.join(out_dir, f"{s}.png"), "wb").write(blob)
            print(f"  {s} d{dd}: {len(imgs)} imgs")


if __name__ == "__main__":
    main()
