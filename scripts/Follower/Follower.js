// Companion marker + follow behavior. MEMBERSHIP is the separate Squad component (see Squad): WITH
// Squad it portals with the player, WITHOUT it is a map resident. Follow/carry-bonus rules: FollowerSystem.
/**
 * @typedef {Object} Follower
 * @property {"follow"|"wait"} state
 * @property {number} speed          move speed (px/s) while following
 * @property {number} range          stop distance (px) from the player
 * @property {number} bonusCapacity  extra Inventory slots granted to the player while following
 * @property {number} bonusWeight    extra Inventory maxWeight granted while following
 */
globalThis.Follower = "Follower";
