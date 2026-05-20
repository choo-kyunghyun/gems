global.I18n = class I18n {
  static text = {};
  static fonts = {};
  static images = {};
  static sounds = {};

  static destroy() {
    I18n.text = {};

    Object.entries(I18n.fonts).forEach(([_, value]) => {
      font_delete(value);
    });
    I18n.fonts = {};

    Object.entries(I18n.images).forEach(([_, value]) => {
      sprite_delete(value);
    });
    I18n.images = {};

    Object.entries(I18n.sounds).forEach(([_, value]) => {
      audio_destroy_stream(value);
    });
    I18n.sounds = {};
  }

  static load(fname) {
    I18n.destroy();

    const path = filename_path(fname);
    const manifest = struct_import(fname);

    if (Array.isArray(manifest.text)) {
      for (const mask of manifest.text) {
        const text_path = filename_path(path + mask);
        const files = file_find(path + mask);
        for (const text_fname of files) {
          const data = struct_import(text_path + text_fname);
          Object.entries(data).forEach(([key, value]) => {
            I18n.text[key] = value;
          });
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
        I18n.fonts[key] = font;

        if (typeof value.sdf === "boolean") {
          font_enable_sdf(font, value.sdf);
          font_sdf_spread(font, value.sdf_spread ?? 8);
          if (value.effects !== null) {
            font_enable_effects(font, true, value.effects);
          }
        }
      });
    }

    if (manifest.images !== null) {
      Object.entries(manifest.images).forEach(([key, value]) => {
        const i_fname = path + value.path;
        const imgnum = value.imgnum ?? 1;
        const xorig = value.xorig ?? 0;
        const yorig = value.yorig ?? 0;

        const sprite = sprite_add(i_fname, imgnum, false, false, xorig, yorig);
        I18n.images[key] = sprite;
      });
    }

    if (manifest.sounds !== null) {
      Object.entries(manifest.sounds).forEach(([key, value]) => {
        const stream = audio_create_stream(path + value.path);
        I18n.sounds[key] = stream;

        audio_sound_gain(stream, value.gain ?? 1, 0);
        audio_sound_pitch(stream, value.pitch ?? 1);
      });
    }
  }

  static get_text(key) {
    return I18n.text[key] ?? key;
  }

  static get_text_ext(key, params = []) {
    return string_ext(I18n.get_text(key), params);
  }

  static get_text_ref(key, params = []) {
    if (Array.isArray(params) && params.length == 0) {
      return () => {
        return I18n.get_text(key);
      };
    }

    const resolve =
      typeof params === "function"
        ? () => {
            return params();
          }
        : Array.isArray(params)
          ? () => {
              return params;
            }
          : () => {
              return [params];
            };

    return () => {
      return I18n.get_text_ext(key, resolve());
    };
  }

  static get_font(key) {
    return I18n.fonts[key] ?? draw_get_font();
  }

  static get_image(key) {
    return I18n.images[key] ?? -1;
  }

  static get_sound(key) {
    return I18n.sounds[key] ?? -1;
  }
};
