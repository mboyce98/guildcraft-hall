local addonName, ns = ...

-- Dungeons with their usual level ranges, where they are, and quests worth picking up first.
-- side: "A" Alliance only quests, "H" Horde only quests, "" both.
ns.DUNGEONS = {
  { name = "Ragefire Chasm",               min = 13, max = 18, where = "Orgrimmar",           tip = "Horde: get Searching for the Lost Satchel and Hidden Enemies in Orgrimmar." },
  { name = "Wailing Caverns",              min = 17, max = 24, where = "The Barrens",         tip = "Horde: get Leaders of the Fang and Serpentbloom in Thunder Bluff. Deviate Hides is at the cave entrance." },
  { name = "The Deadmines",                min = 17, max = 26, where = "Westfall",            tip = "Alliance: get Red Silk Bandanas and The Defias Brotherhood in Sentinel Hill." },
  { name = "Shadowfang Keep",              min = 22, max = 30, where = "Silverpine Forest",   tip = "Horde: get Arugal Must Die, Deathstalkers in Shadowfang and The Book of Ur." },
  { name = "Blackfathom Deeps",            min = 24, max = 32, where = "Ashenvale",           tip = "Get Knowledge in the Deeps and Blackfathom Villainy before you go." },
  { name = "The Stockade",                 min = 24, max = 32, where = "Stormwind",           tip = "Alliance: get Crime and Punishment and The Fury Runs Deep (Wetlands)." },
  { name = "Gnomeregan",                   min = 29, max = 38, where = "Dun Morogh",          tip = "Get Save Techbot and Gnogaine in Ironforge first." },
  { name = "Razorfen Kraul",               min = 29, max = 38, where = "The Barrens",         tip = "Get Blueleaf Tubers and Willix the Importer." },
  { name = "Scarlet Monastery: Graveyard", min = 26, max = 36, where = "Tirisfal Glades",     tip = "Quick runs. Good for groups in their late 20s." },
  { name = "Scarlet Monastery: Library",   min = 29, max = 39, where = "Tirisfal Glades",     tip = "Horde: get Compendium of the Fallen in Thunder Bluff." },
  { name = "Scarlet Monastery: Armory",    min = 32, max = 42, where = "Tirisfal Glades",     tip = "Herod drops good two-handers." },
  { name = "Scarlet Monastery: Cathedral", min = 35, max = 45, where = "Tirisfal Glades",     tip = "Get In the Name of the Light (Horde) or the Mograine quests." },
  { name = "Razorfen Downs",               min = 37, max = 46, where = "The Barrens",         tip = "Get Bring the End and Extinguishing the Idol." },
  { name = "Uldaman",                      min = 41, max = 51, where = "Badlands",            tip = "Lots of quests in the Badlands and Ironforge." },
  { name = "Zul'Farrak",                   min = 44, max = 54, where = "Tanaris",             tip = "Get quests in Gadgetzan and Steamwheedle Port." },
  { name = "Maraudon",                     min = 46, max = 55, where = "Desolace",            tip = "Get the scepter quest line in Desolace." },
  { name = "Sunken Temple",                min = 50, max = 60, where = "Swamp of Sorrows",    tip = "Class quests send you here." },
  { name = "Blackrock Depths",             min = 52, max = 60, where = "Blackrock Mountain",  tip = "A long dungeon. Plan a few hours." },
}

-- Professions the guild website tracks recipes for (names as the site uses them).
ns.SITE_PROFS = {
  Alchemy = true, Blacksmithing = true, Enchanting = true, Engineering = true,
  Leatherworking = true, Tailoring = true, Mining = true, Cooking = true, ["First Aid"] = true,
}

ns.SITE = "https://guildcraft-hall.netlify.app"
