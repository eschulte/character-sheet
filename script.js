import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  getDocs,
  limit,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// --- CONFIG ---
let tipsEnabled = true;
let AI_COMMENTS = {};

const firebaseConfig = {
  apiKey: 'AIzaSyAMfAkyUevv3BDKSO3yBjRra3jZ_uV5OlA',
  authDomain: 'dnd-character-sheet-5e.firebaseapp.com',
  projectId: 'dnd-character-sheet-5e',
  storageBucket: 'dnd-character-sheet-5e.firebasestorage.app',
  messagingSenderId: '554732035132',
  appId: '1:554732035132:web:ed89be7af2ceea147a7739',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// --- STATE ---
let currentUser = null;
let currentCharacterId = localStorage.getItem('dnd_char_id') || generateUUID();
let isCloudOwner = true;
let isLoading = false;
let hasUnsavedChanges = false;
let isAppReady = false;
const suggestLoadRemoteChanges = false;
let lastLoadedRemoteTimestamp = 0;
let lastLocalChangeTimestamp = 0;
let lastAutoSnapshotTime = 0;

const appControls = document.getElementById('app-controls');
const toggleHandle = document.getElementById('app-toggle-hamburger');
toggleHandle.addEventListener('click', (e) => {
  e.stopPropagation();
  appControls.classList.toggle('expanded');
});
function updateMobileToggle() {
  toggleHandle.style.display = window.innerWidth <= 768 ? 'inline-block' : 'none';
}
updateMobileToggle();
window.addEventListener('resize', updateMobileToggle);
localStorage.setItem('dnd_char_id', currentCharacterId);

window.login = async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    alert('Login failed: ' + e.message);
  }
};
window.logout = () => {
  signOut(auth);
  window.location.reload();
};

onAuthStateChanged(auth, async (user) => {
  const authBtn = document.getElementById('auth-btn');
  const statusEl = document.getElementById('status');
  if (user) {
    currentUser = user;
    authBtn.innerText = `Logout (${user.displayName.split(' ')[0]})`;
    authBtn.onclick = window.logout;
    statusEl.innerText = 'Online';
    await updateMyCharactersList();
    await setupRealtimeListener();
  } else {
    currentUser = null;
    authBtn.innerText = 'Login with Google';
    authBtn.onclick = window.login;
    statusEl.innerText = 'Offline Mode';
    updateDuplicateVis();
  }
});

async function updateMyCharactersList() {
  if (!currentUser) return;
  const select = document.getElementById('charSelect');
  try {
    const q = query(collection(db, 'characters'), where('ownerId', '==', currentUser.uid));
    const snap = await getDocs(q);
    select.innerHTML = '<option value="">My Characters...</option>';
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      const opt = document.createElement('option');
      opt.value = docSnap.id;
      opt.text = d.sheetData?.charName || 'Unnamed';
      select.appendChild(opt);
    });
    const newOpt = document.createElement('option');
    newOpt.value = 'NEW';
    newOpt.text = '+ Create New Character';
    select.appendChild(newOpt);
  } catch (e) {
    console.error('Error listing characters', e);
  }
}

window.loadMyCharacter = async function () {
  const select = document.getElementById('charSelect');
  if (!select.value) return;
  if (select.value === 'NEW') {
    window.resetSheet();
    return;
  }
  currentCharacterId = select.value;
  localStorage.setItem('dnd_char_id', currentCharacterId);
  window.location.href = `${window.location.pathname}?charId=${select.value}`;
};

function setupRealtimeListener() {
  if (!currentUser || !currentCharacterId) return;

  // Main character document listener
  onSnapshot(doc(db, 'characters', currentCharacterId), (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      isCloudOwner = currentUser.uid === data.ownerId;
      document.getElementById('status').innerText = isCloudOwner ? 'Online (Owner)' : 'Online (Read Only)';

      // Convert ISO string back to number for comparison logic
      const cloudTime = data.lastUpdated ? new Date(data.lastUpdated).getTime() : 0;

      if (suggestLoadRemoteChanges && cloudTime > lastLoadedRemoteTimestamp) {
        if (lastLocalChangeTimestamp > lastLoadedRemoteTimestamp) {
          if (confirm('New version available! Overwrite local edits?')) loadHeadData(data, cloudTime);
          else lastLoadedRemoteTimestamp = Date.now();
        } else {
          loadHeadData(data, cloudTime);
        }
      }
    } else {
      isCloudOwner = true;
      document.getElementById('status').innerText = 'Online (New)';
      updateDuplicateVis();
    }
  });

  // Snapshots sub-collection listener
  const snapsQ = query(
    collection(db, 'characters', currentCharacterId, 'snapshots'),
    orderBy('createdAt', 'desc'),
    limit(40),
  );
  onSnapshot(snapsQ, (qSnap) => {
    const select = document.getElementById('versionSelect');
    select.innerHTML = '<option value="">Load Version...</option>';

    qSnap.forEach((docSnap) => {
      const d = docSnap.data();
      // Javascript's new Date() handles both ISO strings and Integers automatically
      const dateObj = new Date(d.createdAt);
      const dateStr = dateObj.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
      const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

      const opt = document.createElement('option');
      opt.value = docSnap.id;
      opt.text = `[${dateStr} ${timeStr}] ${d.name || 'Auto'}`;
      select.appendChild(opt);
    });
  });
}

function loadHeadData(data, timestamp) {
  isLoading = true;
  isAppReady = false;
  populateData(data.sheetData);
  lastLoadedRemoteTimestamp = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
  if (data.sheetData['portrait-url']) {
    updatePortraitFromURL(data.sheetData['portrait-url']);
  }
  isLoading = false;
}

window.saveVersion = async function (isManualSnapshot = false) {
  if (!currentUser) return alert('Login required.');
  if (!isCloudOwner) return alert('You can only save characters you own.');
  const data = collectData();
  const now = new Date();
  const nowIso = now.toISOString();
  const todayStr = now.toLocaleDateString();
  const className = document.getElementById('class').value.trim();
  const level = document.getElementById('level').value.trim();

  // VALIDATION: Prevent saving if core identification is missing
  if (!className || !level) {
    const statusEl = document.getElementById('status');
    if (statusEl) statusEl.innerText = 'Error: Class and Level are required to save.';

    if (isManualSnapshot) {
      alert("Cannot save: Please ensure both 'Class' and 'Level' are filled out.");
    }
    return; // Stop the save process
  }

  const charRef = doc(db, 'characters', currentCharacterId);
  try {
    // 1. Always update the main document (Head)
    await setDoc(charRef, { ownerId: currentUser.uid, lastUpdated: nowIso, sheetData: data }, { merge: true });

    hasUnsavedChanges = false;

    const statusEl = document.getElementById('status');
    if (statusEl) {
      statusEl.innerText = isCloudOwner ? 'Online (Saved)' : 'Online (Read Only)';
      statusEl.style.color = '#aaa'; // Reset color
    }

    lastLoadedRemoteTimestamp = now.getTime();

    // 2. Snapshot Logic
    const snapsCol = collection(db, 'characters', currentCharacterId, 'snapshots');

    if (isManualSnapshot) {
      // MANUAL SNAPSHOT: Always create a new entry, never overwrite
      const name = prompt('Snapshot Name:', `Snapshot-${todayStr}`);
      if (name) {
        await addDoc(snapsCol, { name: name, createdAt: nowIso, sheetData: data, createdBy: currentUser.uid });
        console.log('Manual snapshot created.');
        alert('Snapshot saved successfully!');
      }
    } else {
      // AUTO-SAVE: Check throttle (5 minutes)
      if (now.getTime() - lastAutoSnapshotTime > 5 * 60 * 1000) {
        // Check the very last snapshot created to see if we can collapse this auto-save
        const q = query(snapsCol, orderBy('createdAt', 'desc'), limit(1));
        const querySnapshot = await getDocs(q);

        let overwritten = false;

        // If a snapshot exists and it is an "Auto-Save", we overwrite it.
        // If the last snapshot was "Level 4 Upgrade" (Manual), we do NOT overwrite it.
        if (!querySnapshot.empty) {
          const lastSnapDoc = querySnapshot.docs[0];
          const lastSnapData = lastSnapDoc.data();

          if (lastSnapData.name === 'Auto-Save') {
            await setDoc(doc(snapsCol, lastSnapDoc.id), {
              name: 'Auto-Save',
              createdAt: nowIso,
              sheetData: data,
              createdBy: currentUser.uid,
            });
            console.log('Previous Auto-Save overwritten.');
            overwritten = true;
          }
        }

        // If we didn't overwrite (because last one was Manual or collection empty), create new
        if (!overwritten) {
          await addDoc(snapsCol, { name: 'Auto-Save', createdAt: nowIso, sheetData: data, createdBy: currentUser.uid });
          console.log('New Auto-Save created.');
        }

        lastAutoSnapshotTime = now.getTime();
      }
    }
    updateMyCharactersList();
  } catch (e) {
    console.error('Save error:', e);
    alert('Error saving: ' + e.message);
  }
};

