-- Aseprite headless drawer for the method comparison.
-- Run: Aseprite.exe -b -script-param out=<dir> -script aseprite_draw.lua
-- Potion/sword/bed: stamped from the SAME char-grids as the agent (scripted pixels
-- either way). Coin: drawn with Aseprite's ellipse + paint_bucket tools to show the
-- clean-circle advantage over hand-placed coordinates.

local DIR = assert(app.params["out"], "pass --script-param out=<dir>")
app.fs.makeDirectory(DIR)

-- palette: same hex values as draw.py's PALETTE
local PAL = {
  X = { 26, 28, 44 }, W = { 244, 244, 244 }, L = { 192, 203, 220 },
  N = { 139, 155, 180 }, S = { 58, 68, 102 }, R = { 177, 62, 83 },
  o = { 239, 125, 87 }, y = { 255, 205, 117 }, G = { 56, 183, 100 },
  g = { 167, 240, 112 }, B = { 59, 93, 201 }, b = { 65, 166, 246 },
  c = { 115, 239, 247 }, p = { 93, 39, 93 }, k = { 122, 74, 49 },
  K = { 168, 107, 70 }, m = { 90, 56, 38 },
}

local function col(ch)
  local c = PAL[ch]
  return Color{ r = c[1], g = c[2], b = c[3], a = 255 }
end

local function stamp(img, lines)
  for y = 0, #lines - 1 do
    local row = lines[y + 1]
    for x = 0, #row - 1 do
      local ch = row:sub(x + 1, x + 1)
      if PAL[ch] then
        local c = PAL[ch]
        img:drawPixel(x, y, app.pixelColor.rgba(c[1], c[2], c[3], 255))
      end
    end
  end
end

local function from_grid(name, lines)
  local spr = Sprite(16, 16, ColorMode.RGB)
  stamp(spr.cels[1].image, lines)
  spr:saveAs(DIR .. "/" .. name .. ".png")
  spr:close()
end

-- ---- grids (identical to agent) -------------------------------------------

from_grid("potion", {
  "................",
  "......yyyy......",
  "......yWWy......",
  "......XWWX......",
  "......XWWX......",
  ".....XWWWWX.....",
  "....XWWooWWX....",
  "...XWoRRRRoWX...",
  "..XWoRRRRRRoWX..",
  "..XWRRcRRRRRWX..",
  "..XWRRRRRRRRWX..",
  "..XWRRRRRRRRWX..",
  "..XWRRRRRRRRWX..",
  "...XWRRRRRRWX...",
  "....XWWWWWWX....",
  ".....XXXXXX.....",
})

from_grid("sword", {
  "................",
  ".......WX.......",
  "......XWLX......",
  "......XWLX......",
  "......XWLX......",
  "......XWLX......",
  "......XWLX......",
  "......XWLX......",
  "......XWLX......",
  "....yyyyyyyy....",
  "....yXyyyyXy....",
  ".......kk.......",
  ".......kk.......",
  ".......kk.......",
  "......XyyX......",
  "................",
})

from_grid("bed", {
  "XXXXXXXXXXXXXXXX",
  "XkkkkkkkkkkkkkkX",
  "XkWWWWWWWWWWWWkX",
  "XkWLLLLLLLLLLWkX",
  "XkWWWWWWWWWWWWkX",
  "XkBBBBBBBBBBBBkX",
  "XkBbbBBBBBBBBBkX",
  "XkBBBBBBBBBBBBkX",
  "XkBBBBBBBBBBBBkX",
  "XkBBBBBBBBBBBBkX",
  "XkBBBBBBBBBBBBkX",
  "XkBBBBBBBBBBBBkX",
  "XkBBBBBBBBBBBBkX",
  "XkBBBBBBBBBBBBkX",
  "XkkkkkkkkkkkkkkX",
  "XXXXXXXXXXXXXXXX",
})

-- ---- coin: Aseprite shape tools (clean circle) ----------------------------

local spr = Sprite(16, 16, ColorMode.RGB)
local lay = spr.layers[1]
local function tool(t, c, pts)
  app.useTool{ tool = t, color = c, points = pts, sprite = spr, layer = lay,
               frame = 1, brush = Brush(1) }
end

-- gold disc: ellipse outline then flood-fill the interior (12x12 = true circle)
tool("ellipse", col("y"), { Point(2, 2), Point(13, 13) })
tool("paint_bucket", col("y"), { Point(7, 7) })
-- inner bevel ring (orange), then dark outer outline on top
tool("ellipse", col("o"), { Point(3, 3), Point(12, 12) })
tool("ellipse", col("X"), { Point(2, 2), Point(13, 13) })
-- highlight glint
local img = spr.cels[1].image
img:drawPixel(5, 3, app.pixelColor.rgba(244, 244, 244, 255))
img:drawPixel(6, 3, app.pixelColor.rgba(244, 244, 244, 255))
img:drawPixel(4, 4, app.pixelColor.rgba(244, 244, 244, 255))
spr:saveAs(DIR .. "/coin.png")
spr:close()

print("aseprite: wrote potion, sword, bed, coin to " .. DIR)
