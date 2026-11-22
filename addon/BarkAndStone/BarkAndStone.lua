local addonName, ns = ...

-- Bark and Stone guild helper.
--   /bas          open the window
--   /bas ding     turn the guild "Ding!" message on or off
-- Tabs: guildmates near your level, dungeons for your level, and an export of
-- your characters, professions and recipes to paste into the guild website.

local VERSION = "1.0.0"
local NEAR = 4            -- "near my level" means within this many levels
local DB, me              -- saved data, and this character's entry in it

local function say(msg) print("|cffe3b55bBark and Stone:|r " .. msg) end

-------------------------------------------------------------------------------
-- Saved data: one entry per character on this account
-------------------------------------------------------------------------------
local function charKey() return (GetRealmName() or "") .. "-" .. (UnitName("player") or "") end

local function updateMe()
  if not me then return end
  me.name = UnitName("player")
  me.realm = GetRealmName()
  me.class = UnitClass("player")
  me.level = UnitLevel("player")
  me.race = UnitRace("player")
  me.faction = UnitFactionGroup("player")
  me.zone = (GetRealZoneText and GetRealZoneText()) or ""
  me.money = (GetMoney and GetMoney()) or 0
  me.seen = time()
end

-- Some clients add an expansion word, for example "Classic Alchemy". Keep the plain name.
local function cleanProf(name)
  if not name then return nil end
  for plain in pairs(ns.SITE_PROFS) do
    if name == plain or name:find(plain, 1, true) then return plain end
  end
  return name
end