window.loadSelectedVersion = async function () {
  const select = document.getElementById('versionSelect');
  if (!select.value || !confirm('Load this version? Unsaved changes lost.')) return;
  isLoading = true;
  try {
    const snapDoc = await getDoc(doc(db, 'characters', currentCharacterId, 'snapshots', select.value));
    if (snapDoc.exists()) {
      const d = snapDoc.data();
      populateData(d.sheetData);
      lastLoadedRemoteTimestamp = Date.now();
      lastLocalChangeTimestamp = Date.now();
      alert(`Loaded: ${d.name}`);
    }
  } catch (e) {
    console.error(e);
  } finally {
    isLoading = false;
  }
};

// -- PORTRAIT & UPLOAD LOGIC --
function updatePortraitFromURL(url) {
  const img = document.getElementById('char-portrait');
  const placeholder = document.getElementById('portrait-placeholder');
  const container = document.getElementById('portrait-container');

  if (url && url.trim() !== '') {
    img.src = url;
    img.style.display = 'block';
    placeholder.style.display = 'none';
    container.classList.remove('editing');

    img.onerror = () => {
      img.style.display = 'none';
      placeholder.style.display = 'block';
      placeholder.innerText = 'Error loading image';
      container.classList.add('editing');
    };

    // Update Social Media Meta Tags for Link Sharing
    const metaTags = [
      { property: 'og:image', value: url },
      { name: 'twitter:image', value: url },
    ];

    metaTags.forEach((tag) => {
      let el = tag.property
        ? document.querySelector(`meta[property="${tag.property}"]`)
        : document.querySelector(`meta[name="${tag.name}"]`);

      if (!el) {
        el = document.createElement('meta');
        if (tag.property) el.setAttribute('property', tag.property);
        if (tag.name) el.setAttribute('name', tag.name);
        document.head.appendChild(el);
      }
      el.content = tag.value;
    });
  } else {
    img.style.display = 'none';
    placeholder.style.display = 'block';
    placeholder.innerText = 'Click to add Portrait URL';
    container.classList.add('editing'); // Show URL input if empty
  }
}

// --- CLASS SPECIFIC ELEMENTS ---

const classEmojiMap = {
  barbarian: '🪓',
  bard: '🎻',
  cleric: '🔯',
  druid: '🌿',
  fighter: '⚔️',
  monk: '🧘',
  paladin: '🔯',
  ranger: '🏹',
  rogue: '🗡️',
  sorcerer: '🔮',
  warlock: '👁️',
  artificer: '⚙️',
};

window.updateClassFeatures = function () {
  const clsInput = document.getElementById('class').value || '';
  const clsNormal = clsInput.toLowerCase();
  const variableBadges = document.querySelectorAll('.variable-class-badge');
  const allSpecifics = document.querySelectorAll('.class-specific');

  // 1. RESET: Clear all variable badges once before we start
  variableBadges.forEach((badge) => {
    badge.textContent = '';
    badge.removeAttribute('data-tip');
  });

  // 2. GLOBAL BADGES: Set the icons based on the Class Input text
  // We do this by checking which keys in our emoji map exist in the input string
  Object.keys(classEmojiMap).forEach((className) => {
    if (clsNormal.includes(className.toLowerCase())) {
      variableBadges.forEach((badge) => {
        badge.textContent += classEmojiMap[className];
        // Set the tip to the last matched class (or you can append them)
        badge.setAttribute('data-tip', className.charAt(0).toUpperCase() + className.slice(1));
      });
    }
  });

  // 3. PANEL VISIBILITY: Show/Hide the specific feature boxes
  allSpecifics.forEach((el) => {
    let isMatch = false;
    el.classList.forEach((c) => {
      if (c.startsWith('class-') && c !== 'class-specific') {
        const className = c.replace('class-', '');
        if (clsNormal.includes(className)) {
          isMatch = true;
        }
      }
    });

    if (isMatch) {
      el.classList.remove('hidden-class-feature');
    } else {
      el.classList.add('hidden-class-feature');
    }
  });
};

const CLASS_PROGRESSION = {
  // Full Casters (Bard, Cleric, Druid, Sorcerer, Wizard)
  fullCaster: {
    1: [2, 0, 0, 0, 0, 0, 0, 0, 0],
    2: [3, 0, 0, 0, 0, 0, 0, 0, 0],
    3: [4, 2, 0, 0, 0, 0, 0, 0, 0],
    4: [4, 3, 0, 0, 0, 0, 0, 0, 0],
    5: [4, 3, 2, 0, 0, 0, 0, 0, 0],
    6: [4, 3, 3, 0, 0, 0, 0, 0, 0],
    7: [4, 3, 3, 1, 0, 0, 0, 0, 0],
    8: [4, 3, 3, 2, 0, 0, 0, 0, 0],
    9: [4, 3, 3, 3, 1, 0, 0, 0, 0],
    10: [4, 3, 3, 3, 2, 0, 0, 0, 0],
    11: [4, 3, 3, 3, 2, 1, 0, 0, 0],
    12: [4, 3, 3, 3, 2, 1, 0, 0, 0],
    13: [4, 3, 3, 3, 2, 1, 1, 0, 0],
    14: [4, 3, 3, 3, 2, 1, 1, 0, 0],
    15: [4, 3, 3, 3, 2, 1, 1, 1, 0],
    16: [4, 3, 3, 3, 2, 1, 1, 1, 0],
    17: [4, 3, 3, 3, 2, 1, 1, 1, 1],
    18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
    19: [4, 3, 3, 3, 3, 2, 1, 1, 1],
    20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
  },
  // Half Casters (Paladin, Ranger) - Slots start at level 2
  halfCaster: {
    1: [2, 0, 0, 0, 0],
    2: [2, 0, 0, 0, 0],
    3: [3, 0, 0, 0, 0],
    4: [3, 0, 0, 0, 0],
    5: [4, 2, 0, 0, 0],
    6: [4, 2, 0, 0, 0],
    7: [4, 3, 0, 0, 0],
    8: [4, 3, 0, 0, 0],
    9: [4, 3, 2, 0, 0],
    10: [4, 3, 2, 0, 0],
    11: [4, 3, 3, 0, 0],
    12: [4, 3, 3, 1, 0],
    13: [4, 3, 3, 1, 0],
    17: [4, 3, 3, 3, 1],
  },
  // Warlock (Unique: All slots are the same level)
  warlock: { slots: { 1: 1, 2: 2, 11: 3, 17: 4 }, level: { 1: 1, 3: 2, 5: 3, 7: 4, 9: 5 } },
  // // Class Specific Non-Spell Resources
  // features: {
  //     barbarian: { rage: { 1:2, 3:3, 6:4, 12:5, 17:6, 20:99 } },
  //     monk: { ki: (lvl) => (lvl >= 2 ? lvl : 0) },
  //     artificer: { infusions: { 2:2, 6:3, 10:4, 14:5, 18:6 } },
  //     rogue: { sneak: (lvl) => Math.ceil(lvl / 2) + "d6" }
  // }
  rage: { 1: 2, 3: 3, 6: 4, 12: 5, 17: 6, 20: 99 },
  infusions: { 2: 2, 6: 3, 10: 4, 14: 5, 18: 6 },
};

function updateClassScaling() {
  const level = parseInt(document.getElementById('level')?.value) || 1;
  const className = document.getElementById('class')?.value.toLowerCase() || '';

  // Determine caster type
  let casterType = null;
  if (/(wizard|cleric|druid|sorcerer|bard)/.test(className)) casterType = 'fullCaster';
  else if (/(paladin|ranger|artificer)/.test(className)) casterType = 'halfCaster';
  else if (className.includes('warlock')) casterType = 'warlock';

  // 1. Handle Spell Slots
  const prog = casterType ? CLASS_PROGRESSION[casterType] : null;
  const slots = prog && prog[level] ? prog[level] : [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 1; i <= 9; i++) {
    const container = document.getElementById(`spell-level-${i}-slots`);
    if (!container) continue;
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    const allowed = slots[i - 1] || 0;

    checkboxes.forEach((cb, idx) => {
      if (idx >= allowed) {
        cb.style.opacity = '0.2';
        cb.disabled = true;
      } else {
        cb.style.opacity = '1';
        cb.disabled = false;
      }
    });
  }

  if (className === 'barbarian') {
    const rageLabel = document.querySelector('[data-tip="Rage"]');
    const maxRage =
      Object.entries(CLASS_PROGRESSION.rage)
        .reverse()
        .find(([lvl]) => level >= lvl)?.[1] || 2;
    if (rageLabel) rageLabel.textContent = `Rages (${maxRage === 99 ? '∞' : maxRage})`;
  }

  if (className === 'monk') {
    const kiInput = document.getElementById('ki-max');
    if (kiInput) kiInput.value = level; // 1 per level
  }
}
window.updateClassScaling = updateClassScaling;

// --- SUB-TAB SYSTEM ---
let SUB_TABS = { notes: [], backstory: [], equipment: [], people: [] };
let ACTIVE_SUB_TABS = { notes: null, backstory: null, equipment: null, people: null };

function initSubTabs(category, defaultContent = '') {
  // If no tabs exist, create Default
  if (!SUB_TABS[category] || SUB_TABS[category].length === 0) {
    const id = generateUUID();
    SUB_TABS[category] = [{ id: id, name: 'Main', content: defaultContent }];
    ACTIVE_SUB_TABS[category] = id;
  }
  // Ensure an active tab is set
  if (!ACTIVE_SUB_TABS[category] && SUB_TABS[category].length > 0) {
    ACTIVE_SUB_TABS[category] = SUB_TABS[category][0].id;
  }
  renderSubTabs(category);
}

