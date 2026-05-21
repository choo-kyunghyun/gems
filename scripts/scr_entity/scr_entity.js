// TODO: Use ECS instead of inheritance

// TODO: Remove ENTITY_TYPE
global.ENTITY_TYPE = Object.freeze({
  ENTITY: 0,
  ACTOR: 1,
});

global.Entity = class Entity {
  constructor(data = {}) {
    this.id = data.id ?? uuid();
    this.type = data.type ?? global.ENTITY_TYPE.ENTITY;
    this.instance = noone;
    this.x = data.x ?? 0;
    this.y = data.y ?? 0;
    this.z = data.z ?? 0;
    this.object = data.object ?? obj_entity; // TODO: static object = obj_entity;
    this.properties =
      data.properties === undefined ? {} : variable_clone(data.properties);
  }

  update() {}
  draw() {}
  on_export(out) {}
  on_spawn() {}
  on_despawn() {}

  static import(data) {
    return new Entity(data);
  }

  export() {
    const out = {
      id: this.id,
      // type: this.type,
      x: this.x,
      y: this.y,
      z: this.z,
      // object: this.object,
      properties: this.properties,
    };
    this.on_export(out);
    return out;
  }

  is_instantiated() {
    return this.instance !== noone;
  }

  set_position(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z ?? this.z;

    if (this.instance !== noone) {
      this.instance.x = x;
      this.instance.y = y;
      this.instance.depth = z;
    }
  }

  spawn() {
    // if (this.object === -1) return noone;
    if (this.instance !== noone) return this.instance;

    this.instance = instance_create_depth(
      this.x,
      this.y,
      this.z,
      this.object,
      this.properties,
    );
    variable_instance_set(this.instance, "entity_id", this.id);
    variable_instance_set(this.instance, "entity_ref", this);
    this.on_spawn();
    return this.instance;
  }

  despawn() {
    if (this.instance !== noone) {
      this.on_despawn();
      instance_destroy(this.instance);
      this.instance = noone;
    }
  }
};
