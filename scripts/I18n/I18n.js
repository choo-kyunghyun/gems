globalThis.I18n = class I18n {
  static texts = new Map();
  static fonts = new Map();
  static images = new Map();
  static sounds = new Map();

  static destroy() {
    I18n.texts = new Map();

    I18n.fonts.forEach((font) => font_delete(font));
    I18n.fonts = new Map();

    I18n.images.forEach((sprite) => sprite_delete(sprite));
    I18n.images = new Map();

    I18n.sounds.forEach((stream) => audio_destroy_stream(stream));
    I18n.sounds = new Map();
  }

  static load(fname) {
    I18n.destroy();

    const path = filename_path(fname);
    const manifest = JSON.parse(File.read(fname));

    if (Array.isArray(manifest.texts)) {
      for (const mask of manifest.texts) {
        const text_path = filename_path(path + mask);
        const files = File.find(path + mask);
        for (const text_fname of files) {
          const data = JSON.parse(File.read(text_path + text_fname));
          const keys = Object.keys(data);
          for (let i = 0; i < keys.length; i++) {
            I18n.texts.set(keys[i], data[keys[i]]);
          }
        }
      }
    }

    if (
      typeof manifest.fonts === "object" &&
      manifest.fonts !== null &&
      !Array.isArray(manifest.fonts)
    ) {
      Object.entries(manifest.fonts).forEach(([key, value]) => {
        const f_fname = path + value.path;
        const size = value.size ?? 16;
        const bold = value.bold ?? false;
        const italic = value.italic ?? false;
        const first = value.first ?? 32;
        const last = value.last ?? 128;

        const font = font_add(f_fname, size, bold, italic, first, last);
        I18n.fonts.set(key, font);

        if (value.sdf) {
          font_enable_sdf(font, value.sdf);
          font_sdf_spread(font, value.sdf_spread ?? 8);
          if (value.effects) {
            font_enable_effects(font, true, value.effects);
          }
        }
      });
    }

    if (
      typeof manifest.images === "object" &&
      manifest.images !== null &&
      !Array.isArray(manifest.images)
    ) {
      Object.entries(manifest.images).forEach(([key, value]) => {
        const i_fname = path + value.path;
        const imgnum = value.imgnum ?? 1;
        const xorig = value.xorig ?? 0;
        const yorig = value.yorig ?? 0;

        const sprite = sprite_add(i_fname, imgnum, false, false, xorig, yorig);
        I18n.images.set(key, sprite);
      });
    }

    if (
      typeof manifest.sounds === "object" &&
      manifest.sounds !== null &&
      !Array.isArray(manifest.sounds)
    ) {
      Object.entries(manifest.sounds).forEach(([key, value]) => {
        const stream = audio_create_stream(path + value.path);
        I18n.sounds.set(key, stream);

        audio_sound_gain(stream, value.gain ?? 1, 0);
        audio_sound_pitch(stream, value.pitch ?? 1);
      });
    }
  }

  static text(key, ...params) {
    if (params.length === 0) {
      return I18n.texts.get(key) ?? key;
    } else {
      return string_ext(I18n.texts.get(key) ?? key, params);
    }
  }

  static textRef(key, ...params) {
    if (params.length === 0) {
      return () => {
        return I18n.texts.get(key) ?? key;
      };
    } else {
      const resolve =
        typeof params[0] === "function"
          ? () => {
              return params.map((p) => p());
            }
          : () => {
              return params;
            };

      return () => {
        return string_ext(I18n.texts.get(key) ?? key, resolve());
      };
    }
  }

  static font(key) {
    return I18n.fonts.get(key) ?? draw_get_font();
  }

  static image(key) {
    return I18n.images.get(key) ?? -1;
  }

  static sound(key) {
    return I18n.sounds.get(key) ?? -1;
  }
};
