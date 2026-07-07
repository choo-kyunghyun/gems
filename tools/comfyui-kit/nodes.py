"""ComfyUI node builders for comfyui-kit workflow scripts.

One small function per ComfyUI node class. Each takes the Graph first, registers
its node, and returns its output link(s) -- a [id, slot] list, or a tuple of
them for multi-output loaders -- which you pass as inputs to downstream nodes,
wiring the graph like the GUI noodles:

    model, clip, vae = load_checkpoint(g, "model.safetensors")
    pos = encode_text(g, "a cat", clip)
    latent = empty_latent(g, 1024, 1024)
    image = vae_decode(g, ksampler(g, model, pos, neg, latent, ...), vae)

This is a starter library, not exhaustive: for any node class not here, call
g.node("ClassName", **inputs) directly (input/output names: probe.py --node).
"""


# -- loaders ------------------------------------------------------------------

def load_checkpoint(g, name):
    n = g.node("CheckpointLoaderSimple", ckpt_name=name)
    return n[0], n[1], n[2]  # (model, clip, vae)


def load_unet(g, name, dtype="default"):
    return g.node("UNETLoader", unet_name=name, weight_dtype=dtype)[0]


def load_clip(g, name, kind):
    return g.node("CLIPLoader", clip_name=name, type=kind)[0]


def load_vae(g, name):
    return g.node("VAELoader", vae_name=name)[0]


def load_lora(g, name, model, clip, strength=1.0):
    n = g.node("LoraLoader", lora_name=name, strength_model=strength,
               strength_clip=strength, model=model, clip=clip)
    return n[0], n[1]  # (model, clip)


# -- conditioning / model tweaks ---------------------------------------------

def clip_set_last_layer(g, clip, layer):
    return g.node("CLIPSetLastLayer", clip=clip, stop_at_clip_layer=layer)[0]


def aura_flow_shift(g, model, shift):
    return g.node("ModelSamplingAuraFlow", model=model, shift=shift)[0]


def encode_text(g, text, clip):
    return g.node("CLIPTextEncode", text=text, clip=clip)[0]


# -- latents ------------------------------------------------------------------

def empty_latent(g, width, height, batch=1):
    return g.node("EmptyLatentImage", width=width, height=height,
                  batch_size=batch)[0]


def load_image(g, server_name):
    return g.node("LoadImage", image=server_name)[0]  # slot 0 = IMAGE (1 = MASK)


def vae_encode(g, pixels, vae):
    return g.node("VAEEncode", pixels=pixels, vae=vae)[0]


def repeat_latent_batch(g, samples, amount):
    return g.node("RepeatLatentBatch", samples=samples, amount=amount)[0]


# -- sampling / decode --------------------------------------------------------

def ksampler(g, model, positive, negative, latent, seed, steps, cfg,
             sampler, scheduler, denoise):
    return g.node("KSampler", model=model, positive=positive, negative=negative,
                  latent_image=latent, seed=seed, steps=steps, cfg=cfg,
                  sampler_name=sampler, scheduler=scheduler, denoise=denoise)[0]


def vae_decode(g, samples, vae):
    return g.node("VAEDecode", samples=samples, vae=vae)[0]


# -- image post-processing ----------------------------------------------------

def image_scale_by(g, image, method, scale):
    return g.node("ImageScaleBy", image=image, upscale_method=method,
                  scale_by=scale)[0]


def image_quantize(g, image, colors, dither):
    return g.node("ImageQuantize", image=image, colors=colors, dither=dither)[0]


def load_bg_removal(g, name):
    return g.node("LoadBackgroundRemovalModel", bg_removal_name=name)[0]


def remove_background(g, bg_model, image):
    return g.node("RemoveBackground", bg_removal_model=bg_model, image=image)[0]


def invert_mask(g, mask):
    return g.node("InvertMask", mask=mask)[0]


def join_image_alpha(g, image, alpha):
    return g.node("JoinImageWithAlpha", image=image, alpha=alpha)[0]


# -- output -------------------------------------------------------------------

def save_image(g, images, prefix):
    g.node("SaveImage", images=images, filename_prefix=prefix)