function renderSubTabs(category) {
  const bar = document.getElementById(`tabs-${category}`);
  if (!bar) return;
  bar.innerHTML = '';

  SUB_TABS[category].forEach((tab, index) => {
    const btn = document.createElement('div');
    btn.className = `sub-tab-btn ${tab.id === ACTIVE_SUB_TABS[category] ? 'active' : ''}`;
    btn.draggable = true;
    btn.innerHTML = `<span onclick="switchSubTab('${category}', '${tab.id}')">${tab.name}</span>`;

    // Rename on double click
    btn.querySelector('span').ondblclick = (e) => {
      e.stopPropagation();
      const newName = prompt('Rename Tab:', tab.name);
      if (newName) {
        tab.name = newName;
        renderSubTabs(category);
        handleInput();
      }
    };

    // Delete button (prevent deleting the last tab)
    if (SUB_TABS[category].length > 1) {
      const close = document.createElement('span');
      close.className = 'sub-tab-close';
      close.innerHTML = '×';
      close.onclick = (e) => {
        e.stopPropagation();
        if (confirm(`Delete tab "${tab.name}"?`)) deleteSubTab(category, index);
      };
      btn.appendChild(close);
    }

    // Drag events
    btn.ondragstart = (e) => {
      e.dataTransfer.setData('text/plain', index);
      e.dataTransfer.effectAllowed = 'move';
      btn.classList.add('dragging');
    };
    btn.ondragover = (e) => {
      e.preventDefault();
    };
    btn.ondrop = (e) => {
      e.preventDefault();
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
      const toIdx = index;
      if (fromIdx !== toIdx) {
        const item = SUB_TABS[category].splice(fromIdx, 1)[0];
        SUB_TABS[category].splice(toIdx, 0, item);
        renderSubTabs(category);
        handleInput();
      }
    };
    btn.ondragend = () => {
      btn.classList.remove('dragging');
    };

    bar.appendChild(btn);
  });

  // Add "+" Button
  const addBtn = document.createElement('div');
  addBtn.className = 'sub-tab-btn sub-tab-add';
  addBtn.innerText = '+';
  addBtn.onclick = () => addSubTab(category);
  bar.appendChild(addBtn);
}

function switchSubTab(category, newId) {
  if (ACTIVE_SUB_TABS[category] === newId) return;

  // 1. Scrape current page to save state of the OLD tab
  scrapeSubTabPage(category);

  // 2. Set new active
  ACTIVE_SUB_TABS[category] = newId;

  // 3. Render
  renderSubTabs(category);
  loadSubTabPage(category);
}
window.switchSubTab = switchSubTab;

function addSubTab(category) {
  scrapeSubTabPage(category); // Save current work
  const name = prompt('New Tab Name:', 'New Tab');
  if (!name) return;

  const id = generateUUID();
  // Default content depends on type
  let content = category === 'equipment' || category === 'people' ? [] : '';

  SUB_TABS[category].push({ id: id, name: name, content: content });
  ACTIVE_SUB_TABS[category] = id;
  renderSubTabs(category);
  loadSubTabPage(category);
  handleInput();
}

function deleteSubTab(category, index) {
  const deletedId = SUB_TABS[category][index].id;
  SUB_TABS[category].splice(index, 1);

  // If we deleted the active tab, switch to the first one
  if (ACTIVE_SUB_TABS[category] === deletedId) {
    ACTIVE_SUB_TABS[category] = SUB_TABS[category][0].id;
  }
  renderSubTabs(category);
  loadSubTabPage(category);
  handleInput();
}

function scrapeSubTabPage(category) {
  const activeId = ACTIVE_SUB_TABS[category];
  if (!activeId) return;
  const tabObj = SUB_TABS[category].find((t) => t.id === activeId);
  if (!tabObj) return;

  if (category === 'notes') {
    tabObj.content = document.getElementById('notes').value;
  } else if (category === 'backstory') {
    tabObj.content = document.getElementById('backstory').value;
  } else if (category === 'equipment') {
    // Scrape Table
    const rows = [];
    document.querySelectorAll('#equipment-body tr').forEach((tr) => {
      const i = tr.querySelectorAll('input');
      rows.push({ name: i[0].value, qty: i[1].value, lbs: i[2].value, notes: i[3].value });
    });
    tabObj.content = rows;
  } else if (category === 'people') {
    // Scrape Table
    const rows = [];
    document.querySelectorAll('#people-body tr').forEach((tr) => {
      const i = tr.querySelectorAll('input');
      const note = tr.querySelector('textarea').value;
      rows.push({ name: i[0].value, desc: i[1].value, notes: note });
    });
    tabObj.content = rows;
  }
}

function loadSubTabPage(category) {
  const activeId = ACTIVE_SUB_TABS[category];
  const tabObj = SUB_TABS[category].find((t) => t.id === activeId);
  if (!tabObj) return;

  if (category === 'notes') {
    const el = document.getElementById('notes');
    el.value = tabObj.content || '';
    attachGhost(el); // Re-attach AI ghost
  } else if (category === 'backstory') {
    const el = document.getElementById('backstory');
    el.value = tabObj.content || '';
    attachGhost(el);
  } else if (category === 'equipment') {
    const tbody = document.getElementById('equipment-body');
    tbody.innerHTML = '';
    (tabObj.content || []).forEach((row) => window.addEquipmentRow(row));
    updateWeight();
  } else if (category === 'people') {
    const tbody = document.getElementById('people-body');
    tbody.innerHTML = '';
    (tabObj.content || []).forEach((row) => window.addPeopleRow(row));
  }
}

// --- GHOST INPUT LOGIC ---
function applyHighlights(text) {
  if (!AI_COMMENTS || Object.keys(AI_COMMENTS).length === 0 || !tipsEnabled) return text;
  const keys = Object.keys(AI_COMMENTS).sort((a, b) => b.length - a.length);
  const patternStr = keys
    .map((k) =>
      k
        .replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
        .replaceAll(/'s(\b)/g, "'?s")
        .replaceAll(/s(\b)/g, 's?'),
    )
    .join('|');
  const pattern = new RegExp(`\\b(${patternStr})\\b`, 'gi');
  let html = text.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]);
  return html.replace(
    pattern,
    (matched) => `<span class="highlight" data-tip="${matched.toLowerCase()}">${matched}</span>`,
  );
}

window.attachGhost = function (input) {
  if (input.classList.contains('ghost-input')) return; // Already attached

  // 1. Setup Wrapper & Mirror
  const wrapper = document.createElement('div');
  wrapper.className = 'ghost-container';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);
  input.classList.add('ghost-input');

  const mirror = document.createElement('div');
  mirror.className = 'ghost-mirror';
  wrapper.insertBefore(mirror, input);

  // 2. Sync Styles
  const style = window.getComputedStyle(input);
  mirror.style.fontFamily = style.fontFamily;
  mirror.style.fontSize = style.fontSize;
  mirror.style.lineHeight = style.lineHeight;
  mirror.style.padding = style.padding;
  mirror.style.border = style.border;
  mirror.style.letterSpacing = style.letterSpacing;

  // Handle different input types
  if (input.tagName === 'INPUT') {
    mirror.style.whiteSpace = 'pre';
    mirror.style.overflow = 'hidden';
  } else {
    mirror.style.whiteSpace = 'pre-wrap';
  }

  // 3. Logic Functions
  const updateGhost = () => {
    const text = input.value;
    const cursorIdx = input.selectionStart;

    let suggestion = '';
    const wordsBefore = text.slice(0, cursorIdx).split(/[\s\n]+/);
    const lastWord = wordsBefore[wordsBefore.length - 1];
    if (lastWord && lastWord.length >= 3) {
      const match = Object.keys(AI_COMMENTS).find((k) => k.toLowerCase().startsWith(lastWord.toLowerCase()));
      if (match) suggestion = match.slice(lastWord.length);
    }

    mirror.innerHTML =
      applyHighlights(text.slice(0, cursorIdx)) +
      `<span class="suggestion">${suggestion}</span>` +
      applyHighlights(text.slice(cursorIdx));
    mirror.scrollTop = input.scrollTop;
    mirror.scrollLeft = input.scrollLeft;
  };

  // 4. Listeners
  input.addEventListener('input', updateGhost);
  input.addEventListener('scroll', () => {
    mirror.scrollTop = input.scrollTop;
    mirror.scrollLeft = input.scrollLeft;
  });
  input.addEventListener('click', updateGhost);
  input.addEventListener('keyup', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'End', 'Home'].includes(e.key)) updateGhost();
  });
  input.addEventListener('mouseleave', () => {
    if (lastTipKey !== '') {
      lastTipKey = '';
      hideTip();
    }
  });

  // Tab Completion
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      const cursorIdx = input.selectionStart;
      const wordsBefore = input.value.slice(0, cursorIdx).split(/[\s\n]+/);
      const lastWord = wordsBefore[wordsBefore.length - 1];
      if (lastWord && lastWord.length >= 3) {
        const match = Object.keys(AI_COMMENTS).find((k) => k.toLowerCase().startsWith(lastWord.toLowerCase()));
        if (match) {
          e.preventDefault();
          const start = cursorIdx - lastWord.length;
          const newValue = input.value.slice(0, start) + match + input.value.slice(cursorIdx);
          input.value = newValue;
          input.selectionStart = input.selectionEnd = start + match.length;
          updateGhost();
          handleInput({ target: input }); // Trigger autosave
        }
      }
    }
  });

  // Peek Tooltip
  let lastTipKey = '';
  input.addEventListener('mousemove', (e) => {
    input.style.pointerEvents = 'none';
    const under = document.elementFromPoint(e.clientX, e.clientY);
    input.style.pointerEvents = 'auto';

    if (under && under.classList.contains('highlight')) {
      const tipKey = under.dataset.tip;
      if (tipKey !== lastTipKey) {
        const match = getMatch(tipKey);
        if (match) {
          lastTipKey = tipKey;
          currentTarget = under;
          showTip(e, match.text, match.title);
        }
      } else {
        moveTip(e);
      }
    } else {
      if (lastTipKey !== '') {
        lastTipKey = '';
        hideTip();
      }
    }
  });
};

