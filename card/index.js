import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

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

const STATS = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
const SKILLS = {
  Acrobatics: 'dexterity',
  'Animal Handling': 'wisdom',
  Arcana: 'intelligence',
  Athletics: 'strength',
  Deception: 'charisma',
  History: 'intelligence',
  Insight: 'wisdom',
  Intimidation: 'charisma',
  Investigation: 'intelligence',
  Medicine: 'wisdom',
  Nature: 'intelligence',
  Perception: 'wisdom',
  Performance: 'charisma',
  Persuasion: 'charisma',
  Religion: 'intelligence',
  'Sleight of Hand': 'dexterity',
  Stealth: 'dexterity',
  Survival: 'wisdom',
};

async function loadData() {
  const charId = localStorage.getItem('dnd_char_id') || new URLSearchParams(window.location.search).get('charId');
  if (!charId) return;
  const docSnap = await getDoc(doc(db, 'characters', charId));
  if (docSnap.exists()) populateFolio(docSnap.data().sheetData);
}

function populateFolio(data) {
  // Header
  document.getElementById('hdr-name').innerText = data.charName || 'Unnamed';
  document.getElementById('hdr-class').innerText = data.class || '';
  document.getElementById('hdr-subclass').innerText = data.subclass || '';
  document.getElementById('hdr-level').innerText = data.level || '';
  document.getElementById('hdr-species').innerText = data.species || '';
  document.getElementById('hdr-bg').innerText = data.background || '';
  document.getElementById('hdr-xp').innerText = data.xp || '';

  const profBonus = parseInt(data['prof-bonus']) || 2;
  document.getElementById('val-prof').innerText = `+${profBonus}`;
  document.getElementById('val-spd').innerText = data.speed || '30';
  document.getElementById('val-pass-perc').innerText = data.pass_perc || '10';
  document.getElementById('val-ac').innerText = data.ac || '10';
  document.getElementById('val-hp-max').innerText = data['hp-max'] || '0';
  document.getElementById('val-age').innerText = data['age'] || '';
  document.getElementById('val-height').innerText = data['height'] || '';
  document.getElementById('val-weight').innerText = data['weight'] || '';
  document.getElementById('val-eyes').innerText = data['eyes'] || '';
  document.getElementById('val-skin').innerText = data['skin'] || '';
  document.getElementById('val-hair').innerText = data['hair'] || '';
  document.getElementById('val-appearance').innerText = data['appearance'] || '';
  document.getElementById('val-personality').innerText = data['personality'] || '';
  document.getElementById('val-alignment').innerText = data['alignment'] || '';

  // Stats & Skills Logic
  let abHtml = '';
  let mods = {};
  STATS.forEach((s) => {
    const score = parseInt(data[`${s}-score`]) || 10;
    const mod = Math.floor((score - 10) / 2);
    mods[s] = mod;
    abHtml += `<div class="ability-box"><div class="ab-name">${s.slice(0, 3).toUpperCase()}</div><div class="ab-mod">${mod >= 0 ? '+' : ''}${mod}</div><div class="ab-footer"><span>${score}</span></div></div>`;
  });
  document.getElementById('abilities-grid').innerHTML = abHtml;

  document.getElementById('skills-list').innerHTML = Object.keys(SKILLS)
    .map((s) => {
      const stat = SKILLS[s];
      const skillKeyId = s.toLowerCase().replace(/ /g, '');
      const isProf = data[`prof-${stat}-${skillKeyId}`];
      const bonus = mods[stat] + (isProf ? profBonus : 0);
      return `<div class="skill-item"><span>${isProf ? '●' : '○'} ${s}</span><span>${bonus >= 0 ? '+' : ''}${bonus}</span></div>`;
    })
    .join('');

  // Death Saves
  for (let i = 1; i <= 3; i++) {
    document.getElementById(`ds-s-${i}`).checked = data[`ds-s-${i}`] || false;
    document.getElementById(`ds-f-${i}`).checked = data[`ds-f-${i}`] || false;
  }

  // Weapons
  document.getElementById('weapons-body').innerHTML = (data.weapons || [])
    .slice(0, 7)
    .map((w) =>
      w.name
        ? `<tr><td><strong>${w.name}</strong></td><td>${w.atk}</td><td>${w.dmg} <span style="font-size:0.5rem; color:#666;">${w.notes || ''}</span></td></tr>`
        : '<tr><td>&nbsp;</td><td></td><td></td></tr>',
    )
    .join('');

  // Equipment (Filter to Tab 1)
  const primaryEquip = data.sub_tabs?.equipment?.[0]?.content || [];
  document.getElementById('equipment-body').innerHTML = primaryEquip
    .slice(0, 14)
    .map((e) =>
      e.name
        ? `<tr><td>${e.qty || 1}</td><td>${e.name}</td><td>${e.lbs || 0}</td></tr>`
        : '<tr><td>&nbsp;</td><td></td><td></td></tr>',
    )
    .join('');

  ['cp', 'sp', 'ep', 'gp', 'pp'].forEach((c) => (document.getElementById(`coin-${c}`).innerText = data[c] || '0'));

  // Traits
  let trHtml = '';
  const addTrait = (t, c) => {
    if (c) trHtml += `<p><strong>${t}:</strong> ${c.replace(/\n/g, '<br>')}</p>`;
  };
  addTrait('Class', data['class-features']);
  addTrait('Species', data['species-traits']);
  addTrait('Feats', data['feats']);
  document.getElementById('traits-area').innerHTML = trHtml;

  // Class Specific UI
  setupClassSpecifics(data);

  // Spells
  document.getElementById('spell-ability-txt').innerText = (data['spell-ability'] || 'None').toUpperCase();
  document.getElementById('spell-dc-txt').innerText = data['spell-save-dc'] || '10';
  document.getElementById('spell-atk-txt').innerText = data['spell-atk'] || '+0';
  document.getElementById('pass-perc-txt').innerText = data['pass-perc'] || '10';

  // Spell Slots
  let slHtml = '';
  for (let i = 1; i <= 9; i++) {
    slHtml += `<div>L${i}<br>`;
    for (let j = 0; j < 4; j++) {
      // Visual capacity
      const checked = data.spellSlots && data.spellSlots[`slot-${i}-${j}`] ? 'checked' : '';
      slHtml += `<input type="checkbox" class="diamond-check" ${checked}>`;
    }
    slHtml += `</div>`;
  }
  document.getElementById('spells-slots-ui').innerHTML = slHtml;

  document.getElementById('spells-body').innerHTML = (data.spells || [])
    .slice(0, 22)
    .map((s) =>
      s.name
        ? `<tr><td>${s.lvl}</td><td>${s.name}</td><td style="text-align:right">${s.conc ? 'C' : ''} ${s.rit ? 'R' : ''} ${s.mat ? 'M' : ''}</td></tr>`
        : '',
    )
    .join('');
}

