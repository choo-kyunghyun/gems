/**
 * The seams of death: the hooks a knock-out and a recovery report through, and the species a
 * kill is reported as. A species is a marker component, one row each, so a new one is a row.
 */
globalThis.Mortality = {
  // token and kill-report target per species; literal tokens, as top-level code runs in script
  // load order (docs/GMRT.md)
  SPECIES: [
    { token: "Raider", kill: "raider" },
    { token: "Rat", kill: "rat" },
  ],

  /** Hook: a "down" mortal was knocked out. */
  onDown(entities, id) {},
  /** Hook: a knocked-out mortal recovered. */
  onRecover(entities, id) {},

  /** Drop the hooks. */
  reset() {
    Mortality.onDown = function (entities, id) {};
    Mortality.onRecover = function (entities, id) {};
  },

  /** The body's species as its kill-report target; "" for none. */
  species(entities, id) {
    const rows = Mortality.SPECIES;
    for (let i = 0; i < rows.length; i++)
      if (entities.has(id, rows[i].token)) return rows[i].kill;
    return "";
  },
};
