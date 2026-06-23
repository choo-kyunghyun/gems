-- Aseprite multi-state demo: import the agent hero strip, tag the state ranges,
-- and export a sheet + TAGGED JSON + GIF + editable source.
-- Run: Aseprite.exe -b -script-param in=<hero_strip.png> -script-param out=<dir> -script aseprite_states.lua
-- The tagged JSON (meta.frameTags) is the deliverable the agent path has no native
-- equivalent for: it names frame ranges (idle/walk/attack) for an Animator graph.

local IN = assert(app.params["in"], "pass --script-param in=<hero_strip.png>")
local DIR = assert(app.params["out"], "pass --script-param out=<dir>")
app.fs.makeDirectory(DIR)

local FW, FH = 16, 16
local src = app.open(IN)
local img = src.cels[1].image
local n = src.width // FW

local spr = Sprite(FW, FH, ColorMode.RGB)
local lay = spr.layers[1]
for _ = 2, n do spr:newEmptyFrame() end

for f = 1, n do
  local cel = lay:cel(f)
  if cel == nil then cel = spr:newCel(lay, f) end
  local dst = cel.image
  for y = 0, FH - 1 do
    for x = 0, FW - 1 do
      dst:drawPixel(x, y, img:getPixel((f - 1) * FW + x, y))
    end
  end
end
src:close()

-- tags (1-based frame ranges) + per-state frame durations
local function tag(from, to, name, dir, dur)
  local t = spr:newTag(from, to)
  t.name = name
  t.aniDir = dir
  for f = from, to do spr.frames[f].duration = dur end
end
tag(1, 2, "idle", AniDir.FORWARD, 0.40)
tag(3, 6, "walk", AniDir.FORWARD, 0.125)
tag(7, 9, "attack", AniDir.FORWARD, 0.08)

app.command.ExportSpriteSheet{
  ui = false,
  type = SpriteSheetType.HORIZONTAL,
  textureFilename = DIR .. "/hero_sheet.png",
  dataFilename = DIR .. "/hero_sheet.json",
  dataFormat = SpriteSheetDataFormat.JSON_ARRAY,
  listTags = true,
}
spr:saveAs(DIR .. "/hero.aseprite")     -- editable source
spr:saveCopyAs(DIR .. "/hero.gif")      -- viewable animation (all states)

print("aseprite hero: " .. n .. " frames, 3 tags -> hero_sheet.png, hero_sheet.json, hero.gif, hero.aseprite")
