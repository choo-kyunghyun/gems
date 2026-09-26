/**
 * A row handle — generation × SLOTS + index, float math past a bitwise op's reach (docs/GMRT.md)
 * — and the allocator that hands them out: a freed index comes back at the next generation, so a
 * stale handle fails `isValid` instead of naming the slot's new owner. A generation wraps to 0
 * after GENERATIONS reuses of one index, which keeps every id within 2^52 (docs/GMRT.md →
 * `json_parse`). The static half packs and unpacks; the instance half is an allocation table.
 */
globalThis.Handle = class Handle {
  static SLOTS = 1048576; // 2^20
  static GENERATIONS = 4294967296; // 2^32

  static make(index, generation) {
    return generation * Handle.SLOTS + index;
  }

  static index(id) {
    return id % Handle.SLOTS;
  }

  static generation(id) {
    return (id - (id % Handle.SLOTS)) / Handle.SLOTS;
  }

  constructor(maxEntities) {
    /**
     * The id each index hands out at its current generation. A freed index holds its next
     * owner's id, which no query can reach, since component slots are cleared before the id is
     * freed.
     */
    this.packed = new Array(maxEntities).fill(undefined);
    this.freeIndices = [];
    this.next = 0;
  }

  alloc() {
    if (this.freeIndices.length > 0) return this.packed[this.freeIndices.pop()];
    if (this.next === this.packed.length)
      throw new Error(`Handle.alloc: all ${this.next} slots in use`);
    const index = this.next++;
    this.packed[index] = index; // generation 0
    return index;
  }

  free(id) {
    const index = id % Handle.SLOTS;
    if (this.packed[index] !== id) return false;
    const bumped = id + Handle.SLOTS;
    this.packed[index] = bumped < Handle.SLOTS * Handle.GENERATIONS ? bumped : index;
    this.freeIndices.push(index);
    return true;
  }

  count() {
    return this.next - this.freeIndices.length;
  }

  isValid(id) {
    return this.packed[id % Handle.SLOTS] === id;
  }

  /**
   * Every live id, ascending by index — the token-less whole-store query. Liveness is the free
   * list, not `isValid`: a freed index's `packed` entry is its NEXT owner's id, which passes it.
   */
  live() {
    const hi = this.next;
    const free = new Array(hi).fill(false);
    const fi = this.freeIndices;
    for (let k = 0; k < fi.length; k++) free[fi[k]] = true;
    const out = [];
    for (let i = 0; i < hi; i++) if (!free[i]) out.push(this.packed[i]);
    return out;
  }

  reset() {
    this.packed.fill(undefined);
    this.freeIndices = [];
    this.next = 0;
  }

  export() {
    return {
      packed: this.packed.slice(0, this.next),
      freeIndices: [...this.freeIndices],
    };
  }

  import(data) {
    const p = data.packed;
    this.packed.fill(undefined);
    for (let i = 0; i < p.length; i++) this.packed[i] = p[i];
    this.freeIndices = data.freeIndices;
    this.next = p.length;
  }
};
