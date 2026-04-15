self.fps_avg = lerp(self.fps_avg, fps_real, 0.1);

self.elapsed += Time.raw;
self.frames++;

self.ui.update();
