function State(_enter, _update, _draw, _finish, _opt = {}) constructor {
    self.enter = _enter ?? noop;
    self.update = _update ?? noop;
    self.draw = _draw ?? noop;
    self.finish = _finish ?? noop;
    self.state_spawn = _opt[$ "state_spawn"] ?? undefined;
    self.state_despawn = _opt[$ "state_despawn"] ?? undefined;
}