function initGhosts() {
  // Static textareas
  const ids = [
    'prof-weapons-text',
    'prof-tools-text',
    'class-features',
    'background-features',
    'species-traits',
    'feats',
    'appearance',
    'backstory',
    'equipment',
    'languages',
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) attachGhost(el);
  });
}

// --- SHARED UTILS ---
const CONDITIONS_LIST = [
  'Blinded',
  'Charmed',
  'Deafened',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
];

function generateStatusTracker() {
  const container = document.getElementById('status-container');
  if (!container) return;

  let html = '';
  CONDITIONS_LIST.forEach((cond) => {
    const id = `cond-${cond.toLowerCase()}`;
    html += `
                <label class="status-row" data-tip="${cond}"> <input type="checkbox" id="${id}">
                    <span>${cond}</span>
                </label>`;
  });
  container.innerHTML = html;

  // Add listeners for autosave
  container.querySelectorAll('input').forEach((cb) => {
    cb.addEventListener('change', handleInput);
  });
}

function evaluateMathInput(e) {
  const input = e.target;
  let val = input.value.trim();

  // Allow empty
  if (val === '') return;

  // Check if it's a math expression (contains +, -, *, /)
  // We allow standard math, or relative math (e.g. "+5" adds to current, "-5" subtracts)

  // If user typed "-5", they might mean "Subtract 5 from previous"
  // BUT since we are on the input itself, the "previous" value is lost unless we track it
  // OR we assume they typed "CurrentValue - 5".
  // Better UX: The user types "35-5" (explicit) or just "-5" (relative).

  try {
    // Regex to check for simple math
    if (/^[\d\s\.\+\-\*\/]+$/.test(val)) {
      // Safe eval using Function constructor restricted to math
      // If it starts with operator, prepending isn't easy without state.
      // SIMPLEST VERSION: Just eval what is there. User types "40-5" -> "35".

      const result = new Function('return ' + val)();
      if (isFinite(result)) {
        input.value = Math.floor(result); // HP is usually integer
        // Trigger save if value changed
        handleInput({ target: input });
      }
    }
  } catch (err) {
    // If invalid math, do nothing, leave text as is (or revert? leave as is so user can fix)
    console.log('Math parsing error', err);
  }
}

async function loadSharedCharacter(sharedId) {
  isLoading = true;
  document.getElementById('status').innerText = 'Loading Shared...';

  try {
    let targetData = null;
    let finalId = sharedId;

    // 1. Try direct lookup (Full ID)
    const docRef = doc(db, 'characters', sharedId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      targetData = docSnap.data();
    } else if (sharedId.length === 8) {
      // 2. Prefix search for Short ID
      const q = query(
        collection(db, 'characters'),
        where('__name__', '>=', sharedId),
        where('__name__', '<', sharedId + '\uf8ff'),
        limit(1),
      );
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        targetData = querySnap.docs[0].data();
        finalId = querySnap.docs[0].id;
      }
    }

    if (targetData) {
      currentCharacterId = finalId;
      localStorage.setItem('dnd_char_id', currentCharacterId);
      populateData(targetData.sheetData);
      if (targetData.sheetData['portrait-url']) updatePortraitFromURL(targetData.sheetData['portrait-url']);

      if (currentUser && targetData.ownerId === currentUser.uid) {
        isCloudOwner = true;
        setupRealtimeListener();
        document.getElementById('status').innerText = 'Online (Owner)';
      } else {
        // If not owner, just stop here. No listener = No "Access Control" error.
        isCloudOwner = false;
        document.getElementById('status').innerText = 'Read Only Mode';
      }
    } else {
      alert('Character not found.');
    }
  } catch (e) {
    console.error('Shared load failed:', e);
  } finally {
    isLoading = false;
    updateModifiers();
    updateDuplicateVis();
  }
}

async function updateSnapshotSelect() {
  if (!currentUser) return;
  const snapshotsCol = collection(db, 'characters', currentCharacterId, 'snapshots');
  try {
    const snapDocs = await getDocs(snapshotsCol);
    const select = document.getElementById('versionSelect');
    select.innerHTML = '<option value="">Load Version...</option>';
    snapDocs.forEach((d) => {
      const data = d.data();
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.text = `${data.name} (${new Date(data.createdAt).toLocaleDateString()})`;
      select.appendChild(opt);
    });
  } catch (e) {
    console.error('Snapshot load error:', e);
  }
}

function collectData() {
  ['notes', 'backstory', 'equipment', 'people'].forEach((cat) => scrapeSubTabPage(cat));
  const data = { charName: document.getElementById('charName').value };
  document.querySelectorAll('input[id]:not([type="file"]), textarea[id], select[id]').forEach((el) => {
    data[el.id] = el.type === 'checkbox' ? el.checked : el.value;
  });
  data.sub_tabs = SUB_TABS;
  data.active_sub_tabs = ACTIVE_SUB_TABS;
  data['weapons'] = [];
  document.querySelectorAll('#weapons-body tr').forEach((tr) => {
    // Select inputs AND selects to get the dropdown value
    const i = tr.querySelectorAll('input, select');
    // Map indices: 0=Name, 1=Cost, 2=Atk, 3=Dmg, 4=Notes
    data['weapons'].push({ name: i[0].value, cost: i[1].value, atk: i[2].value, dmg: i[3].value, notes: i[4].value });
  });
  data.wild_shapes = [];
  document.querySelectorAll('#wild-shape-body tr').forEach((tr) => {
    const i = tr.querySelectorAll('input');
    data.wild_shapes.push({
      name: i[0].value,
      cr: i[1].value,
      hp: i[2].value,
      ac: i[3].value,
      spd: i[4].value,
      notes: i[5].value,
    });
  });

  data.invocations = [];
  document.querySelectorAll('#invocations-body tr').forEach((tr) => {
    const i = tr.querySelectorAll('input');
    data.invocations.push({ name: i[0].value, desc: i[1].value });
  });
  data.magic_items = Array.from(document.querySelectorAll('#magic-items-body tr')).map((tr) => {
    const inputs = tr.querySelectorAll('input');
    return {
      created: inputs[0].checked, // First checkbox
      name: inputs[1].value, // Text input
      attunement: inputs[2].checked, // Second checkbox
      notes: inputs[3].value, // Text input
    };
  });
  data['equipment_table'] = [];
  document.querySelectorAll('#equipment-body tr').forEach((tr) => {
    const inputs = tr.querySelectorAll('input');
    data['equipment_table'].push({
      name: inputs[0].value,
      qty: inputs[1].value,
      lbs: inputs[2].value,
      notes: inputs[3].value,
    });
  });
  data['people_table'] = [];
  document.querySelectorAll('#people-body tr').forEach((tr) => {
    const inputs = tr.querySelectorAll('input');
    const people_notes = tr.querySelector('textarea').value;
    data['people_table'].push({ name: inputs[0].value, desc: inputs[1].value, notes: people_notes });
  });
  data['spells'] = [];
  document.querySelectorAll('#spells-body tr').forEach((tr) => {
    const i = tr.querySelectorAll('input');
    data['spells'].push({
      lvl: i[0].value,
      name: i[1].value,
      conc: i[2].checked,
      rit: i[3].checked,
      mat: i[4].checked,
    });
  });
  data['spellSlots'] = {};
  document.querySelectorAll('.spell-slots-grid input[type="checkbox"]').forEach((cb) => {
    data['spellSlots'][cb.id] = cb.checked;
  });
  return data;
}

