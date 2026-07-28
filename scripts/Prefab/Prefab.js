// Reusable mini-layout a generator stamps into a world — Core/Level machinery, content-free (the
// RPG's defs live in RpgPrefabs). Def shape is the PrefabDef typedef; the API is on the class below.

/**
 * @typedef {Object} PrefabTiles
 * @property {string} layer      name resolved via apply()'s `opts.layers`
 * @property {*} type            the layer's cell value (e.g. a TileType)
 * @property {number[][]} rects  [[lx,ly,w,h]...]
 */
/**
 * @typedef {Object} PrefabZones
 * @property {string} channel    ZoneMap channel key on the level grid
 * @property {string} [name]
 * @property {string[]} [tags]
 * @property {Object} [data]     JSON payload (Zone.data; nested OK, no Set)
 * @property {number[][]} rects  [[lx,ly,w,h]...]
 */
/**
 * @typedef {Object} PrefabDef
 * @property {string} id
 * @property {string[]} [tags]   scope tags for generator filtering
 * @property {number} [weight]   weighted-pick weight (default 1)
 * @property {number} cols       footprint width in cells
 * @property {number} rows       footprint height in cells
 * @property {number[][]} [walls] [[lx,ly,w,h]...] local-coord collider rects
 * @property {PrefabTiles[]} [tiles]
 * @property {PrefabZones[]} [zones]
 * @property {Object<string, *>[]} [spawns] local-coord spawn descriptors ({ lx, ly, ... })
 */
/**
 * @typedef {Object} PrefabApplyOpts
 * @property {LevelGrid} grid    the level grid (tile layers / zones / cell dims)
 * @property {Entity} [entities]       the ECS entity store — required only when the def has walls
 * @property {number} ox         absolute cell offset of the prefab origin
 * @property {number} oy
 * @property {Object<string, TileLayer>} [layers] named TileLayer map the def's tiles refer to
 */
/**
 * A def (PrefabDef) is a cols×rows footprint + up to four LOCAL-coord channels, all optional: `walls`
 * bare collide-only rects (apply() makes kinematic colliders), `tiles` writes into a NAMED TileLayer,
 * `zones` regions painted into a named ZoneMap channel, and `spawns` entity descriptors whose shape is
 * consumer-defined (Core never reads them). register() fail-fast validates every channel against the
 * footprint (an out-of-footprint rect would silently break a generator's seam-margin guarantee).
 * stamp() translates local→absolute; apply() writes the Core-expressible channels into a level grid +
 * entity store. The def store is a `Registry` facade.
 */
