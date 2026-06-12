# Flexpanel (Yoga) Reference

A local, paraphrased cheat-sheet for the GameMaker **flexpanel** node properties that
`UIElement` is built on (it wraps `flexpanel_create_node`). Only the factual property
names + accepted values are reproduced here; see the GameMaker manual ("Flex Panel
Struct Members") and [Yoga's docs](https://www.yogalayout.dev/docs/styling/) for prose.

A node is created from a struct (or JSON string) and may nest children via `nodes: [...]`:

```js
flexpanel_create_node({
  width: "80%", height: 200, padding: 20,
  nodes: [
    { height: 20 },
    { flex: 1, flexDirection: "row", nodes: [ { aspectRatio: 1 }, { aspectRatio: 1 } ] },
    { height: 20 },
  ],
});
```

In this project we pass the struct at **construction** (`new UIElement({...})`) and let
the children list be built with `insertChild`. Every property also has
`flexpanel_node_style_set_*` / `get_*` functions, but see the **runtime mutation**
warning at the bottom.

---

## Basic

| Property | Accepted values | Notes |
|---|---|---|
| `name` | string | Optional, non-unique label for the node. |
| `data` | struct | Free user data; never affects layout. Always present (empty by default). |
| `nodes` | array of node structs | Child nodes, each the same shape as this table. |

## Size

| Property | Accepted values | Notes |
|---|---|---|
| `width`, `height` | `"auto"` (default) · real px · `"50%"` | "auto" sizes to content. % is of the containing block. Defines the **border box** (content + padding + border). |
| `minWidth`, `maxWidth`, `minHeight`, `maxHeight` | px · `"%"` | Clamp the node's size per dimension. |
| `aspectRatio` | real | `1` = square, `2` = 2:1 (w = 2×h), `0.5` = w is half of h. Corresponds to the horizontal axis. |

## Position

| Property | Accepted values | Notes |
|---|---|---|
| `left`, `right`, `top`, `bottom`, `start`, `end` | px · `"%"` | Insets: distance from the parent's same edge; positive moves toward centre. `left`/`top` win over `right`/`bottom`. `start`/`end` follow layout `direction`. |
| `positionType` (`position`) | `"relative"` (default) · `"absolute"` · `"static"` | `relative`: participates in flow, insets relative to flow slot. `absolute`: removed from flow, insets relative to containing block. `static`: like relative but ignores insets and forms no containing block. |

## Box spacing

| Property | Accepted values | Notes |
|---|---|---|
| `margin` (+ `marginLeft/Right/Top/Bottom/Start/End/Horizontal/Vertical/Inline`) | px · `"%"` | Space **outside** the node. |
| `padding` (+ per-edge `paddingLeft/...`) | px · `"%"` | Space between the node's inner edge and its children; grows auto-sized nodes. |
| `border` (+ per-edge `borderLeft/...`) | px | Behaves like padding (reserves space). This is layout border, not a drawn stroke. |
| `gap`, `gapRow`, `gapColumn` | px | Extra distance between child rows/columns. |

## Flex flow

| Property | Accepted values | Notes |
|---|---|---|
| `direction` | `"ltr"` (default) · `"rtl"` | Whole-tree reading direction; remaps `start`/`end`. |
| `flexDirection` | `"column"` (default) · `"row"` · `"column-reverse"` · `"row-reverse"` | The **main axis**. Cross axis is perpendicular. |
| `flexWrap` | `"no-wrap"` (default) · `"wrap"` · `"wrap-reverse"` | Wrap overflowing children onto new cross-axis lines. |
| `flexBasis` | px · `"%"` · `"auto"` | Default main-axis size before grow/shrink (width in a row, height in a column). |
| `flexGrow` | real (weight, default 1) | How the node soaks up leftover main-axis space vs. siblings. |
| `flexShrink` | real (weight, default 1) | How the node gives up space on overflow vs. siblings. |
| `flex` | real | Shorthand: positive acts as `flexGrow`, negative as `flexShrink`. |

## Alignment

| Property | Accepted values | Notes |
|---|---|---|
| `justifyContent` | `"flex-start"` (default) · `"flex-end"` · `"center"` · `"space-between"` · `"space-around"` · `"space-evenly"` | Children along the **main** axis. |
| `alignItems` | `"stretch"` (default) · `"flex-start"` · `"flex-end"` · `"center"` · `"baseline"` | Children along the **cross** axis. |
| `alignSelf` | same set as `alignItems` | Per-child override of the parent's `alignItems`. |
| `alignContent` | `"flex-start"` (default) · `"flex-end"` · `"stretch"` · `"center"` · `"space-between"` · `"space-around"` · `"space-evenly"` | Distribution of **wrapped lines** on the cross axis (only with `flexWrap`). |

## Misc

| Property | Accepted values | Notes |
|---|---|---|
| `display` | `"flex"` (default) · `"none"` | `"none"` disables the node entirely (excluded from layout, as if removed). |
| `clipContent` | boolean | Whether the node clips its children's rendering to its own area. |
| `layerElements` | array (read-only) | Only present for Room-Editor UI-layer nodes; not used by this project's runtime UI. |

---

## ⚠ Runtime mutation is unreliable on GMRT 0.19 (bug #15065)

The `flexpanel_node_style_set_*` setters **do not reliably apply per-frame** on the
GMRT runtime — see [GameMaker bug #15065](https://github.com/YoYoGames/GameMaker-Bugs/issues/15065).
Most of these are commented out in `UIElement` for that reason.

**Practical rule for this project:** set layout properties **once, at construction**
(pass them in the `new UIElement({...})` struct). For anything that must change at
runtime — scrolling, expand/collapse, modals, tab switching, drag — drive it with
**draw-time offset / clip math** (the approach `UIInput` and `UISlider` use), not by
mutating the flex node. The few setters that are proven safe and kept live in
`UIElement` are `setWidth` / `setHeight` / `setPosition`; `display: "none"` toggling
via `child.enabled` (our own flag, checked in `update`/`draw`) is the reliable way to
show/hide a subtree without touching flex styles.

**Structural mutation IS reliable** (probe-verified 2026-06-12): adding/removing a
child at runtime — `insertChild` / `removeChild` → `markDirty` → `flexpanel_calculate_layout`
— reflows the tree correctly, even after the first layout pass. The #15065 bug is
specifically the per-frame **style setters**, not the node graph. So when a layout
genuinely must change height (e.g. an accordion section opening), insert/remove the
subtree rather than animating a flex dimension. `UIAccordion` relies on this; pages
that only show/hide at the **same** size should still prefer `enabled` (no reflow).
