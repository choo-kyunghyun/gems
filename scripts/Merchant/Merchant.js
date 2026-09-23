/**
 * Marks an entity as a trader whose own inventory is the stock: either bottomless stock and
 * wallet (`infinite`), or a real depleting economy.
 *
 * @typedef {Object} Merchant
 * @property {string}  currencyId    item id used as money
 * @property {number}  buyMargin     price multiplier when the player buys (a markup)
 * @property {number}  sellMargin    price multiplier when the player sells (a markdown)
 * @property {boolean} infinite      bottomless stock and wallet; credits and restock ignored
 * @property {number}  credits       finite wallet — how much the merchant can pay for goods
 * @property {number}  restockSecs   seconds between restocks (0 = never)
 * @property {number}  restockTimer  countdown to the next restock
 * @property {{itemId:string,qty:number}[]} template  baseline stock a restock tops up to
 */
globalThis.Merchant = "Merchant";
