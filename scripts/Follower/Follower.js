/**
 * Companion follow behavior; membership is Squad's.
 * @typedef {Object} Follower
 * @property {"follow"|"wait"} state
 * @property {number} speed          move speed (px/s) while following
 * @property {number} range          stop distance (px) from the player
 * @property {number} bonusCapacity  extra Inventory slots granted to the player while following
 * @property {number} bonusWeight    extra Inventory maxWeight granted while following
 */
globalThis.Follower = "Follower";
