# TODO

## Issues

- [#15998] Foot rotation for Spine sprites is broken
- [#15999] Mix is ​​not applied to single-key Spine animations like down
- [UI] The master-detail list never clips, so a long recipe or weapon list overflows its card — scroll it now that a scissor flushes the batch
- [UI] `Display.clipW/clipH` age the render size a frame for a crash an oversized scissor no longer causes — clip to the live size and drop `advanceFrame`
- [UI] `UIInput` clips its text by whole characters — a scissor would clip it to the pixel
- [UI] `UI.draw`'s scissor re-anchor still explains itself by the oversized-rect crash; only the stale `gpu_get_scissor` rect keeps it

## Planned

- Mine and Mine Detector
- Settlement
    - Fishing
    - Raid event
- World map: a trip costs in-game hours but no survival needs; a site's extraction point is its arrival beacon (a separate extraction site is the extraction-shooter tension knob); site codenames from word pools (WORLD_KO) instead of fixed i18n names
- Killfeed UI
- Blueprint UI — stamp a captured or registered plan (`Blueprint.stamp`) for its wood
- [C#] Separating Pathfinding into a different thread
- [Runtime] Runtime upgrade: re-audit every GMRT.md and SPINE.md entry, retiring a fixed one's workaround, and re-run the full test — a flipped `testGame` case or a moved `perf.*` ratio names what to retire
