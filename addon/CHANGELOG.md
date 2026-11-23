# Bark and Stone

## 1.0.1

- Lighter on the game: profession scans, guild list refreshes, skill and gold updates are now batched instead of running on every event, and nothing runs during combat.
- Profession windows aren't re-read when nothing has changed.
- The guild list is reused until the roster actually changes, and the server is asked for it at most every 20 seconds.

## 1.0.0

- First release for WoW Forever.
- **Near my level:** guildmates within 4 levels of you (online first, with their zone), and dungeons that suit you and them.
- **Dungeons:** every dungeon from Ragefire Chasm to Blackrock Depths, coloured for your level, with quests to pick up first and which online guildmates fit.
- **Send to website:** your characters, profession skill levels and known recipes, ready to paste into the Bark and Stone guild website.
- "Ding!" message in guild chat when you level up (`/bas ding` to turn it off), class trainer reminders on even levels, and a heads-up when a new dungeon fits your level.