function populateData(data) {
  if (!data) return;
  isAppReady = false;

  try {
    for (const [key, value] of Object.entries(data)) {
      if (['spellSlots', 'weapons', 'spells', 'equipment', 'magic_items', 'portrait-upload'].includes(key)) continue;
      const el = document.getElementById(key);
      if (el) {
        if (el.type === 'checkbox') el.checked = value;
        else el.value = value;
      }
    }

    if (data.sub_tabs) {
      SUB_TABS = data.sub_tabs;
      ACTIVE_SUB_TABS = data.active_sub_tabs || {};
    } else {
      SUB_TABS = { notes: [], backstory: [], equipment: [], people: [] };
      ACTIVE_SUB_TABS = {};

      // Notes
      const oldNotes = data.notes || '';
      SUB_TABS.notes.push({ id: generateUUID(), name: 'Main', content: oldNotes });

      // Backstory
      const oldStory = data.backstory || '';
      SUB_TABS.backstory.push({ id: generateUUID(), name: 'Main', content: oldStory });

      // Equipment (Complex migration)
      let oldEquip = [];
      if (data.equipment_table) oldEquip = data.equipment_table;
      else if (data.equipment) oldEquip = [{ name: data.equipment, qty: 1, lbs: 0, notes: 'Imported' }];
      SUB_TABS.equipment.push({ id: generateUUID(), name: 'Main', content: oldEquip });

      // People
      const oldPeople = data.people_table || [];
      SUB_TABS.people.push({ id: generateUUID(), name: 'Main', content: oldPeople });
    }

    ['notes', 'backstory', 'equipment', 'people'].forEach((cat) => {
      // Ensure active ID is valid
      if (!ACTIVE_SUB_TABS[cat] || !SUB_TABS[cat].find((t) => t.id === ACTIVE_SUB_TABS[cat])) {
        if (SUB_TABS[cat].length > 0) ACTIVE_SUB_TABS[cat] = SUB_TABS[cat][0].id;
      }
      initSubTabs(cat);
      loadSubTabPage(cat);
    });

    if (data.weapons) {
      document.getElementById('weapons-body').innerHTML = '';
      data.weapons.forEach((r) => {
        if (!r.cost) r.cost = 'A';
        window.addWeaponRow(r);
      });
    }
    if (data.wild_shapes) {
      document.getElementById('wild-shape-body').innerHTML = '';
      data.wild_shapes.forEach((r) => window.addWildShapeRow(r));
    }
    if (data.invocations) {
      document.getElementById('invocations-body').innerHTML = '';
      data.invocations.forEach((r) => window.addInvocationRow(r));
    }
    if (data.magic_items) {
      document.getElementById('magic-items-body').innerHTML = '';
      data.magic_items.forEach((item) => window.addMagicItemRow(item));
    }
    if (data.spells) {
      document.getElementById('spells-body').innerHTML = '';
      for (let i = 0; i < Math.max(15, data.spells.length); i++) window.addSpellRow();
      const rows = document.querySelectorAll('#spells-body tr');
      data.spells.forEach((r, i) => {
        if (rows[i]) {
          let inputs = rows[i].querySelectorAll('input');
          inputs[0].value = r.lvl;
          inputs[1].value = r.name;
          inputs[2].checked = r.conc;
          inputs[3].checked = r.rit;
          inputs[4].checked = r.mat;
        }
      });
    }
    if (data.spellSlots) {
      for (const [slotId, checked] of Object.entries(data.spellSlots)) {
        const el = document.getElementById(slotId);
        if (el) el.checked = checked;
      }
    }
    if (data.portraitUrl) {
      updatePortraitFromURL(data.portraitUrl);
    }
    // Trigger an input event on all ghost inputs to update mirrors
    document.querySelectorAll('.ghost-input').forEach((el) => el.dispatchEvent(new Event('input')));
    updateModifiers();
    updatePageTitle();
    updateWeight();
    window.updateClassFeatures();
    updateClassScaling();

    isAppReady = true;
  } catch (err) {
    console.error('CRITICAL ERROR LOADING DATA:', err);
    alert(
      'There was an error loading your character data. Automatic saving has been disabled to prevent data loss. Please refresh the page or check the console.',
    );
    isAppReady = false; // Prevent saving
  }
}

function updateModifiers() {
  const stats = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
  const profBonus = parseInt(document.getElementById('prof-bonus').value) || 0;

  const fmt = (val) => (val >= 0 ? '+' : '') + val;

  stats.forEach((stat) => {
    const modEl = document.getElementById(`${stat}-mod`);
    const scoreEl = document.getElementById(`${stat}-score`);
    if (scoreEl && modEl) {
      const score = parseInt(scoreEl.value);
      if (isNaN(score)) {
        modEl.value = '';
      } else {
        const mod = Math.floor((score - 10) / 2);
        modEl.value = fmt(mod);

        const saveProf = document.getElementById(`save-prof-${stat}`).checked;
        const saveVal = document.getElementById(`save-val-${stat}`);
        const totalSave = mod + (saveProf ? profBonus : 0);
        saveVal.value = fmt(totalSave);

        document.querySelectorAll(`[id^="val-${stat}-"]`).forEach((skillInput) => {
          const skillId = skillInput.id.replace('val-', 'prof-');
          const isProficient = document.getElementById(skillId).checked;
          const totalSkill = mod + (isProficient ? profBonus : 0);
          skillInput.value = fmt(totalSkill);
        });
      }
    }
  });

  const selectedStat = document.getElementById('spell-ability').value;
  if (selectedStat) {
    const scoreEl = document.getElementById(`${selectedStat}-score`);
    const mod = Math.floor((parseInt(scoreEl.value || 10) - 10) / 2);
    const other_mod = parseInt(document.getElementById('other-mod').value || '0');
    document.getElementById('spell-mod').value = fmt(mod);
    document.getElementById('spell-save-dc').value = 8 + profBonus + mod;
    document.getElementById('spell-atk').value = fmt(profBonus + mod + other_mod);
  }

  // Task 4: Auto-calculate Passive Perception
  // Logic: 10 + Wis Mod + (ProfBonus if proficient in Perception)
  const wisScore = parseInt(document.getElementById('wisdom-score').value) || 10;
  const wisMod = Math.floor((wisScore - 10) / 2);
  const isPercProf = document.getElementById('prof-wisdom-perception')?.checked || false;

  const passPercEl = document.getElementById('pass-perc');
  if (passPercEl) {
    passPercEl.value = 10 + wisMod + (isPercProf ? profBonus : 0);
  }
}

function handleInput(e) {
  const targetId = e?.target?.id || '';
  const targetType = e?.target?.type || '';

  if (targetId === 'class') {
    window.updateClassFeatures();
  }

  if (targetId === 'class' || targetId === 'level') {
    updateClassScaling();
  }

  if (
    targetId.endsWith('-score') ||
    targetId === 'prof-bonus' ||
    targetType === 'checkbox' ||
    targetId === 'spell-ability'
  ) {
    updateModifiers();
  }

  const charName = document.getElementById('char-name')?.value.trim();
  if (!isLoading && isAppReady && charName !== '') {
    hasUnsavedChanges = true;
    lastLocalChangeTimestamp = Date.now();

    // 1. Visual Feedback immediately
    const statusEl = document.getElementById('status');
    if (statusEl) {
      statusEl.innerText = 'Unsaved Changes...';
      statusEl.style.color = '#ff6b6b'; // Red warning color
    }

    // 2. Faster Debounce (2000ms -> 1000ms or 500ms)
    debounce(() => window.saveVersion(false), 1000)();
  }
}

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

function generateUUID() {
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16),
  );
}
function updatePageTitle() {
  const name = document.getElementById('charName').value;
  if (name) document.title = name + ' - 5e';
}

window.shareSheet = async function () {
  if (!currentUser) {
    alert('Login required.');
    return;
  }
  await window.saveVersion(false);
  const shareUrl = `${window.location.origin}${window.location.pathname}?charId=${currentCharacterId}`;
  try {
    await navigator.clipboard.writeText(shareUrl);
    alert('Link copied!');
  } catch (err) {
    prompt('Copy:', shareUrl);
  }
};

window.copyCharId = async function () {
  try {
    await navigator.clipboard.writeText(currentCharacterId);
    alert('Character ID copied!');
  } catch (err) {
    prompt('Copy ID:', currentCharacterId);
  }
};

window.duplicateCharacter = async function () {
  if (!currentUser) return alert('Login required.');
  if (!confirm('Duplicate this character to your account?')) return;

  const data = collectData();
  const newId = generateUUID();
  const nowIso = new Date().toISOString();

  try {
    await setDoc(doc(db, 'characters', newId), { ownerId: currentUser.uid, lastUpdated: nowIso, sheetData: data });
    localStorage.setItem('dnd_char_id', newId);
    window.location.href = `${window.location.pathname}?charId=${newId}`;
  } catch (e) {
    console.error('Duplication failed', e);
    alert('Error duplicating: ' + e.message);
  }
};

window.printCard = function () {
  // 1. Get the current character ID from the URL or local storage
  const urlParams = new URLSearchParams(window.location.search);
  const charId = urlParams.get('charId') || localStorage.getItem('dnd_char_id');

  if (!charId) {
    alert('No character loaded to print!');
    return;
  }

  // 2. Create a hidden iframe
  let printFrame = document.getElementById('print-iframe');
  if (!printFrame) {
    printFrame = document.createElement('iframe');
    printFrame.id = 'print-iframe';
    printFrame.style.display = 'none';
    document.body.appendChild(printFrame);
  }

  printFrame.src = `card.html?charId=${charId}`;

  printFrame.onload = function () {
    // Short delay to ensure Firebase data inside the iframe is populated
    setTimeout(() => {
      printFrame.contentWindow.focus();
      printFrame.contentWindow.print();
    }, 1000); // 1 second buffer for data fetching
  };
};

window.downloadJSON = function () {
  const data = collectData();
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.charName || 'character'}_5e_data.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

