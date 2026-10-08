# TODO

## Issues

- [#15998] Foot rotation for Spine sprites is broken
- [#15999] Mix is ​​not applied to single-key Spine animations like down

## Planned

- Mine and Mine Detector
- Settlement
    - Fishing
- World map: a trip costs in-game hours but no survival needs; a site's extraction point is its arrival beacon (a separate extraction site is the extraction-shooter tension knob); site codenames from word pools instead of fixed i18n names
- Killfeed UI
- Blueprint UI — stamp a captured or registered plan (`Blueprint.stamp`) for its wood
- [C#] Separating Pathfinding into a different thread
- [Arch] Skeleton simplification
    - The scene lifecycle as an app singleton; map-local effects on the level; scene hooks released in one place; one scene shape
    - One colony map record, with what the biome implies read from the biome
- [Runtime] Runtime upgrade: re-audit every GMRT.md and SPINE.md entry, retiring a fixed one's workaround, and re-run the full test — a flipped `testGame` case or a moved `perf.*` ratio names what to retire