globalThis.Prefab = class Prefab {
  /** @param {PrefabDef} def */
  constructor(def) {
    this.id = def.id;
    this.tags = def.tags ?? [];
    this.weight = def.weight ?? 1;
    this.cols = def.cols;
    this.rows = def.rows;
    this.walls = def.walls ?? [];
    this.tiles = def.tiles ?? [];
    this.zones = def.zones ?? [];
    this.spawns = def.spawns ?? [];
  }

  /** @param {string} t @returns {boolean} */
  hasTag(t) {
    return this.tags.indexOf(t) !== -1;
  }

  /**
   * Translate every channel to absolute grid coords at cell offset (ox, oy).
   * Spawns are shallow copies with lx/ly replaced by gx/gy — nested arrays are still SHARED with
   * the def, so a consumer deep-copies what it mutates (OverworldGen clones loot/items). Tiles/
   * zones entries share the def's type/data and carry fresh translated `rects`.
   * @param {number} ox @param {number} oy
   * @returns {{ walls: number[][], tiles: PrefabTiles[], zones: PrefabZones[], spawns: Object<string, *>[] }}
   */
  stamp(ox, oy) {
    const walls = Prefab._shiftRects(this.walls, ox, oy);
    const tiles = [];
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i];
      tiles.push({
        layer: t.layer,
        type: t.type,
        rects: Prefab._shiftRects(t.rects, ox, oy),
      });
    }
    const zones = [];
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      zones.push({
        channel: z.channel,
        name: z.name,
        tags: z.tags,
        data: z.data,
        rects: Prefab._shiftRects(z.rects, ox, oy),
      });
    }
    const spawns = [];
    for (let i = 0; i < this.spawns.length; i++) {
      const s = this.spawns[i];
      /** @type {Object<string, *>} */
      const out = {};
      const keys = Object.keys(s);
      for (let k = 0; k < keys.length; k++) {
        if (keys[k] === "lx" || keys[k] === "ly") continue;
        out[keys[k]] = s[keys[k]];
      }
      out.gx = ox + s.lx;
      out.gy = oy + s.ly;
      spawns.push(out);
    }
    return { walls: walls, tiles: tiles, zones: zones, spawns: spawns };
  }

  /**
   * Stamp + write the Core-expressible channels into a level:
   *   tiles → TileEdit.set into the named layer from `opts.layers` (nav synced per cell; the
   *           caller remeshes a SOLID layer's colliders ONCE after its stamps — TileEdit's contract)
   *   zones → one Zone defined + painted per entry, channel created on demand
   *   walls → bare collide-only kinematic colliders (ChunkManager's wall-rect convention — NOT
   *           rendered; author rendered walls as solid TILES on a wall layer instead)
   * Spawns are returned translated, NOT spawned — the descriptor shape is consumer-defined, so
   * the caller feeds them to its own adapter (e.g. RpgSpawn.spawnEntity).
   * @param {PrefabApplyOpts} opts
   * @returns {{ colliders: number[], zones: Zone[], spawns: Object<string, *>[] }}
   */
  apply(opts) {
    const st = this.stamp(opts.ox, opts.oy);
    const grid = opts.grid;
    const layers = opts.layers ?? {};

    for (let i = 0; i < st.tiles.length; i++) {
      const t = st.tiles[i];
      const layer = layers[t.layer];
      if (layer === undefined)
        throw new Error(
          `Prefab '${this.id}': no '${t.layer}' layer passed to apply()`,
        );
      for (let j = 0; j < t.rects.length; j++) {
        const r = t.rects[j];
        for (let y = r[1]; y < r[1] + r[3]; y++) {
          for (let x = r[0]; x < r[0] + r[2]; x++) {
            TileEdit.set(layer, x, y, t.type);
          }
        }
      }
    }

    /** @type {Zone[]} */
    const zones = [];
    for (let i = 0; i < st.zones.length; i++) {
      const z = st.zones[i];
      const map = grid.zoneMap(z.channel) ?? grid.addZoneMap(z.channel);
      const zone = map.define({ name: z.name, tags: z.tags, data: z.data });
      for (let j = 0; j < z.rects.length; j++) {
        const r = z.rects[j];
        // paintRect takes INCLUSIVE corner cells, rects carry w/h
        map.paintRect(zone.id, r[0], r[1], r[0] + r[2] - 1, r[1] + r[3] - 1);
      }
      zones.push(zone);
    }

    /** @type {number[]} */
    const colliders = [];
    if (st.walls.length > 0) {
      if (opts.entities === undefined)
        throw new Error(`Prefab '${this.id}': walls need opts.entities`);
      const entities = /** @type {Entity} */ (opts.entities);
      const cw = grid.cellWidth;
      const ch = grid.cellHeight;
      for (let i = 0; i < st.walls.length; i++) {
        const r = st.walls[i];
        const id = entities.create();
        entities.add(id, Position, { x: r[0] * cw, y: r[1] * ch, z: 0 });
        entities.add(id, BBox, {
          x: 0,
          y: 0,
          width: r[2] * cw,
          height: r[3] * ch,
        });
        entities.add(id, Collision, {
          solid: true,
          kinematic: true,
          mask: null,
          hits: [],
        });
        colliders.push(id);
      }
    }

    return { colliders: colliders, zones: zones, spawns: st.spawns };
  }

  // ── Registry facade (Registry owns the store's contract) ──
  static _defs = new Map();
  static _order = [];

  /**
   * register defs (validated — throws on out-of-footprint content)
   * @param {PrefabDef[]} defs @returns {typeof Prefab}
   */
  static register(defs) {
    Registry.register(Prefab, defs, (def) => {
      const p = new Prefab(def);
      Prefab._validate(p);
      return p;
    });
    return Prefab;
  }

  // fail fast at register time — an overflowing rect/spawn would silently break the seam
  // margin a generator's interior placement guarantees
  /** @param {Prefab} p */
  static _validate(p) {
    if (typeof p.id !== "string" || p.id === "")
      throw new Error(`Prefab def needs a string id`);
    if (!(p.cols >= 1) || !(p.rows >= 1))
      throw new Error(`Prefab '${p.id}': cols/rows footprint required`);
    for (let i = 0; i < p.walls.length; i++)
      Prefab._checkRect(p, "walls", p.walls[i]);
    for (let i = 0; i < p.tiles.length; i++) {
      const t = p.tiles[i];
      if (typeof t.layer !== "string")
        throw new Error(`Prefab '${p.id}': tiles[${i}] needs a layer name`);
      for (let j = 0; j < t.rects.length; j++)
        Prefab._checkRect(p, "tiles", t.rects[j]);
    }
    for (let i = 0; i < p.zones.length; i++) {
      const z = p.zones[i];
      if (typeof z.channel !== "string")
        throw new Error(`Prefab '${p.id}': zones[${i}] needs a channel name`);
      for (let j = 0; j < z.rects.length; j++)
        Prefab._checkRect(p, "zones", z.rects[j]);
    }
    for (let i = 0; i < p.spawns.length; i++) {
      const s = p.spawns[i];
      if (!(s.lx >= 0) || !(s.ly >= 0) || s.lx >= p.cols || s.ly >= p.rows)
        throw new Error(
          `Prefab '${p.id}': spawn ${i} (${s.lx},${s.ly}) outside ${p.cols}x${p.rows}`,
        );
    }
  }

  /** @param {Prefab} p @param {string} channel @param {number[]} r */
  static _checkRect(p, channel, r) {
    const ok =
      r[0] >= 0 &&
      r[1] >= 0 &&
      r[2] >= 1 &&
      r[3] >= 1 &&
      r[0] + r[2] <= p.cols &&
      r[1] + r[3] <= p.rows;
    if (!ok)
      throw new Error(
        `Prefab '${p.id}': ${channel} rect (${r[0]},${r[1]},${r[2]},${r[3]}) outside ${p.cols}x${p.rows}`,
      );
  }

  /** @param {number[][]} rects @param {number} ox @param {number} oy @returns {number[][]} */
  static _shiftRects(rects, ox, oy) {
    const out = [];
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      out.push([ox + r[0], oy + r[1], r[2], r[3]]);
    }
    return out;
  }

  /** @param {string} id @returns {Prefab | undefined} */
  static get(id) {
    return Registry.get(Prefab, id);
  }

  /** @param {string} id @returns {boolean} */
  static has(id) {
    return Registry.has(Prefab, id);
  }

  /** @returns {Prefab[]} all prefabs in registration order */
  static all() {
    return Registry.all(Prefab);
  }

  /** prefabs with this scope tag, in registration order @param {string} tag */
  static byTag(tag) {
    const all = Prefab.all();
    const out = [];
    for (let i = 0; i < all.length; i++) {
      if (all[i].hasTag(tag)) out.push(all[i]);
    }
    return out;
  }
};
