/**
 * Companion follow behavior only, not membership.
 * @typedef {Object} Follower
 * @property {"follow"|"wait"} state
 * @property {number} speed          px/s
 * @property {number} range          px from the player
 * @property {number} bonusCapacity  Inventory slots granted to the player while following
 * @property {number} bonusWeight    Inventory maxWeight granted while following
 */
globalThis.Follower = "Follower";
