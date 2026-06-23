-- Aseprite animation demo: an 8-frame spinning coin.
-- Run: Aseprite.exe -b -script-param out=<dir> -script aseprite_anim.lua
-- Each frame is a coin at a different apparent width (ellipse tool), edge frames a
-- thin bar. Exports an animated GIF, a horizontal sprite sheet, and the .aseprite source.

local DIR = assert(app.params["out"], "pass --script-param out=<dir>")
app.fs.makeDirectory(DIR)

local Y = Color{ r = 255, g = 205, b = 117 }  -- gold
local O = Color{ r = 239, g = 125, b = 87 }   -- rim
local W = Color{ r = 244, g = 244, b = 244 }  -- highlight
local X = Color{ r = 26, g = 28, b = 44 }     -- dark

local spr = Sprite(16, 16, ColorMode.RGB)
local lay = spr.layers[1]
for _ = 2, 8 do spr:newEmptyFrame() end

local function tool(t, c, pts, f)
  app.useTool{ tool = t, color = c, points = pts, sprite = spr, layer = lay,
               frame = f, brush = Brush(1) }
end

-- per-frame half-extent: {left,right} ellipse box, or nil = edge-on bar
local BOX = { {2,13}, {4,11}, nil, {4,11}, {2,13}, {4,11}, nil, {4,11} }
local FRONT = { true, true, false, false, false, false, false, true }

for f = 1, 8 do
  local b = BOX[f]
  if b == nil then
    -- edge-on: a 2px vertical bar with dark caps
    tool("line", O, { Point(7, 2), Point(7, 13) }, f)
    tool("line", O, { Point(8, 2), Point(8, 13) }, f)
    tool("pencil", X, { Point(7, 2) }, f)
    tool("pencil", X, { Point(8, 2) }, f)
    tool("pencil", X, { Point(7, 13) }, f)
    tool("pencil", X, { Point(8, 13) }, f)
  else
    tool("ellipse", O, { Point(b[1], 2), Point(b[2], 13) }, f)  -- orange rim outline
    tool("paint_bucket", Y, { Point(8, 8) }, f)                 -- gold fill
    if FRONT[f] then
      tool("pencil", W, { Point(6, 4) }, f)
      tool("pencil", W, { Point(7, 4) }, f)
      tool("pencil", W, { Point(6, 5) }, f)
    end
  end
  spr.frames[f].duration = 0.08
end

app.command.ExportSpriteSheet{
  ui = false,
  type = SpriteSheetType.HORIZONTAL,
  textureFilename = DIR .. "/coin_sheet.png",
}
spr:saveAs(DIR .. "/coin.aseprite")          -- editable source
spr:saveCopyAs(DIR .. "/coin_aseprite.gif")  -- viewable animation

print("aseprite anim: 8 frames -> coin_aseprite.gif, coin_sheet.png, coin.aseprite")
