/**
 * What the colony's HUD offers: the key hints, each shown in the input contexts it lists, and the
 * radar's blip colours, first match wins — an entity matching none gets no arrow.
 */
globalThis.contentHud = {
  HINTS: [
    {
      actions: ["moveUp", "moveLeft", "moveDown", "moveRight"],
      label: "HINT_MOVE",
      contexts: ["play", "build", "window"],
    },
    { actions: ["sprint"], label: "HINT_SPRINT", contexts: ["play", "build"] },
    { actions: ["fire"], label: "HINT_ATTACK", contexts: ["play"] },
    { actions: ["grenade"], label: "HINT_GRENADE", contexts: ["play"] },
    { actions: ["buildPlace"], label: "HINT_PLACE", contexts: ["build"] },
    { actions: ["buildRemove"], label: "HINT_REMOVE", contexts: ["build"] },
    { actions: ["inventory"], label: "HINT_BAG", contexts: ["play", "build"] },
    { text: "1-5", label: "HINT_HOTBAR", contexts: ["play"] },
    { actions: ["interact"], label: "HINT_TALK", contexts: ["play"] },
    { actions: ["build"], label: "HINT_BUILD", contexts: ["play"] },
    { actions: ["build"], label: "HINT_EXIT_BUILD", contexts: ["build"] },
    { actions: ["follow"], label: "HINT_COMPANION", contexts: ["play", "build"] },
    { text: "Esc", label: "COMMON_CLOSE", contexts: ["window"] },
  ],

  /** Built on call, as the tokens and colours it names load after this script (docs/GMRT.md). */
  radar() {
    return [
      { has: Raider, color: Color.parse("#e0584f") },
      { has: Rat, color: Color.parse("#e0584f") },
      { has: NPC, color: facetColor("warn") },
      // the travel beacon
      {
        has: Interaction,
        where: (c) => c.kind === "travel",
        color: Color.parse("#9b8cff"),
      },
      { has: Follower, color: Color.parse("#6fd0a0") },
    ];
  },
};
