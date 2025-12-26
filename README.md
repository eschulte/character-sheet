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
