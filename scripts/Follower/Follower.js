// Companion marker + follow behavior. MEMBERSHIP is the separate Squad component (see Squad):
// a companion WITH Squad travels through portals with the player (a portal forces "wait" back to
// "follow" — waiting is map-local, never a way to stay behind); one WITHOUT Squad is a map
// resident (unhired/kicked — re-hired by talking). "wait" holds still in place; player id is
// passed to the system per tick, never stored here — a transferred follower needs no re-link.
// Carry bonus: while a member is following, FollowerSystem grants bonusCapacity/bonusWeight to
// the player's Inventory (balanced +/- delta at each state transition via setState/hire/kick).
/**
 * @typedef {Object} Follower
 * @property {"follow"|"wait"} state
 * @property {number} speed          move speed (px/s) while following
 * @property {number} range          stop distance (px) from the player
 * @property {number} bonusCapacity  extra Inventory slots granted to the player while following
 * @property {number} bonusWeight    extra Inventory maxWeight granted while following
 */
globalThis.Follower = "Follower";
