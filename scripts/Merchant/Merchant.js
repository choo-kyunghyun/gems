// Marks an entity (an NPC, in the demo) as a TRADER. Pairs with the entity's own Inventory
// component, which IS the merchant's stock — so a merchant "uses its own inventory" for trade.
// The buy/sell/price/restock logic is TradeSystem; the demo opens TradeUI on a merchant NPC.
//
// Two economy modes, switched by `infinite`:
//   • infinite:true  → bottomless stock + wallet: buying never depletes the Inventory and the
//                      merchant always affords your goods. `credits`/`restock*` are ignored.
//                      The displayed stock is just the catalog; selling to it discards the item.
//   • infinite:false → a real economy: buying removes from the stock Inventory and credits the
//                      merchant; selling needs the merchant to afford it (gated by `credits`) and
//                      adds the item to its stock (buyback). TradeSystem.update tops the stock back
//                      up toward `template` every `restockSecs` (0 = no restock).
//
// Prices: marketValue = round(Rarity.modify(rarity, item.value)); buy = ceil(market·buyMargin),
// sell = floor(market·sellMargin). `currencyId` is the item the prices are paid in (the demo: "coin")
// — kept on the component so the kit names no specific currency (the demo authors it on the spawn).
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