document.getElementById('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (!currentUser) return alert('Please login to create a new character from upload.');
  if (!confirm('Create a NEW character from this file?')) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const data = JSON.parse(event.target.result);
      const newId = generateUUID();
      await setDoc(doc(db, 'characters', newId), {
        ownerId: currentUser.uid,
        lastUpdated: new Date().toISOString(),
        sheetData: data,
      });
      localStorage.setItem('dnd_char_id', newId);
      window.location.href = `${window.location.pathname}?charId=${newId}`;
    } catch (err) {
      console.error('Import failed', err);
      alert('Error parsing JSON: ' + err.message);
    }
  };
  reader.readAsText(file);
  // Reset input so same file can be selected again if needed
  e.target.value = '';
});

function updateDuplicateVis() {
  const btn = document.getElementById('btn-duplicate');
  if (btn) btn.style.display = currentUser && !isCloudOwner ? 'inline-block' : 'none';
}

window.addWeaponRow = (item = null) => {
  const tbody = document.getElementById('weapons-body');
  const tr = document.createElement('tr');
  tr.draggable = true;
  tr.addEventListener('dragstart', handleDragStart);
  tr.addEventListener('dragover', handleDragOver);
  tr.addEventListener('drop', handleDrop);
  tr.addEventListener('dragend', handleDragEnd);

  tr.innerHTML = `
                <td><input type="text" value="${item ? item.name : ''}" placeholder="Action/Weapon"></td>
                <td>
                    <select class="cost-select" title="Action Cost">
                        <option value="A" ${item && item.cost === 'A' ? 'selected' : ''}>A</option>
                        <option value="BA" ${item && item.cost === 'BA' ? 'selected' : ''}>BA</option>
                        <option value="R" ${item && item.cost === 'R' ? 'selected' : ''}>R</option>
                        <option value="-" ${item && item.cost === '-' ? 'selected' : ''}>-</option>
                    </select>
                </td>
                <td><input type="text" value="${item ? item.atk : ''}" placeholder="+0"></td>
                <td><input type="text" value="${item ? item.dmg : ''}" placeholder="1d6"></td>
                <td><input type="text" value="${item ? item.notes : ''}" placeholder="Notes"></td>
                <td class="action-cell"><button class="drag-handle" title="Drag to reorder">☰</button><button class="remove-btn" tabindex="-1">-</button></td>`;

  tbody.appendChild(tr);

  // Select both INPUT and SELECT for autosave listeners
  const inputs = tr.querySelectorAll('input, select');
  inputs.forEach((i) => i.addEventListener('input', handleInput));

  tr.querySelector('.remove-btn').onclick = () => {
    if (confirm('Remove this action?')) {
      tr.remove();
      handleInput({ target: document.body });
    }
  };

  // Update Ghost attachments (Indices shifted by 1 due to new column)
  attachGhost(inputs[0]); // Name
  attachGhost(inputs[4]); // Notes (Was previously index 3)
};

window.addWildShapeRow = (item = null) => {
  const tbody = document.getElementById('wild-shape-body');
  const tr = document.createElement('tr');
  tr.innerHTML = `
                <td><input type="text" value="${item ? item.name : ''}"></td>
                <td><input type="text" value="${item ? item.cr : ''}" style="text-align:center"></td>
                <td><input type="text" value="${item ? item.hp : ''}" style="text-align:center"></td>
                <td><input type="text" value="${item ? item.ac : ''}" style="text-align:center"></td>
                <td><input type="text" value="${item ? item.spd : ''}" style="text-align:center"></td>
                <td><input type="text" value="${item ? item.notes : ''}"></td>
                <td class="action-cell"><button onclick="this.parentElement.parentElement.remove(); handleInput();" class="remove-btn">-</button></td>`;
  tbody.appendChild(tr);
  tr.querySelectorAll('input').forEach((i) => i.addEventListener('input', handleInput));
};

window.addInvocationRow = (item = null) => {
  const tbody = document.getElementById('invocations-body');
  const tr = document.createElement('tr');
  tr.innerHTML = `
                <td><input type="text" value="${item ? item.name : ''}"></td>
                <td><input type="text" value="${item ? item.desc : ''}"></td>
                <td class="action-cell"><button onclick="this.parentElement.parentElement.remove(); handleInput();" class="remove-btn">-</button></td>`;
  tbody.appendChild(tr);
  tr.querySelectorAll('input').forEach((i) => i.addEventListener('input', handleInput));
};

window.addSpellRow = () => {
  const tbody = document.getElementById('spells-body');
  const tr = document.createElement('tr');
  tr.draggable = true;
  tr.addEventListener('dragstart', handleDragStart);
  tr.addEventListener('dragover', handleDragOver);
  tr.addEventListener('drop', handleDrop);
  tr.addEventListener('dragend', handleDragEnd);
  tr.innerHTML = `
                <td><input type="text" style="width:25px; text-align:center;"></td>
                <td><input type="text"></td>
                <td style="white-space: nowrap; text-align: center;">
                    <input type="checkbox" class="diamond-check">
                    <input type="checkbox" class="diamond-check">
                    <input type="checkbox" class="diamond-check">
                    <input type="checkbox" class="diamond-check">
                    <input type="checkbox" class="diamond-check">
                </td>
                <td class="action-cell"><button class="drag-handle" title="Drag to reorder">☰</button><button class="remove-btn" tabindex="-1">-</button></td>`;

  tbody.appendChild(tr);
  const inputs = tr.querySelectorAll('input');
  inputs.forEach((i) => i.addEventListener('input', handleInput));

  // Logic for removal
  tr.querySelector('.remove-btn').onclick = () => {
    if (confirm('Remove this spell?')) {
      tr.remove();
      handleInput({ target: document.body }); // Trigger autosave
    }
  };

  attachGhost(inputs[1]); // Spell Name
};

window.addMagicItemRow = (item = null) => {
  const tbody = document.getElementById('magic-items-body');
  const tr = document.createElement('tr');
  tr.draggable = true;
  tr.addEventListener('dragstart', handleDragStart);
  tr.addEventListener('dragover', handleDragOver);
  tr.addEventListener('drop', handleDrop);
  tr.addEventListener('dragend', handleDragEnd);
  tr.innerHTML = `
                <td style="text-align: center;">
                    <input type="checkbox" ${item?.created ? 'checked' : ''} style="width: auto;">
                </td>
                <td><input type="text" value="${item ? item.name : ''}" placeholder="Item name..."></td>
                <td style="text-align: center;">
                    <input type="checkbox" ${item?.attunement ? 'checked' : ''} style="width: auto;">
                </td>
                <td><input type="text" value="${item ? item.notes : ''}" placeholder="Details..."></td>
                <td class="action-cell"><button class="drag-handle" title="Drag to reorder">☰</button><button onclick="this.parentElement.parentElement.remove(); handleInput();" class="remove-btn">-</button></td>
            `;

  tbody.appendChild(tr);
  // Ensure both text inputs and checkboxes trigger a save
  tr.querySelectorAll('input').forEach((el) => el.addEventListener('input', () => handleInput()));
};

window.addEquipmentRow = (item = null) => {
  const tbody = document.getElementById('equipment-body');
  const tr = document.createElement('tr');
  tr.draggable = true;
  tr.addEventListener('dragstart', handleDragStart);
  tr.addEventListener('dragover', handleDragOver);
  tr.addEventListener('drop', handleDrop);
  tr.addEventListener('dragend', handleDragEnd);
  tr.innerHTML = `
                <td><input type="text" value="${item ? item.name : ''}"></td>
                <td><input type="number" value="${item ? item.qty : 1}" style="text-align:center;"></td>
                <td><input type="number" value="${item ? item.lbs : 0}" style="text-align:center;"></td>
                <td><input type="text" value="${item ? item.notes : ''}"></td>
                <td class="action-cell">
                    <button class="move-btn" onclick="moveRowToTab(this, 'equipment')" title="Move to another tab">➡</button>
                    <button class="drag-handle" title="Drag to reorder">☰</button>
                    <button onclick="this.parentElement.parentElement.remove(); updateWeight();" class="remove-btn">-</button>
                </td>
            `;
  tbody.appendChild(tr);
  tr.querySelectorAll('input').forEach((i) => i.addEventListener('input', updateWeight));
  updateWeight();
};

window.addPeopleRow = (item = null) => {
  const tbody = document.getElementById('people-body');
  const tr = document.createElement('tr');
  tr.draggable = true;
  tr.addEventListener('dragstart', handleDragStart);
  tr.addEventListener('dragover', handleDragOver);
  tr.addEventListener('drop', handleDrop);
  tr.addEventListener('dragend', handleDragEnd);
  tr.innerHTML = `
                <td><input type="text" value="${item ? item.name : ''}"></td>
                <td><input type="text" value="${item ? item.desc : ''}"></td>
                <td><textarea style="height:4lh;">${item ? item.notes : ''}</textarea></td>
                <td class="action-cell">
                    <button class="move-btn" onclick="moveRowToTab(this, 'people')" title="Move to another tab">➡</button>
                    <button class="drag-handle" title="Drag to reorder">☰</button>
                    <button onclick="this.parentElement.parentElement.remove(); updateWeight();" class="remove-btn">-</button>
                </td>
            `;
  tbody.appendChild(tr);
  tr.querySelectorAll('input, textarea').forEach((i) => i.addEventListener('input', updateWeight));
  updateWeight();
};

