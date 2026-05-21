global.StateMachine = class StateMachine {
  constructor() {
    this.state = undefined;
    this.next_state = undefined;
    this.force_change = false;
    this.owner = undefined;
    this.states = {};
  }

  add_state(name, state) {
    this.states[name] = state;
    return state;
  }

  get_state(name) {
    return this.states[name];
  }

  remove_state(name) {
    delete this.states[name];
  }

  clear_states() {
    this.states = {};
  }

  change_state(name, force = false) {
    this.next_state = this.get_state(name);
    this.force_change = force;
  }

  spawn() {
    if (this.state === undefined) return false;
    const next = this.state.state_spawn;
    if (next === undefined) return false;
    this.change_state(next, true);
    return true;
  }

  despawn() {
    if (this.state === undefined) return false;
    const next = this.state.state_despawn;
    if (next === undefined) return false;
    this.change_state(next, true);
    return true;
  }

  update() {
    if (this.next_state) {
      if (this.state !== this.next_state || this.force_change) {
        if (this.state) this.state.finish(this.owner);
        this.state = this.next_state;
        if (this.state) this.state.enter(this.owner);
      }
      this.next_state = undefined;
    }

    if (this.state) this.state.update(this.owner);
  }

  draw() {
    if (this.state) this.state.draw(this.owner);
  }
};
