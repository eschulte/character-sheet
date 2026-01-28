Simple D&D 5e Character Sheet
=============================

https://eschulte.github.io/character-sheet

- Offline storage and functionality
- Snapshots to easily view and recover old versions
- Mobile friendly
- Simple and easy to use
- Sharing links
- Update the title to match the name, species, and class
- Hide the up/down arrows when not hovering for better look
- Automate modifier calculation
- Conflict Detection with modification on multiple devices add a "last updated" field to check on update
- Add a "New Version available - Click to Update" button in the status element when applicable
- Automate Skill/Save calculation
- Add short/long rest buttons for automatic reset
- Update the status element to indicate when offline
- Tool tips on hover
- Suggested smart completion for spell names
- Use the status element to indicate if the current changes have sync'd to firebase

Features:
- Switch to a tabbed interface on mobile with tabs like "Combat," "Skills," "Spells," "Bio"
- Touch friendly interface on mobile with "+" and "-" buttons to avoid raising the keyboard as much
- Make some section collapsible on mobile to save space
- Add lookup from https://open5e.com for completion of spells, equipment, and anything else

Needed Tool Tips:
- Need tool tips for the following:
- simple weapons
- Alchemist's Supplies
- Tool Proficiencies
- Tool Profeciency
- Languages
- Dungeoneer's Pack
- Traveler's Clothes
- Quarterstaff
- Pouches
- Catapult
- Poison Spray

## Misc notes and helpful snippets

### JSON DB Maintenance
```bash
# Merge two JSON files keeping keys unique.
jq -nS 'reduce inputs as $item ({}; . + $item | to_entries | map({key, value: .value | unique}) | from_entries)' \
   ai_comments.json new_ai_comments.json > merged_ai_comments.json
mv merged_ai_comments.json ai_comments.json
```

### Firebase Config
```js
// Your web app's Firebase configuration
// https://console.firebase.google.com/project/dnd-character-sheet-5e/
const firebaseConfig = {
  apiKey: "AIzaSyAMfAkyUevv3BDKSO3yBjRra3jZ_uV5OlA",
  authDomain: "dnd-character-sheet-5e.firebaseapp.com",
  projectId: "dnd-character-sheet-5e",
  storageBucket: "dnd-character-sheet-5e.firebasestorage.app",
  messagingSenderId: "554732035132",
  appId: "1:554732035132:web:ed89be7af2ceea147a7739"
};
```

### Discord Config
Developer Portal:
https://discord.com/developers/applications/1465858284564250836/information

Discord Add-App-To-Server:
https://discord.com/oauth2/authorize?client_id=1465858284564250836&permissions=2147485696&integration_type=0&scope=bot+applications.commands

- Application ID: 1465858284564250836
- Public Key: 25e5036ee33ca475729a27b0baa07084f8a04719e2359546fd7dedfb777e8899

## Additional changes to make

### The "Rest" Economy (Utility for All)

**Problem:** Players have to manually uncheck 15+ spell slot checkboxes and reset HP after every session.
**Suggestion:** Add a "Rest" dropdown in the Management menu or as a button in the Combat/Magic tabs.

* **Short Rest:** Resets specific class resources (like Ki or Fighter’s Second Wind) and allows a "Hit Dice" input.
* **Long Rest:** A "Nuke" button that clears all spell-slot checkboxes, resets HP to Max, and resets "Uses" counters on magic items.

### Aesthetic "Theme" Integration (Visual Appeal)

**Problem:** The dark grey `#app-controls` bar feels like a "Developer Tool" rather than part of the game.
**Suggestion:** Apply the "Solarized" theme or a dark "Parchment" texture to the control bar.

* Use a "Wax Seal" icon for the Save button or a "Spellbook" icon for Character Management.
* This makes the PWA feel like a cohesive app rather than a website with a character sheet on it.

### Interactive Dice "Hints" (Ease of Use)

**Problem:** Players often ask "What do I roll for this?"
**Suggestion:** In the "Skills" list, make the modifier (e.g., +5) look like a button.

* Clicking it doesn't necessarily need a full 3D dice engine, but it could trigger a "Spark" that says: *"Rolling for Stealth? Roll 1d20 and add 5!"* This reinforces the core mechanic for beginners.
