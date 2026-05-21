global.Actor = class Actor extends Entity {
  constructor(data) {
    super(data);
    this.name = data.name ?? "";
    this.hit = data.hit ?? 0;
    this.dirty = data.dirty ?? true;
    this.state_machine = new StateMachine();
    this.state_machine.owner = this;
    this.type = ENTITY_TYPE.ACTOR;
    this.world = undefined;
  }

  static import(data) {
    return new Actor(data);
  }

  on_export(out) {
    out.name = this.name;
    out.hit = this.hit;
    out.dirty = this.dirty;
  }

  on_spawn() {
    if (this.instance !== noone) {
      variable_instance_set(this.instance, "actor_ref", this);
    }
    this.state_machine.spawn();
  }

  on_despawn() {
    this.state_machine.despawn();
  }

  update() {
    this.state_machine.update();
  }

  draw() {
    this.state_machine.draw();
  }
};