local function saveProf(prof, skill, ids, names)
  prof = cleanProf(prof)
  if not me or not prof then return end
  me.profs = me.profs or {}
  local p = me.profs[prof] or { skill = 0, ids = {}, names = {} }
  if skill and skill > 0 then p.skill = skill end
  -- Keep what we already knew too: a search filter in the window can hide recipes.
  local seen = {}
  for _, id in ipairs(p.ids) do seen[id] = true end
  for _, id in ipairs(ids or {}) do if not seen[id] then seen[id] = true; p.ids[#p.ids + 1] = id end end
  local seenN = {}
  for _, n in ipairs(p.names) do seenN[n] = true end
  for _, n in ipairs(names or {}) do if not seenN[n] then seenN[n] = true; p.names[#p.names + 1] = n end end
  me.profs[prof] = p
end

-- Skill levels of every profession, without opening the windows.
local function readSkills()
  if GetProfessions and GetProfessionInfo then
    local list = { GetProfessions() }
    for i = 1, 6 do
      local idx = list[i]
      if idx then
        local name, _, rank = GetProfessionInfo(idx)
        if name then saveProf(name, rank) end
      end
    end
  elseif GetNumSkillLines and GetSkillLineInfo then
    for i = 1, GetNumSkillLines() do
      local name, isHeader, _, rank = GetSkillLineInfo(i)
      if name and not isHeader and ns.SITE_PROFS[cleanProf(name)] then saveProf(name, rank) end
    end
  end
end

-------------------------------------------------------------------------------
-- Reading known recipes when a profession window opens
-------------------------------------------------------------------------------
local function scanModern()
  local T = C_TradeSkillUI
  if not (T and T.GetAllRecipeIDs and T.GetRecipeInfo) then return false end
  -- Skip windows that show someone else's recipes.
  if (T.IsTradeSkillLinked and T.IsTradeSkillLinked()) or (T.IsTradeSkillGuild and T.IsTradeSkillGuild())
    or (T.IsNPCCrafting and T.IsNPCCrafting()) then return true end
  local prof, skill
  local base = T.GetBaseProfessionInfo and T.GetBaseProfessionInfo()
  if base then prof, skill = base.professionName, base.skillLevel end
  local child = T.GetChildProfessionInfo and T.GetChildProfessionInfo()
  if child then
    prof = prof or child.parentProfessionName or child.professionName
    if child.skillLevel and child.skillLevel > (skill or 0) then skill = child.skillLevel end
  end
  if not prof or prof == "" then return true end
  local ids = {}
  for _, id in ipairs(T.GetAllRecipeIDs() or {}) do
    local info = T.GetRecipeInfo(id)
    if info and info.learned then ids[#ids + 1] = id end
  end
  saveProf(prof, skill, ids)
  return true
end

local function scanClassicTrade()
  if not (GetNumTradeSkills and GetTradeSkillLine) then return end
  if IsTradeSkillLinked and IsTradeSkillLinked() then return end
  local prof, rank = GetTradeSkillLine()
  if not prof or prof == "UNKNOWN" then return end
  local ids, names = {}, {}
  for i = 1, GetNumTradeSkills() do
    local name, kind = GetTradeSkillInfo(i)
    if name and kind ~= "header" and kind ~= "subheader" then
      local link = GetTradeSkillRecipeLink and GetTradeSkillRecipeLink(i)
      local id = link and tonumber(link:match("enchant:(%d+)"))
      if id then ids[#ids + 1] = id else names[#names + 1] = name end
    end
  end
  saveProf(prof, rank, ids, names)
end

local function scanClassicCraft() -- Enchanting on older clients
  if not (GetNumCrafts and GetCraftDisplaySkillLine) then return end
  local prof, rank = GetCraftDisplaySkillLine()
  if not prof then return end
  local ids, names = {}, {}
  for i = 1, GetNumCrafts() do
    local name, _, kind = GetCraftInfo(i)
    if name and kind ~= "header" then
      local link = (GetCraftRecipeLink and GetCraftRecipeLink(i)) or (GetCraftItemLink and GetCraftItemLink(i))
      local id = link and tonumber(link:match("enchant:(%d+)"))
      if id then ids[#ids + 1] = id else names[#names + 1] = name end
    end
  end
  saveProf(prof, rank, ids, names)
end

local function scanTrade()
  if not scanModern() then scanClassicTrade() end
end

-------------------------------------------------------------------------------
-- Guild roster
-------------------------------------------------------------------------------
local function askRoster()
  if C_GuildInfo and C_GuildInfo.GuildRoster then C_GuildInfo.GuildRoster()
  elseif GuildRoster then GuildRoster() end
end

local function shortName(n)
  if Ambiguate then return Ambiguate(n, "short") end
  return (n:gsub("%-.*$", ""))
end

local function classColor(token)
  local c = token and RAID_CLASS_COLORS and RAID_CLASS_COLORS[token]
  if not c then return "ffffffff" end
  if c.colorStr then return c.colorStr end
  return string.format("ff%02x%02x%02x", c.r * 255, c.g * 255, c.b * 255)
end

-- Online and offline guildmates as { name, level, class, token, zone, online }.
local function guildmates()
  local out = {}
  if not (IsInGuild and IsInGuild()) or not GetNumGuildMembers then return out end
  local myName = UnitName("player")
  for i = 1, GetNumGuildMembers() do
    local name, _, _, level, className, zone, _, _, online, _, token = GetGuildRosterInfo(i)
    if name then
      name = shortName(name)
      if name ~= myName then
        out[#out + 1] = { name = name, level = level or 0, class = className or "", token = token, zone = zone or "", online = online and true or false }
      end
    end
  end
  table.sort(out, function(a, b) return a.level > b.level end)
  return out
end

local function colored(m) return "|c" .. classColor(m.token) .. m.name .. "|r" end

-------------------------------------------------------------------------------
-- Page text for each tab
-------------------------------------------------------------------------------
local function dungeonColor(d, lvl)
  if lvl < d.min - 2 then return "|cffff6060" end   -- too high for you
  if lvl > d.max then return "|cff9d9d9d" end       -- too low to be worth it
  return "|cff40ff40"                               -- right for you
end

local function nearText()
  local lvl = UnitLevel("player")
  local L = { "|cffe3b55bYou are level " .. lvl .. ".|r Guildmates within " .. NEAR .. " levels of you:", "" }
  if not (IsInGuild and IsInGuild()) then
    L[#L + 1] = "You're not in a guild on this character."
    return table.concat(L, "\n")
  end
  local on, off = {}, {}
  for _, m in ipairs(guildmates()) do
    if math.abs(m.level - lvl) <= NEAR then
      if m.online then on[#on + 1] = m else off[#off + 1] = m end
    end
  end
  if #on == 0 then
    L[#L + 1] = "Nobody near your level is online right now."
  else
    L[#L + 1] = "|cff40ff40Online now|r"
    for _, m in ipairs(on) do
      L[#L + 1] = string.format("  %s  %d %s  |cff9d9d9d%s|r", colored(m), m.level, m.class, m.zone)
    end
    L[#L + 1] = ""
    L[#L + 1] = "|cff9d9d9dSay hi with /w Name. Questing together is faster and safer.|r"
  end
  if #off > 0 then
    local names = {}
    for i = 1, math.min(#off, 20) do names[#names + 1] = colored(off[i]) .. " " .. off[i].level end
    L[#L + 1] = ""
    L[#L + 1] = "|cff9d9d9dOffline but near your level:|r " .. table.concat(names, ", ") .. (#off > 20 and " …" or "")
  end
  -- Dungeons that fit you and the people online near you.
  local fits = {}
  for _, d in ipairs(ns.DUNGEONS) do
    if lvl >= d.min - 2 and lvl <= d.max then
      local n = 0
      for _, m in ipairs(on) do if m.level >= d.min - 2 and m.level <= d.max then n = n + 1 end end
      fits[#fits + 1] = string.format("  |cff40ff40%s|r (%d-%d, %s)%s", d.name, d.min, d.max, d.where,
        n > 0 and (" |cffe3b55b" .. n .. " online guildmate" .. (n == 1 and "" or "s") .. " fit|r") or "")
    end
  end
  L[#L + 1] = ""
  L[#L + 1] = "|cffe3b55bDungeons for your level|r"
  if #fits == 0 then L[#L + 1] = "  None yet. Most groups start with dungeons at level 15 to 18." end
  for _, s in ipairs(fits) do L[#L + 1] = s end
  return table.concat(L, "\n")
end

local function dungeonsText()
  local lvl = UnitLevel("player")
  local online = {}
  for _, m in ipairs(guildmates()) do if m.online then online[#online + 1] = m end end
  local L = { "|cff40ff40Green|r: right for you   |cffff6060Red|r: too hard for now   |cff9d9d9dGrey|r: too easy", "" }
  for _, d in ipairs(ns.DUNGEONS) do
    L[#L + 1] = string.format("%s%s|r  levels %d-%d, %s", dungeonColor(d, lvl), d.name, d.min, d.max, d.where)
    L[#L + 1] = "    |cffbbbbbb" .. d.tip .. "|r"
    local fit = {}
    for _, m in ipairs(online) do if m.level >= d.min - 2 and m.level <= d.max then fit[#fit + 1] = colored(m) .. " " .. m.level end end
    if #fit > 0 then L[#L + 1] = "    Online guildmates at this level: " .. table.concat(fit, ", ") end
    L[#L + 1] = ""
  end
  return table.concat(L, "\n")
end

-- Text the website reads. "~" separates fields and ";" separates list items.
local function clean(s) return (tostring(s or ""):gsub("[~;\r\n|]", " ")) end

local function exportText()
  updateMe(); readSkills()
  local L = { "BAS1~" .. VERSION }
  local keys = {}
  for k in pairs(DB.chars) do keys[#keys + 1] = k end
  table.sort(keys)
  for _, k in ipairs(keys) do
    local c = DB.chars[k]
    L[#L + 1] = table.concat({ "C", clean(c.name), clean(c.realm), clean(c.class), c.level or 0, clean(c.race), clean(c.faction), clean(c.zone), c.money or 0 }, "~")
    for prof, p in pairs(c.profs or {}) do
      local ids = {}
      for i, id in ipairs(p.ids or {}) do ids[i] = tostring(id) end
      L[#L + 1] = table.concat({ "P", clean(prof), p.skill or 0, table.concat(ids, ";") }, "~")
      if p.names and #p.names > 0 then
        local names = {}
        for i, n in ipairs(p.names) do names[i] = clean(n) end
        L[#L + 1] = table.concat({ "N", clean(prof), table.concat(names, ";") }, "~")
      end
    end
  end
  L[#L + 1] = "END"
  return table.concat(L, "\n")
end

-------------------------------------------------------------------------------
-- Window
-------------------------------------------------------------------------------
local frame, tabs, textScroll, textBody, exportScroll, exportBox, exportHelp
local current = "near"

local function setTab(name, keepScroll)
  current = name
  for key, b in pairs(tabs) do
    if key == name then b:LockHighlight() else b:UnlockHighlight() end
  end
  local isExport = name == "export"
  textScroll:SetShown(not isExport)
  exportScroll:SetShown(isExport)
  exportHelp:SetShown(isExport)
  if isExport then
    exportBox:SetText(exportText())
    exportBox:SetFocus()
    exportBox:HighlightText()
  else
    textBody:SetText(name == "near" and nearText() or dungeonsText())
    textBody:GetParent():SetHeight(textBody:GetStringHeight() + 20)
    if not keepScroll then textScroll:SetVerticalScroll(0) end
  end
end

local function buildWindow()
  frame = CreateFrame("Frame", "BarkAndStoneFrame", UIParent, "BackdropTemplate")
  frame:SetSize(560, 460)
  frame:SetPoint("CENTER")
  frame:SetFrameStrata("DIALOG")
  frame:SetBackdrop({
    bgFile = "Interface\\DialogFrame\\UI-DialogBox-Background-Dark",
    edgeFile = "Interface\\DialogFrame\\UI-DialogBox-Border",
    tile = true, tileSize = 32, edgeSize = 32,
    insets = { left = 11, right = 12, top = 12, bottom = 11 },
  })
  frame:SetMovable(true)
  frame:EnableMouse(true)
  frame:RegisterForDrag("LeftButton")
  frame:SetScript("OnDragStart", frame.StartMoving)
  frame:SetScript("OnDragStop", frame.StopMovingOrSizing)
  frame:Hide()
  tinsert(UISpecialFrames, "BarkAndStoneFrame") -- Escape closes it

  local title = frame:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
  title:SetPoint("TOP", 0, -18)
  title:SetText("Bark and Stone")

  local close = CreateFrame("Button", nil, frame, "UIPanelCloseButton")
  close:SetPoint("TOPRIGHT", -6, -6)

  tabs = {}
  local defs = { { "near", "Near my level" }, { "dungeons", "Dungeons" }, { "export", "Send to website" } }
  local prev
  for _, d in ipairs(defs) do
    local b = CreateFrame("Button", nil, frame, "UIPanelButtonTemplate")
    b:SetSize(150, 24)
    if prev then b:SetPoint("LEFT", prev, "RIGHT", 8, 0) else b:SetPoint("TOPLEFT", 24, -46) end
    b:SetText(d[2])
    b:SetScript("OnClick", function() askRoster(); setTab(d[1]) end)
    tabs[d[1]] = b
    prev = b
  end

  -- Scrolling text for the first two tabs.
  textScroll = CreateFrame("ScrollFrame", nil, frame, "UIPanelScrollFrameTemplate")
  textScroll:SetPoint("TOPLEFT", 24, -82)
  textScroll:SetPoint("BOTTOMRIGHT", -40, 22)
  local child = CreateFrame("Frame", nil, textScroll)
  child:SetSize(490, 400)
  textScroll:SetScrollChild(child)
  textBody = child:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
  textBody:SetPoint("TOPLEFT", 4, -4)
  textBody:SetWidth(480)
  textBody:SetJustifyH("LEFT")
  textBody:SetSpacing(3)

  -- Export: a text box to copy from.
  exportHelp = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  exportHelp:SetPoint("TOPLEFT", 24, -82)
  exportHelp:SetWidth(500)
  exportHelp:SetJustifyH("LEFT")
  exportHelp:SetText("Open each profession window once so its recipes are saved. Then press Ctrl+A and Ctrl+C here, and paste it on the website under My recipes, Import from the addon.\n" .. ns.SITE .. "/#mine")

  exportScroll = CreateFrame("ScrollFrame", nil, frame, "UIPanelScrollFrameTemplate")
  exportScroll:SetPoint("TOPLEFT", 24, -122)
  exportScroll:SetPoint("BOTTOMRIGHT", -40, 22)
  exportBox = CreateFrame("EditBox", nil, exportScroll)
  exportBox:SetMultiLine(true)
  exportBox:SetAutoFocus(false)
  exportBox:SetFontObject(ChatFontNormal)
  exportBox:SetWidth(480)
  exportBox:SetScript("OnEscapePressed", function(self) self:ClearFocus(); frame:Hide() end)
  exportBox:SetScript("OnTextChanged", function(self, user)
    if user then self:SetText(exportText()); self:HighlightText() end -- read only
  end)
  exportScroll:SetScrollChild(exportBox)

  frame:SetScript("OnShow", function() askRoster(); setTab(current) end)
end

local function toggle()
  if not frame then buildWindow() end
  frame:SetShown(not frame:IsShown())
end

-------------------------------------------------------------------------------
-- Events
-------------------------------------------------------------------------------
local ev = CreateFrame("Frame")
ev:RegisterEvent("ADDON_LOADED")
ev:RegisterEvent("PLAYER_LOGIN")
ev:RegisterEvent("PLAYER_LEVEL_UP")
ev:RegisterEvent("ZONE_CHANGED_NEW_AREA")
ev:RegisterEvent("PLAYER_MONEY")
ev:RegisterEvent("GUILD_ROSTER_UPDATE")
ev:RegisterEvent("TRADE_SKILL_SHOW")
pcall(ev.RegisterEvent, ev, "TRADE_SKILL_LIST_UPDATE")
pcall(ev.RegisterEvent, ev, "TRADE_SKILL_UPDATE")
pcall(ev.RegisterEvent, ev, "CRAFT_SHOW")
pcall(ev.RegisterEvent, ev, "CRAFT_UPDATE")
pcall(ev.RegisterEvent, ev, "SKILL_LINES_CHANGED")

local function sendGuild(msg)
  local send = (C_ChatInfo and C_ChatInfo.SendChatMessage) or SendChatMessage
  if send then pcall(send, msg, "GUILD") end
end

ev:SetScript("OnEvent", function(_, event, arg1)
  if event == "ADDON_LOADED" and arg1 == addonName then
    BarkAndStoneDB = BarkAndStoneDB or {}
    DB = BarkAndStoneDB
    DB.chars = DB.chars or {}
    if DB.ding == nil then DB.ding = true end
  elseif event == "PLAYER_LOGIN" then
    DB = DB or BarkAndStoneDB or {}
    local key = charKey()
    DB.chars[key] = DB.chars[key] or { profs = {} }
    me = DB.chars[key]
    updateMe(); readSkills(); askRoster()
    say("loaded. Type /bas to find guildmates near your level and dungeons to run.")
  elseif not me then
    return
  elseif event == "PLAYER_LEVEL_UP" then
    local lvl = tonumber(arg1) or UnitLevel("player")
    updateMe(); me.level = lvl
    if DB.ding and IsInGuild and IsInGuild() then sendGuild("Ding! Level " .. lvl .. ".") end
    if lvl % 2 == 0 then say("Level " .. lvl .. "! New spells are waiting at your class trainer.") end
    if lvl == 40 then say("Level 40: you can learn to ride. Save up for training and your mount.") end
    for _, d in ipairs(ns.DUNGEONS) do
      if d.min - 2 == lvl then say("You can now run " .. d.name .. " (" .. d.where .. "). Type /bas to see who can join.") end
    end
  elseif event == "ZONE_CHANGED_NEW_AREA" or event == "PLAYER_MONEY" then
    updateMe()
  elseif event == "SKILL_LINES_CHANGED" then
    readSkills()
  elseif event == "GUILD_ROSTER_UPDATE" then
    if frame and frame:IsShown() and current ~= "export" then setTab(current, true) end
  elseif event == "CRAFT_SHOW" or event == "CRAFT_UPDATE" then
    scanClassicCraft()
  else -- the profession window opened or changed
    scanTrade()
  end
end)

SLASH_BARKANDSTONE1 = "/bas"
SLASH_BARKANDSTONE2 = "/barkandstone"
SlashCmdList.BARKANDSTONE = function(msg)
  msg = (msg or ""):lower():match("^%s*(.-)%s*$")
  if msg == "ding" then
    DB.ding = not DB.ding
    say("guild \"Ding!\" message is now " .. (DB.ding and "on" or "off") .. ".")
  elseif msg == "export" then
    if not frame then buildWindow() end
    current = "export"; frame:Show()
  elseif msg == "help" then
    say("/bas opens the window. /bas export opens Send to website. /bas ding turns the guild Ding! message on or off.")
  else
    toggle()
  end
end
