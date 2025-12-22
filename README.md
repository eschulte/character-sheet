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

Bugs:
- Currently firebase is throwing errors like:
  FirebaseError: [code=invalid-argument]: Function setDoc() called with invalid data. Nested arrays are not supported (found in document characters/6ca20fbb-9adb-4a34-970b-76332e16c255)

Features:
- Conflict Detection with modification on multiple devices add a "last updated" field to check on update
- Use the status element to indicate if the current changes have sync'd to firebase
- Switch to a tabbed interface on mobile with tabs like "Combat," "Skills," "Spells," "Bio"
- Touch friendly interface on mobile with "+" and "-" buttons to avoid raising the keyboard as much
- Make some section collapsible on mobile to save space
- Automate Skill/Save calculation
- Add short/long rest buttons for automatic reset
- Add lookup from https://open5e.com for completion of spells, equipment, and anything else
- Add a "New Version available - Click to Update" button in the status element when applicable
- Update the status element to indicate when offline
- Tool tips on hover
- Suggested smart completion for spell names



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
