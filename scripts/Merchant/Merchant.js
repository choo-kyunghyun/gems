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
 * @property {number}  restockHours  in-game hours between restocks (0 = never)
 * @property {number}  restockAt     the absolute in-game hour the next restock falls due
 * @property {{itemId:string,qty:number}[]} template  baseline stock a restock tops up to
 */
globalThis.Merchant = "Merchant";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[Merchant] = {
  currencyId: "coin",
  buyMargin: 1.25,
  sellMargin: 0.5,
  infinite: false,
  credits: 0,
  restockHours: 0,
  restockAt: 0,
};