window.moveRowToTab = function (btn, category) {
  const tr = btn.closest('tr');
  const inputs = tr.querySelectorAll('input, textarea');
  let rowData =
    category === 'equipment'
      ? { name: inputs[0].value, qty: inputs[1].value, lbs: inputs[2].value, notes: inputs[3].value }
      : { name: inputs[0].value, desc: inputs[1].value, notes: inputs[2].value };

  const overlay = document.getElementById('move-modal-overlay');
  const container = document.getElementById('tab-choices');
  container.innerHTML = ''; // Clear old buttons

  // 1. Create "New Tab" button
  const newBtn = document.createElement('button');
  newBtn.className = 'tab-choice-btn new-tab-btn';
  newBtn.innerText = '＋ Create New Tab';
  newBtn.onclick = () => {
    const name = prompt('Enter name for new tab:');
    if (name) finalizeMove(rowData, tr, category, name);
  };
  container.appendChild(newBtn);

  // 2. Create buttons for existing tabs
  const currentTabId = ACTIVE_SUB_TABS[category];
  SUB_TABS[category].forEach((tab) => {
    if (tab.id === currentTabId) return; // Skip current

    const b = document.createElement('button');
    b.className = 'tab-choice-btn';
    b.innerText = `📁 ${tab.name}`;
    b.onclick = () => finalizeMove(rowData, tr, category, tab.name);
    container.appendChild(b);
  });

  overlay.style.display = 'flex';
};

function finalizeMove(rowData, tr, category, targetName) {
  document.getElementById('move-modal-overlay').style.display = 'none';

  let targetTab = SUB_TABS[category].find((t) => t.name.toLowerCase() === targetName.trim().toLowerCase());

  if (!targetTab) {
    targetTab = { id: generateUUID(), name: targetName.trim(), content: [] };
    SUB_TABS[category].push(targetTab);
    renderSubTabs(category);
  }

  if (!Array.isArray(targetTab.content)) targetTab.content = [];
  targetTab.content.push(rowData);

  tr.remove();
  if (category === 'equipment') updateWeight();
  scrapeSubTabPage(category);
  handleInput({ target: document.body });
}

// --- Drag and Drop Logic ---
let dragSrcEl = null;

function handleDragStart(e) {
  dragSrcEl = this;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.innerHTML);
  this.classList.add('dragging');
}

function handleDragOver(e) {
  if (e.preventDefault) e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDrop(e) {
  if (e.stopPropagation) e.stopPropagation();

  if (dragSrcEl !== this && dragSrcEl.parentNode === this.parentNode) {
    // Determine if dragging up or down
    const allRows = Array.from(this.parentNode.children);
    const dragIdx = allRows.indexOf(dragSrcEl);
    const dropIdx = allRows.indexOf(this);

    if (dragIdx < dropIdx) {
      this.parentNode.insertBefore(dragSrcEl, this.nextSibling);
    } else {
      this.parentNode.insertBefore(dragSrcEl, this);
    }
    handleInput(); // Trigger your existing save logic
  }
  return false;
}

function handleDragEnd() {
  this.classList.remove('dragging');
}

function updateWeight() {
  let total = 0;
  // Sum rows
  document.querySelectorAll('#equipment-body tr').forEach((tr) => {
    const inputs = tr.querySelectorAll('input');
    const qty = parseFloat(inputs[1].value) || 0;
    const lbs = parseFloat(inputs[2].value) || 0;
    total += qty * lbs;
  });
  // Sum coins (50 coins = 1 lb)
  const coinIds = ['cp', 'sp', 'ep', 'gp', 'pp'];
  let coinCount = 0;
  coinIds.forEach((id) => {
    coinCount += parseInt(document.getElementById(id).value) || 0;
  });
  total += coinCount / 50;

  document.getElementById('total-weight').innerText = total.toFixed(1);
  handleInput({ target: document.body }); // Trigger auto-save
}

window.resetSheet = function () {
  if (!confirm('Create and switch to a NEW character?')) return;

  // Clear the local ID so the initialization logic generates a new one
  localStorage.removeItem('dnd_char_id');

  // Redirect to the base URL (removing ?charId=...)
  window.location.href = window.location.origin + window.location.pathname;
};

// --- TAB SCROLL AND SWITCH ---
const tabsWrapper = document.getElementById('tabs-wrapper');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabIds = ['main-page', 'spells-page', 'items-page', 'equip-page'];

window.switchTab = function (tabId) {
  // Click-to-tab logic
  const target = document.getElementById(tabId);
  target.scrollIntoView({ behavior: 'smooth' });
};

const observerOptions = {
  root: null,
  rootMargin: '-40% 0px -60% 0px', // Detects when section is in the middle-ish area
  threshold: 0,
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      const id = entry.target.getAttribute('id');

      // Update Buttons
      document.querySelectorAll('.tab-btn').forEach((btn) => {
        // Check if the button's onclick contains the ID
        if (btn.getAttribute('onclick').includes(id)) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }
  });
}, observerOptions);

// Start observing all tab sections
document.querySelectorAll('.tab-content').forEach((section) => {
  observer.observe(section);
});

function generateStaticContent() {
  const abilityData = {
    Strength: ['Athletics'],
    Dexterity: ['Acrobatics', 'Sleight of Hand', 'Stealth'],
    Constitution: [],
    Intelligence: ['Arcana', 'History', 'Investigation', 'Nature', 'Religion'],
    Wisdom: ['Animal Handling', 'Insight', 'Medicine', 'Perception', 'Survival'],
    Charisma: ['Deception', 'Intimidation', 'Performance', 'Persuasion'],
  };
  const abilitiesContainer = document.getElementById('ability-scores-container');
  if (abilitiesContainer) {
    let html = '';
    for (const [stat, skills] of Object.entries(abilityData)) {
      const lowStat = stat.toLowerCase();
      let skillsHtml = '';
      skills.forEach((skill) => {
        const skillId = skill.replace(/\s+/g, '-').toLowerCase();
        skillsHtml += `<div class="skill-row"><input type="text" class="save-val-input" id="val-${lowStat}-${skillId}" placeholder="+0" readonly><input type="checkbox" class="prof-bubble" id="prof-${lowStat}-${skillId}"><span>${skill}</span></div>`;
      });
      html += `
                    <div class="ability-box">
                    <span class="box-title" data-tip="${stat}" tabindex="0">${stat}</span>
                    <div class="ability-visual-container">
                        <input type="text" id="${lowStat}-mod" class="ability-mod" placeholder="+0" readonly tabindex="-1">
                        <input type="number" id="${lowStat}-score" class="ability-score" placeholder="10">
                    </div>
                    <div class="skills-list">
                        <div class="skill-row" style="font-weight: bold; border-bottom: 2px solid #ccc;">
                            <input type="text" class="save-val-input" id="save-val-${lowStat}" placeholder="+0" readonly>
                            <input type="checkbox" class="prof-bubble" id="save-prof-${lowStat}">
                            <span data-tip="Saving Throw">Saving Throw</span>
                        </div>
                        ${skillsHtml}
                    </div>
                </div>`;
    }
    abilitiesContainer.innerHTML = html;
  }
  const slotContainer = document.getElementById('spell-slots-container');
  if (slotContainer) {
    const slotCounts = [0, 4, 3, 3, 3, 3, 2, 2, 1, 1];
    let html = '';
    for (let i = 1; i <= 9; i++) {
      html += `<div id="spell-level-${i}-slots">${i}${i === 1 ? 'st' : i === 2 ? 'nd' : i === 3 ? 'rd' : 'th'} `;
      for (let j = 0; j < slotCounts[i]; j++)
        html += `<input type="checkbox" class="diamond-check" id="slot-${i}-${j}">`;
      html += `</div>`;
    }
    slotContainer.innerHTML = html;
  }
  generateStatusTracker();
}

window.toggleManagementMenu = function (event) {
  event.stopPropagation(); // Prevents the click from immediately reaching the window listener
  const menu = document.getElementById('management-menu');
  menu.classList.toggle('show');
};

// Close the menu if the user clicks outside of it
window.addEventListener('click', (event) => {
  const menu = document.getElementById('management-menu');
  if (menu && menu.classList.contains('show')) {
    if (!event.target.closest('.dropdown')) {
      menu.classList.remove('show');
    }
  }
});

function resetResourceBoxes(idPrefix) {
  document.querySelectorAll(`input[id^="${idPrefix}"][type="checkbox"]`).forEach((cb) => {
    cb.checked = false;
  });
}

