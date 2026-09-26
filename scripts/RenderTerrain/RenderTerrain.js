/**
 * @typedef {Object} RenderTerrainMaterial
 * @property {TileType} type - a cell fills this material iff its TileType id is at least this one's
 * @property {*} tileset - a 16-tile dual-grid tile set whose tile is the grid's cell
 * @property {{r: number, g: number, b: number, time: function(): number}} [wave] - a flowing
 *   material's crest tone (0..1 floats), drifting on a sim clock so it freezes on pause. Lit only.
 */

/**
 * A layer drawn as a cumulative material stack through runtime tile maps, one per material, lowest
 * first, each on a hidden layer of its own so it draws only from this pass. A display tile sits on
 * each data-grid corner, its tile the corner mask of the four cells around it in the tile set's
 * order (TL=1 TR=2 BL=4 BR=8), so a material's transparent corners reveal the one below; off-grid
 * reads empty, so a level edge fades out. A corner the next material covers whole takes no tile,
 * so a stack costs about one grid's tiles. A write rewrites only the corners it reaches, on the
 * next draw.
 *
 * A tile map culls against a rect that ignores the world matrix and follows the camera's eye
 * (docs/GMRT.md): a tile set's tile must be the grid's cell, and a tilted camera keeps its eye at
 * the look-at.
 * @implements {RenderPass}
 */
globalThis.RenderTerrain = class RenderTerrain {
  /** @param {RenderTerrainMaterial[]} mats lowest first */
  constructor(layer, grid, mats) {
    this.enabled = true;
    this.layer = layer;
    this.grid = grid;
    this.lights = undefined; // unset = unlit
    this.mats = mats;
    this.x = -grid.cellWidth * 0.5;
    this.y = -grid.cellHeight * 0.5;
    this._layers = [];
    this._maps = [];
    for (let k = 0; k < mats.length; k++) {
      const info = tileset_get_info(mats[k].tileset);
      if (info.tile_width !== grid.cellWidth || info.tile_height !== grid.cellHeight)
        throw new Error(
          `RenderTerrain: ${tileset_get_name(mats[k].tileset)}'s ${info.tile_width}x` +
            `${info.tile_height} tile is not the ${grid.cellWidth}x${grid.cellHeight} cell`,
        );
      const lay = layer_create(0);
      layer_set_visible(lay, false);
      this._layers.push(lay);
      this._maps.push(layer_tilemap_create(lay, this.x, this.y, mats[k].tileset, grid.cols + 1, grid.rows + 1));
    }
    this._stack = [layer]; // the cursor polls a stack
    this._cursor = new EditCursor();
  }

  /** Rewrites the corners the writes since the last sync reach; every corner on a resample. */
  sync() {
    const cursor = this._cursor;
    const state = cursor.poll(this._stack);
    if (state === 0) return;
    const { cols, rows } = this.grid;
    if (state < 0) {
      for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) this._corner(i, j);
      return;
    }
    const log = this.layer.log;
    for (let k = cursor.from[0]; k < log.length; k++) {
      const c = log[k];
      const x = c % cols;
      const y = (c - x) / cols;
      this._corner(x, y);
      this._corner(x + 1, y);
      this._corner(x, y + 1);
      this._corner(x + 1, y + 1);
    }
  }

  /** Corner (i, j)'s tile in every material's map, read off the layer's ids. */
  _corner(i, j) {
    const { cols, rows } = this.grid;
    const d = this.layer.ids.data;
    const up = (j - 1) * cols;
    const dn = j * cols;
    const tl = i > 0 ? (j > 0 ? d[up + i - 1] : 0) : 0;
    const tr = i < cols ? (j > 0 ? d[up + i] : 0) : 0;
    const bl = i > 0 ? (j < rows ? d[dn + i - 1] : 0) : 0;
    const br = i < cols ? (j < rows ? d[dn + i] : 0) : 0;
    const mats = this.mats;
    for (let k = 0; k < mats.length; k++) {
      const hi = k + 1 < mats.length ? mats[k + 1].type.id : Infinity;
      tilemap_set(this._maps[k], RenderTerrain.tile(tl, tr, bl, br, mats[k].type.id, hi), i, j);
    }
  }

  /**
   * A corner's tile from the ids of the four cells around it: a bit per cell at least `lo`, and
   * none when every cell is at least `hi`, the next material's id.
   */
  static tile(tl, tr, bl, br, lo, hi) {
    if (tl >= hi) if (tr >= hi) if (bl >= hi) if (br >= hi) return 0;
    let tile = 0;
    if (tl >= lo) tile |= 1;
    if (tr >= lo) tile |= 2;
    if (bl >= lo) tile |= 4;
    if (br >= lo) tile |= 8;
    return tile;
  }

  draw(entities) {
    this.sync();
    // lit as flat ground (normal straight up); z-write stays off, so only the shading changes
    const lights = this.lights;
    const lit = lights !== undefined ? lights.litOk : false;
    if (lit) {
      lights.setupLights(entities);
      shader_set_uniform_f(lights.uUseTex, 1);
      shader_set_uniform_f(lights.uNormal, 0, 0, -1);
    }
    const mats = this.mats;
    for (let k = 0; k < mats.length; k++) {
      const wave = mats[k].wave;
      if (lit) {
        shader_set_uniform_f(lights.uWave, wave !== undefined ? 1 : 0);
        if (wave !== undefined) {
          shader_set_uniform_f(lights.uWaveColor, wave.r, wave.g, wave.b);
          shader_set_uniform_f(lights.uTime, wave.time());
        }
      }
      draw_tilemap(this._maps[k], this.x, this.y);
    }
    if (lit) shader_reset();
  }

  destroy() {
    for (let k = 0; k < this._layers.length; k++) layer_destroy(this._layers[k]);
    this._layers = [];
    this._maps = [];
  }
};
