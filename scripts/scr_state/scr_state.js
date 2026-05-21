global.State = class State {
  constructor(enter, update, draw, finish, opt = {}) {
    this.enter = enter ?? noop;
    this.update = update ?? noop;
    this.draw = draw ?? noop;
    this.finish = finish ?? noop;
    this.state_spawn = opt.state_spawn ?? undefined;
    this.state_despawn = opt.state_despawn ?? undefined;
  }
};