window.shortRest = function () {
  const hpMax = parseInt(document.getElementById('hp-max').value) || 0;
  const hpCurr = parseInt(document.getElementById('hp-curr').value) || 0;
  const className = (document.getElementById('class').value || '').toLowerCase();

  // 1. HP Recovery (Standard)
  if (hpCurr < hpMax) {
    const roll = prompt('Short Rest: Enter total HP regained (Hit Dice rolls + Con mod):', '0');
    if (roll !== null) {
      const regained = parseInt(roll) || 0;
      document.getElementById('hp-curr').value = Math.min(hpMax, hpCurr + regained);
    }
  }

  // Clear Prone on a Short Rest
  const proneBox = document.getElementById('cond-prone');
  if (proneBox && proneBox.checked) {
    proneBox.checked = false;
    handleInput({ target: proneBox });
  }

  // 2. Class Specific Recovery
  let alerts = [];

  // Warlock: Pact Magic (Reset all slots)
  if (className.includes('warlock')) {
    if (confirm('Warlock: Regain all Pact Magic spell slots?')) {
      document.querySelectorAll('.spell-slots-grid input[type="checkbox"]').forEach((cb) => (cb.checked = false));
    }
  } else if (className.includes('wizard')) {
    // Wizard: Arcane Recovery
    alerts.push("Wizard: Remember 'Arcane Recovery' allows you to regain some spell slots!");
  }

  // Monk: Ki Points
  if (className.includes('monk')) {
    const kiMax = document.getElementById('ki-max').value;
    if (kiMax) {
      document.getElementById('ki-curr').value = kiMax;
      alerts.push('Monk: Ki Points restored.');
    }
  }

  // Fighter: Second Wind / Action Surge
  if (className.includes('fighter')) {
    resetResourceBoxes('second-wind');
    alerts.push('Fighter: Second Wind & Action Surge restored.');
  }

  // Cleric / Paladin: Channel Divinity
  if (className.includes('cleric') || className.includes('paladin')) {
    resetResourceBoxes('channel-divinity');
    alerts.push('Channel Divinity uses restored.');
  }

  // Druid: Wild Shape
  if (className.includes('druid')) {
    alerts.push('Druid: Wild Shape uses restored.');
  }

  // Trigger Save & Notify
  handleInput({ target: document.getElementById('hp-curr') });
  if (alerts.length > 0) alert(alerts.join('\n'));
};

window.longRest = function () {
  if (!confirm('Confirm Long Rest? This will reset HP, Spell Slots, Abilities, and remove Temp HP.')) return;

  const className = (document.getElementById('class').value || '').toLowerCase();
  let reminders = [];

  // 1. General Reset
  document.getElementById('hp-curr').value = document.getElementById('hp-max').value;
  document.getElementById('hp-temp').value = '';

  // Reset Death Saves
  for (let i = 1; i <= 3; i++) {
    document.getElementById(`ds-s-${i}`).checked = false;
    document.getElementById(`ds-f-${i}`).checked = false;
  }

  // 1. Reduce Exhaustion by 1 (Rule: Basic Rules, Ch 11)
  const exhaustInput = document.getElementById('exhaustion');
  if (exhaustInput && exhaustInput.value > 0) {
    exhaustInput.value = parseInt(exhaustInput.value) - 1;
  }

  // Reset All Spell Slots
  document.querySelectorAll('.spell-slots-grid input[type="checkbox"]').forEach((cb) => {
    cb.checked = false;
  });

  // Reset Hit Dice (Visual only, as we don't track HD quantity in this specific HTML, but we can assume logic exists)
  // (If you added Hit Dice tracking, reset half of max here)

  // 2. Class Specific Resets

  // Barbarian: Rage
  if (className.includes('barbarian')) {
    resetResourceBoxes('rage');
  }

  // Bard: Inspiration
  if (className.includes('bard')) {
    resetResourceBoxes('bard');
  }

  // Sorcerer: Sorcery Points
  if (className.includes('sorcerer')) {
    const sorcMax = document.getElementById('sorc-max').value;
    if (sorcMax) document.getElementById('sorc-curr').value = sorcMax;
  }

  // Monk: Ki (In case they didn't short rest)
  if (className.includes('monk')) {
    const kiMax = document.getElementById('ki-max').value;
    if (kiMax) document.getElementById('ki-curr').value = kiMax;
  }

  // Fighter, Cleric, Paladin (Reset SR resources too)
  resetResourceBoxes('second-wind');
  resetResourceBoxes('channel-divinity');

  // 3. Preparation & Crafting Reminders

  if (className.includes('artificer')) {
    reminders.push("Artificer: You can change your 'Infusions' and replace one cantrip/spell.");
  }

  if (className.includes('wizard')) {
    reminders.push('Wizard: You can prepare a new list of spells from your spellbook.');
  }

  if (className.includes('cleric') || className.includes('druid') || className.includes('paladin')) {
    reminders.push('Divine Caster: You can prepare a new list of spells for the day.');
  }

  handleInput({ target: document.getElementById('hp-curr') });

  if (reminders.length > 0) {
    // slight delay to allow the UI to update first
    setTimeout(() => alert('Long Rest Complete.\n\n' + reminders.join('\n')), 100);
  }
};

window.toggleTips = () => {
  tipsEnabled = !tipsEnabled;
  const btn = document.getElementById('toggle-tips');
  document.body.classList.toggle('tips-enabled', tipsEnabled);
  btn.innerText = `Tips: ${tipsEnabled ? 'ON' : 'OFF'}`;
  btn.style.background = tipsEnabled ? '#4a5568' : '#222';
  // Re-trigger ghosts to update highlights immediately
  document.querySelectorAll('.ghost-input').forEach((el) => el.dispatchEvent(new Event('input')));
};

const tooltipEl = document.getElementById('ai-tooltip');
let currentTarget = null;
function showTip(e, text, title) {
  if (!tipsEnabled || !text || text.length === 0) return;
  const quote = text[Math.floor(Math.random() * text.length)];
  tooltipEl.innerHTML = `<strong>${title}</strong>${quote}`;
  tooltipEl.style.opacity = '1';
  moveTip(e);
}

function moveTip(e) {
  if (!e.clientX) return;
  const x = e.clientX + 15;
  const y = e.clientY + 15;
  const rect = tooltipEl.getBoundingClientRect();
  const safeX = x + rect.width > window.innerWidth ? x - rect.width - 20 : x;
  const safeY = y + rect.height > window.innerHeight ? y - rect.height - 20 : y;
  tooltipEl.style.left = `${safeX}px`;
  tooltipEl.style.top = `${safeY}px`;
}

function hideTip() {
  tooltipEl.style.opacity = '0';
  currentTarget = null;
}
function getMatch(str) {
  if (!str) return null;
  const normalize = (s) =>
    s
      .trim()
      .toLowerCase()
      .replaceAll(/'s(\b)/g, '')
      .replaceAll(/s(\b)/g, '');
  const search = normalize(str);
  const key = Object.keys(AI_COMMENTS).find((k) => normalize(k) === search);
  return key ? { title: key, text: AI_COMMENTS[key] } : null;
}

async function setupTooltips() {
  try {
    const response = await fetch('./ai_comments.json');
    if (!response.ok) throw new Error('Failed to load AI comments');
    AI_COMMENTS = await response.json();
  } catch (err) {
    console.error('Tooltip data error:', err);
    return;
  }

  document.body.addEventListener('focusin', (e) => {
    const target = e.target.closest('[data-tip]');
    if (target && AI_COMMENTS[target.dataset.tip]) {
      const rect = target.getBoundingClientRect();
      showTip({ clientX: rect.right, clientY: rect.bottom }, AI_COMMENTS[target.dataset.tip], target.dataset.tip);
    }
  });
  document.body.addEventListener('focusout', hideTip);
}

document.addEventListener('DOMContentLoaded', async () => {
  generateStaticContent();
  initGhosts();
  await setupTooltips();
  ['notes', 'backstory', 'equipment', 'people'].forEach((cat) => initSubTabs(cat));

  document.body.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[data-tip]');
    if (target) {
      const match = getMatch(target.dataset.tip);
      if (match) {
        currentTarget = target;
        showTip(e, match.text, match.title);
      }
    }
  });
  document.body.addEventListener('mousemove', (e) => {
    if (currentTarget) moveTip(e);
  });
  document.body.addEventListener('mouseout', (e) => {
    if (e.target.closest('[data-tip]')) hideTip();
  });

  const allInputs = document.querySelectorAll('input, textarea, select');
  allInputs.forEach((input) => {
    input.addEventListener('input', handleInput);
  });

  document.querySelectorAll('.coin-slot input').forEach((coinInput) => {
    coinInput.addEventListener('input', updateWeight);
  });

  // ADD LISTENERS FOR HP MATH
  const hpCurr = document.getElementById('hp-curr');
  const hpTemp = document.getElementById('hp-temp');

  if (hpCurr) hpCurr.addEventListener('change', evaluateMathInput);
  if (hpTemp) hpTemp.addEventListener('change', evaluateMathInput);

  // Portrait
  const portraitInput = document.getElementById('portrait-url');
  if (portraitInput) {
    portraitInput.addEventListener('input', (e) => {
      updatePortraitFromURL(e.target.value);
      handleInput(e);
    });

    // Optional: Hide the input when it loses focus
    portraitInput.addEventListener('blur', () => {
      if (portraitInput.value.trim() !== '') {
        document.getElementById('portrait-container').classList.remove('editing');
      }
    });
  }

  const urlParams = new URLSearchParams(window.location.search);
  const sharedId = urlParams.get('charId');
  if (sharedId) await loadSharedCharacter(sharedId);
  if (!sharedId) isAppReady = true;
});

// 1. Warning on Refresh/Close if dirty
window.addEventListener('beforeunload', (e) => {
  if (hasUnsavedChanges) {
    e.preventDefault();
    e.returnValue = ''; // Browsers require this to show the prompt
  }
});

// 2. Save immediately if user hides tab (Mobile switch / Minimize)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && hasUnsavedChanges) {
    // Force an immediate save without debounce
    window.saveVersion(false);
  }
});

window.addEventListener('beforeprint', () => {
  // Auto-expand textareas for print
  document.querySelectorAll('textarea').forEach((el) => {
    el.style.height = el.scrollHeight + 'px';
  });
});
