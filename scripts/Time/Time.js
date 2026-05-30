globalThis.Time = class Time {
  static raw = 0;
  static scale = 1;
  static delta = 0;

  static update() {
    Time.raw = delta_time / 1000000;
    Time.delta = Time.raw * Time.scale;
  }
};
