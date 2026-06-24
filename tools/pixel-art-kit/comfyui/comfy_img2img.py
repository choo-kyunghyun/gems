#!/usr/bin/env python3
"""comfy_img2img — hybrid driver: agent blockout -> ComfyUI img2img (LOCAL DEP: server).

Uploads out/agent/<subject>.png as the structural blockout and runs img2img across a denoise sweep
(low keeps the blockout's shape -> kills text2img drift; high maximizes detail). Model filenames +
prompts come from the local config (`local/comfy.config.json`, gitignored). **Max fidelity** output
(no quantize) -> out/hybrid_d<NN>/<subject>.png; run common/quantize.py afterwards to lock a palette.

Usage: python comfy_img2img.py [subject ...]   (default all configured; sweep 0.45/0.65/0.85)
"""
import os, sys
import comfy_api as A
import comfy_graph as G

SWEEP = [0.45, 0.65, 0.85]
WORK = 256  # blockout upscaled to this; output = WORK/8 = 32px


def build(subject, image_name, seed, denoise):
    cfg = A.config()
    g = {}
    m, c, v = G.models(g, cfg["ckpt"], cfg["lora"], cfg.get("lora_strength", 1.0))
    p, n = G.prompts(g, c, cfg["prompts"][subject] + "\n\n" + cfg["suffix"], cfg["neg"])
    lat = G.img2img_latent(g, v, image_name, WORK)
    lat = G.sample(g, m, p, n, lat, seed, denoise=denoise)
    img = G.decode_downscale(g, lat, v)
    img = G.bg_removal(g, img, cfg["birefnet"])
    G.save(g, img, f"hybrid/{subject}")
    return g


def main():
    subjects = sys.argv[1:] or list(A.config()["prompts"])
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