function setupClassSpecifics(data) {
  const classNameInput = data.class || '';
  const cls = classNameInput.toLowerCase();
  const level = parseInt(data.level) || 1;

  const uiContainer = document.getElementById('class-features-ui');
  const insideContainer = document.getElementById('class-specific-inside');
  const insideTitle = document.getElementById('class-resource-title');

  if (!uiContainer || !insideContainer) return;

  let uiHtml = '';
  let insideHtml = '';

  // Helper to draw empty checkboxes for manual tracking with a pencil
  const drawEmptyBoxes = (max) => {
    const count = parseInt(max) || 0;
    if (count <= 0) return '';
    let boxes = '';
    for (let i = 0; i < count; i++) {
      boxes += '☐ '; // Unicode empty square
    }
    return `<span style="font-size: 1.1em; letter-spacing: 1px;">${boxes.trim()}</span>`;
  };

  // --- FRONT PAGE: SMALL COUNTERS (class-features-ui) ---
  if (cls.includes('barbarian')) {
    let maxRages = level >= 20 ? 0 : level >= 17 ? 6 : level >= 12 ? 5 : level >= 6 ? 4 : level >= 3 ? 3 : 2;
    uiHtml += `<div><strong>Rages:</strong> ${maxRages === 0 ? 'Unlimited' : drawEmptyBoxes(maxRages)}</div>`;
  }
  if (cls.includes('bard')) {
    const chaScore = parseInt(data['charisma-score']) || 10;
    const chaMod = Math.max(1, Math.floor((chaScore - 10) / 2));
    uiHtml += `<div><strong>Inspirations:</strong> ${drawEmptyBoxes(chaMod)} (${data['bardic-die'] || 'd6'})</div>`;
  }
  if (cls.includes('monk')) {
    uiHtml += `<div><strong>Ki Points:</strong> ${drawEmptyBoxes(data['ki-max'] || level)}</div>`;
    uiHtml += `<div><strong>Martial Arts:</strong> ${data['martial-arts-die'] || '1d4'} | <strong>Mvmt:</strong> ${data['unarmored-mvmt'] || '+10 ft'}</div>`;
  }
  if (cls.includes('sorcerer')) {
    uiHtml += `<div><strong>Sorcery Pts:</strong> <div style="line-height: 1.1; margin-top: 2px;">${drawEmptyBoxes(data['sorc-max'] || level)}</div></div>`;

    if (data.metamagic && data.metamagic.length > 0) {
      insideHtml += `<div class="section-title">Meta Magic Options</div>`;
      insideHtml += `<table><thead><tr><th style="width: 25%;">Option</th><th style="width: 15%;">Cost</th><th>Effect</th></tr></thead><tbody>`;
      data.metamagic.forEach((mm) => {
        if (mm.name) {
          insideHtml += `<tr>
          <td><strong>${mm.name}</strong></td>
          <td style="text-align:center;">${mm.cost || '-'}</td>
          <td>${mm.desc || ''}</td>
        </tr>`;
        }
      });
      insideHtml += `</tbody></table><br>`;
    }
  }
  if (cls.includes('fighter')) {
    uiHtml += `<div><strong>Second Wind / Action Surge:</strong> ${drawEmptyBoxes(2)}</div>`;
  }
  if (cls.includes('cleric') || cls.includes('paladin')) {
    let maxCD = cls.includes('cleric') ? (level >= 18 ? 3 : level >= 6 ? 2 : 1) : 1;
    uiHtml += `<div><strong>Channel Divinity:</strong> ${drawEmptyBoxes(maxCD)}</div>`;
  }
  if (cls.includes('rogue')) {
    uiHtml += `<div><strong>Sneak Attack:</strong> ${data['sneak-attack'] || Math.ceil(level / 2) + 'd6'}</div>`;
  }

  if (uiHtml !== '') {
    uiContainer.innerHTML =
      `<span style="font-weight:bold; font-size:0.5rem; color:var(--border-color); border-bottom:1px solid #ccc; display:block; margin-bottom:2px;">RESOURCES</span>` +
      uiHtml;
    uiContainer.style.display = 'block';
  } else {
    uiContainer.style.display = 'none';
  }

  // --- INSIDE FOLD: DETAILED LISTS (class-specific-inside) ---

  // Artificer: Magic Item Plans
  if (cls.includes('artificer') && data.magic_items?.length > 0) {
    insideHtml += `<div class="section-title">Magic Item Plans</div>`;
    insideHtml += `<table><thead><tr><th style="width:20px;">✓</th><th>Item Name</th><th style="width:30px;">Attn</th><th>Notes</th></tr></thead><tbody>`;
    data.magic_items.slice(0, 8).forEach((item) => {
      if (item.name) {
        insideHtml += `<tr><td>${item.created ? '☑' : '☐'}</td><td><strong>${item.name}</strong></td><td style="text-align:center;">${item.attunement ? 'Y' : '-'}</td><td>${item.notes || ''}</td></tr>`;
      }
    });
    insideHtml += `</tbody></table><br>`;
  }

  // Druid: Wild Shapes
  if (cls.includes('druid') && data.wild_shapes?.length > 0) {
    insideHtml += `<div class="section-title">Wild Shapes</div>`;
    insideHtml += `<table><thead><tr><th>Beast Name</th><th style="width:25px;">CR</th><th style="width:25px;">HP</th><th style="width:25px;">AC</th><th style="width:30px;">Spd</th></tr></thead><tbody>`;
    data.wild_shapes.slice(0, 8).forEach((ws) => {
      if (ws.name) {
        insideHtml += `<tr><td><strong>${ws.name}</strong><br><span style="color:#666; font-size:0.5rem;">${ws.notes || ''}</span></td><td>${ws.cr || '-'}</td><td>${ws.hp || '-'}</td><td>${ws.ac || '-'}</td><td>${ws.spd || '-'}</td></tr>`;
      }
    });
    insideHtml += `</tbody></table><br>`;
  }

  // Warlock: Invocations & Pact Boon
  if (cls.includes('warlock')) {
    if (data.invocations?.length > 0) {
      insideHtml += `<div class="section-title">Eldritch Invocations</div>`;
      insideHtml += `<table><thead><tr><th style="width: 35%;">Invocation</th><th>Description</th></tr></thead><tbody>`;
      data.invocations.slice(0, 8).forEach((inv) => {
        if (inv.name) {
          insideHtml += `<tr><td><strong>${inv.name}</strong></td><td>${inv.desc || ''}</td></tr>`;
        }
      });
      insideHtml += `</tbody></table><br>`;
    }
    if (data['pact-boon']) {
      insideHtml += `<div class="section-title">Pact Boon</div><div style="margin-bottom: 8px;">${data['pact-boon'].replace(/\n/g, '<br>')}</div>`;
    }
  }

  // Fighter: Weapon Mastery
  if (cls.includes('fighter') && data['weapon-mastery']) {
    insideHtml += `<div class="section-title">Weapon Mastery</div><div style="margin-bottom: 8px;">${data['weapon-mastery'].replace(/\n/g, '<br>')}</div>`;
  }

  // Ranger: Favored Enemy / Foe
  if (cls.includes('ranger') && data['favored-enemy']) {
    insideHtml += `<div class="section-title">Favored Enemy / Foe</div><div style="margin-bottom: 8px;">${data['favored-enemy'].replace(/\n/g, '<br>')}</div>`;
  }

  // Apply generated HTML or Fallback Notes Area
  if (insideHtml !== '') {
    insideContainer.innerHTML = insideHtml;
    if (insideTitle) insideTitle.innerText = 'Class Resources';
  } else {
    // Morph the section into extra handwritten notes
    if (insideTitle) insideTitle.innerText = 'Additional Notes';
    insideContainer.innerHTML = `<div class="traits-area" style="min-height: 3in; height: 100%; background: transparent;"></div>`;
  }
}

loadData();
