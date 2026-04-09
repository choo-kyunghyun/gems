function noop() {}

function State(_enter, _update, _draw, _finish) constructor {
    self.enter = _enter ?? noop;
    self.update = _update ?? noop;
    self.draw = _draw ?? noop;
    self.finish = _finish ?? noop;
}
