// Item component: a bag item set down in the world as a build catalog entry, one unit per placement.
globalThis.Placeable = class Placeable {
  /** d: build, the id of the catalog entry it sets down. */
  constructor(d) {
    this.build = d.build;
  }
};
