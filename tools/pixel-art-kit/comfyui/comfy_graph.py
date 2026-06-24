#!/usr/bin/env python3
"""comfy_graph — composable node-group builders for the pixel pipeline.

Each builder writes nodes into a graph dict `g` (keyed by stable string ids) and returns
the output socket ref(s) so stages chain. Mix them to make new workflows: text2img =
models -> prompts -> empty_latent -> sample -> decode_downscale -> bg_removal -> save;
img2img swaps empty_latent for img2img_latent. NOTE: no AsepriteQuantize node — output is
**max fidelity** (full-color 32px); palette reduction is a separate step (common/quantize.py).
"""
# Model filenames are NOT hard-coded here — the drivers pass them in from the local config
# (comfy_api.config()), so this kit ships no specific/licensed model names. Sampler + scheduler
# are generic technical defaults.
SAMPLER, SCHED = "euler_ancestral", "normal"


def models(g, ckpt, lora, lora_str=1.0, clip_skip=-2):
    g["ckpt"] = {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": ckpt}}
    g["lora"] = {"class_type": "LoraLoader",
                 "inputs": {"model": ["ckpt", 0], "clip": ["ckpt", 1], "lora_name": lora,
                            "strength_model": lora_str, "strength_clip": lora_str}}
    g["clip"] = {"class_type": "CLIPSetLastLayer",
                 "inputs": {"clip": ["lora", 1], "stop_at_clip_layer": clip_skip}}
    return ["lora", 0], ["clip", 0], ["ckpt", 2]  # model, clip, vae


def prompts(g, clip_ref, pos, neg):
    g["pos"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": clip_ref, "text": pos}}
    g["neg"] = {"class_type": "CLIPTextEncode", "inputs": {"clip": clip_ref, "text": neg}}
    return ["pos", 0], ["neg", 0]


def empty_latent(g, size, batch):
    """Logical `size` px latent upscaled 8x (nearest) -> samples at size*8 px; the matching
    0.125 downscale in decode_downscale brings it back to `size` px. The 8x MUST equal the
    pixel-art LoRA's training scale (8x or 16x) — change both ends together for a 16x LoRA."""
    g["elat"] = {"class_type": "EmptyLatentImage",
                 "inputs": {"width": size, "height": size, "batch_size": batch}}
    g["lup"] = {"class_type": "LatentUpscaleBy",
                "inputs": {"samples": ["elat", 0], "upscale_method": "nearest-exact", "scale_by": 8}}
    return ["lup", 0]


def img2img_latent(g, vae_ref, image_name, work=256):
    """Encode an uploaded blockout (upscaled nearest to `work` px) into the latent — output
    will be work/8 px after decode_downscale."""
    g["load"] = {"class_type": "LoadImage", "inputs": {"image": image_name}}
    g["iscale"] = {"class_type": "ImageScale",
                   "inputs": {"image": ["load", 0], "upscale_method": "nearest-exact",
                              "width": work, "height": work, "crop": "disabled"}}
    g["enc"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["iscale", 0], "vae": vae_ref}}
    return ["enc", 0]


def sample(g, model_ref, pos_ref, neg_ref, latent_ref, seed, steps=30, cfg=7, denoise=1.0):
    g["ks"] = {"class_type": "KSampler",
               "inputs": {"model": model_ref, "positive": pos_ref, "negative": neg_ref,
                          "latent_image": latent_ref, "seed": seed, "steps": steps, "cfg": cfg,
                          "sampler_name": SAMPLER, "scheduler": SCHED, "denoise": denoise}}
    return ["ks", 0]


def decode_downscale(g, latent_ref, vae_ref, down=0.125):
    g["dec"] = {"class_type": "VAEDecode", "inputs": {"samples": latent_ref, "vae": vae_ref}}
    g["ds"] = {"class_type": "ImageScaleBy",
               "inputs": {"image": ["dec", 0], "upscale_method": "nearest-exact", "scale_by": down}}
    return ["ds", 0]


def bg_removal(g, image_ref, model):
    g["bgmodel"] = {"class_type": "LoadBackgroundRemovalModel", "inputs": {"bg_removal_name": model}}
    g["bg"] = {"class_type": "RemoveBackground", "inputs": {"bg_removal_model": ["bgmodel", 0], "image": image_ref}}
    g["invmask"] = {"class_type": "InvertMask", "inputs": {"mask": ["bg", 0]}}
    g["join"] = {"class_type": "JoinImageWithAlpha", "inputs": {"image": image_ref, "alpha": ["invmask", 0]}}
    return ["join", 0]


def save(g, image_ref, prefix, node="save"):
    g[node] = {"class_type": "SaveImage", "inputs": {"images": image_ref, "filename_prefix": prefix}}
    return node
