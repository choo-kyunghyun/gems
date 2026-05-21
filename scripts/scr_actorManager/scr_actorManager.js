// TODO: Actor -> Entity && ActorManager -> Actor
global.ActorManager = class Actor {
  constructor(world) {
    this.world = world;
    this.actors = [];
    this.pending_removals = [];
  }

  destroy() {
    // TODO: Yes
    this.clear();
  }

  static import(actors_state) {
    this.clear();

    for (const actor_data of actors_state) {
      const actor = new Actor(actor_data);
      actor.world = this.world;
      this.actors.push(actor);
    }
  }

  export() {
    const actors_state = [];
    for (const actor of this.actors) {
      actors_state.push(actor.export());
    }
    return actors_state;
  }

  count() {
    return this.actors.length;
  }

  items() {
    return this.actors;
  }

  at(index) {
    if (index < 0 || index >= this.actors.length) return undefined;
    return this.actors[index];
  }

  clear() {
    [...this.actors].reverse().forEach((actor) => {
      actor.despawn();
      actor.world = undefined;
    });
    this.actors = [];
    this.pending_removals = [];
  }

  add(actor) {
    actor.world = this.world;
    this.actors.push(actor);
    return this;
  }

  remove(actor_or_id) {
    let actor = undefined;
    if (typeof actor_or_id === "object" && actor_or_id !== undefined) {
      actor = actor_or_id;
    } else {
      const index = this.actors.indexOf(actor_or_id);
      if (index > -1) actor = this.actors[index];
    }

    if (actor === undefined) return false;
    this.pending_removals.push(actor);
    return true;
  }

  flush() {
    for (const actor of this.pending_removals) {
      const id = actor.id;
      const index = this.actors.indexOf(actor);

      actor.despawn();
      actor.world = undefined;
      this.actors.splice(index, 1);
      this.world.mp.remove_request(id);
    }
    this.pending_removals = [];
  }

  update() {
    for (const actor of this.actors) {
      actor.update();
    }
  }

  draw() {
    for (const actor of this.actors) {
      actor.draw();
    }
  }
};
