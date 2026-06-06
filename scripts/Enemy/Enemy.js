/**
 * Marks a patrolling enemy and holds its walk state. EnemySystem flips `dir`
 * when SolidSystem zeroes the body's horizontal velocity against a wall.
 * @typedef {Object} Enemy
 * @property {number} dir   walk direction, -1 (left) or 1 (right)
 * @property {number} speed horizontal walk speed in px/s
 */
globalThis.Enemy = "Enemy";
