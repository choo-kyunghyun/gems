#!/usr/bin/env python3
"""comfy_anim — coherent animation via img2img (LOCAL DEP: ComfyUI server).

Refines a folder of frame PNGs (e.g. the agent hero frames) through img2img at a FIXED seed
+ LOW denoise: the agent frames supply the coherent motion (diffusion's weakness), img2img
adds consistent detail. Tests jitter-free structure-anchored animation AND bumps 16px frames
to 32px (the resolution question) in one go.

Reads out/<frames_subdir>/f*.png; writes out/anim/hybrid_hero_d<NN>/f*.png (32px, max fidelity).
Pack with common/pack.py afterwards, then compare.

Usage: python comfy_anim.py [frames_subdir] [denoise ...]
  default subdir: anim/agent_hero/frames   default sweep: 0.30 0.45
"""
import os, sys, re
import comfy_api as A
import comfy_graph as G

WORK = 256          # blockout upscaled to this; output = WORK/8 = 32px
SEED = 7777         # FIXED across every frame -> frame-to-frame coherence
POS = ("pixel art rpg character, a person, brown hair, blue shirt, brown boots, "
       "full body, front view, simple background, masterpiece, best quality")
NEG = "bad quality, worst quality, blurry, deformed, extra limbs"


def build(image_name, denoise):
    g = {}
    m, c, v = G.models(g)
    p, n = G.prompts(g, c, POS, NEG)
    lat = G.img2img_latent(g, v, image_name, WORK)
    lat = G.sample(g, m, p, n, lat, SEED, denoise=denoise)
    img = G.decode_downscale(g, lat, v)
    img = G.bg_removal(g, img)
    G.save(g, img, "animref")
    return g


def frame_files(subdir):
    d = os.path.join(A.KIT, "out", subdir)
    fs = [f for f in os.listdir(d) if re.match(r"f\d+\.png$", f)]
    return d, sorted(fs, key=lambda s: int(s[1:-4]))


def main():
    args = sys.argv[1:]
    subdir = "anim/agent_hero/frames"
    if args and "/" in args[0]:
        subdir = args[0]; args = args[1:]
    sweep = [float(a) for a in args] if args else [0.30, 0.45]
    d, files = frame_files(subdir)
    if not files:
        print(f"  ! no f*.png in out/{subdir} (run common/animate2.py first)")
        return
    print(f"refine {len(files)} frames from out/{subdir}  seed={SEED}  sweep={sweep}")
    names = {f: A.upload_image(os.path.join(d, f)) for f in files}  # upload once
    for dn in sweep:
        dd = int(round(dn * 100))
        outd = A.out_dir("anim", f"hybrid_hero_d{dd}")
        for f in files:
            imgs = A.run_job(build(names[f], dn))
            if imgs:
                im = imgs[0]
                blob = A.view(im["filename"], im.get("subfolder", ""), im.get("type", "output"))
                open(os.path.join(outd, f), "wb").write(blob)
        print(f"  d{dd}: {len(files)} frames -> out/anim/hybrid_hero_d{dd}")


if __name__ == "__main__":
    main()
