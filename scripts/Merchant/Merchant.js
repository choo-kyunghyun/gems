// Marks an entity as a TRADER — its own Inventory IS the stock (logic in TradeSystem; demo opens
// TradeUI). Two economy modes via `infinite`: bottomless stock+wallet, or a real depleting economy.
//
// @typedef {Object} Merchant
// @property {string}  currencyId    item id used as money (demo: "coin")
// @property {number}  buyMargin     price multiplier when the player BUYS (markup, e.g. 1.25)
// @property {number}  sellMargin    price multiplier when the player SELLS (markdown, e.g. 0.5)
// @property {boolean} infinite      true = bottomless stock + wallet (credits/restock ignored)
// @property {number}  credits       finite wallet — how much the merchant can pay for your goods
// @property {number}  restockSecs   seconds between restocks (0 = never; ignored when infinite)
// @property {number}  restockTimer  countdown to the next restock (TradeSystem.update)
// @property {{itemId:string,qty:number}[]} template  baseline stock TradeSystem.update tops up to
globalThis.Merchant = "Merchant";
