'use strict';

/* =========================================================
   Registre d'infirmerie — École Jules Verne (2026–2027)
   Application web 100 % locale (aucun serveur requis).
   Données conservées dans le navigateur (localStorage)
   ========================================================= */

/* ---------- Constantes ---------- */
var CLASSES = ['TPS','PSA','PSB','MSA','MSB','GSA','GSB','CPA','CPB','CPC','CE1A','CE1B','CE1C','CE2A','CE2B','CE2C','CM1A','CM1B','CM1C','CM2A','CM2B','CM2C','2A','1A','TA','Personnel'];
var PRIMARY_CLASSES = ['TPS','PSA','PSB','MSA','MSB','GSA','GSB','CPA','CPB','CPC','CE1A','CE1B','CE1C','CE2A','CE2B','CE2C','CM1A','CM1B','CM1C','CM2A','CM2B','CM2C','Personnel'];
var LYCEE_CLASSES = ['2A','1A','TA'];
var AGES = ['2 ans','3 ans','4 ans','5 ans','6 ans','7 ans','8 ans','9 ans','10 ans','11 ans','12 ans','13 ans','14 ans','15 ans','16 ans','17 ans','18 ans','19 ans','Personnel'];
var MOIS_NOMS = ['Janv','Févr','Mars','Avril','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc'];

var STORAGE_KEY = 'registre_infirmerie_jules_verne_v1';
var SETTINGS_KEY = 'registre_infirmerie_jules_verne_settings_v1';

var DEFAULT_SETTINGS = {
  ecole: 'École Jules Verne',
  titre: "Registre d'infirmerie scolaire 2026–2027",
  anneeDebut: '2026-09-01',
  anneeFin: '2027-06-30'
};

/* Correspondance des colonnes pour l'import CSV / Excel */
var FIELD_ALIASES = {
  'n': 'numero',
  'n°': 'numero',
  'numero': 'numero',
  'no': 'numero',
  'date': 'date',
  'heure arrivee': 'arrivee',
  "heure d'arrivee": 'arrivee',
  'arrivee': 'arrivee',
  'nom': 'nom',
  'nom et prenoms': 'nom',
  'nom et prénoms': 'nom',
  'classe': 'classe',
  'age': 'age',
  'âge': 'age',
  'observations': 'observations',
  'traitement': 'traitement',
  'heure de depart en classe': 'departClasse',
  'depart classe': 'departClasse',
  'heure de depart a la maison': 'departMaison',
  'depart maison': 'departMaison',
  'depart a la maison': 'departMaison',
  'parent': 'parent'
};

/* Colonnes du fichier « liste des élèves » (base d'autocomplétion) */
var STUDENTS_KEY = 'registre_infirmerie_jules_verne_eleves_v1';
var STUDENT_ALIASES = {
  'niveau': 'niveau',
  'niveau scolaire': 'niveau',
  'cycle': 'niveau',
  'nom': 'nom',
  'prenom': 'prenom',
  'prenoms': 'prenom',
  'ne(e) le': 'naissance',
  'nee le': 'naissance',
  'ne le': 'naissance',
  'naissance': 'naissance',
  'date de naissance': 'naissance',
  'sexe': 'sexe',
  'classe': 'classe'
};

/* ---------- État ---------- */
var data = [];                 // liste des visites
var studentsData = [];         // liste des élèves (autocomplétion du formulaire)
var settings = Object.assign({}, DEFAULT_SETTINGS);
var pendingImportAction = '';  // 'excel' | 'csv' | 'json'
var editingId = null;

/* ---------- Mode serveur / API / Authentification ---------- */
var SERVER_MODE = false;          // activé si le backend Node.js détecté
var API_BASE = '/api';
var AUTH_TOKEN_KEY = 'authToken_infirmerie_jv';
var currentUser = null;            // { id, username, role }
var syncPollTimer = null;
var SYNC_POLL_MS = 30000;          // rafraîchissement toutes les 30 s
var dataVersion = 0;               // détection de changements serveur
var saveInProgress = false;        // debounce des sauvegardes
var editingModalOpen = false;      // bloque le polling pendant édition

function apiFetch(url, options) {
  var opts = Object.assign({}, options || {});
  opts.headers = Object.assign({}, opts.headers || {});
  var token = sessionStorage.getItem(AUTH_TOKEN_KEY);
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  return fetch(API_BASE + url, opts);
}

function detectServerMode() {
  return fetch(API_BASE + '/config', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (cfg) { if (cfg && cfg.serverMode) SERVER_MODE = true; })
    .catch(function () { SERVER_MODE = false; });
}

function apiLogin(username, password) {
  return apiFetch('/auth/login', {
    method: 'POST',
    body: { username: username, password: password }
  }).then(function (r) {
    if (!r.ok) {
      return r.json().then(function (e) { throw new Error(e.error || 'Identifiants incorrects'); });
    }
    return r.json();
  }).then(function (result) {
    sessionStorage.setItem(AUTH_TOKEN_KEY, result.token);
    currentUser = result.user;
    return currentUser;
  });
}

function apiLogout() {
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  currentUser = null;
  SERVER_MODE = false;
  // Recharger la page en mode local
  location.reload();
}

function verifyAuthToken() {
  var token = sessionStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) return Promise.resolve(null);
  return apiFetch('/auth/verify')
    .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('Token invalide')); })
    .then(function (data) {
      currentUser = data.user;
      return currentUser;
    })
    .catch(function () {
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
      currentUser = null;
      return null;
    });
}

/* Synchronisation serveur → client */
function syncLoadAll() {
  return apiFetch('/data')
    .then(function (r) { return r.json(); })
    .then(function (all) {
      if (Array.isArray(all.visits)) {
        data = all.visits.map(function (v) { v.archive = !!v.archive; return v; });
      }
      if (all.settings) settings = Object.assign({}, DEFAULT_SETTINGS, all.settings);
      if (Array.isArray(all.students)) studentsData = all.students;
      migrateData();
    });
}

/* Synchronisation client → serveur (fire-and-forget) */
function syncSaveAll() {
  if (!SERVER_MODE || !currentUser || saveInProgress) return;
  saveInProgress = true;
  apiFetch('/data', {
    method: 'POST',
    body: { visits: data, settings: settings, students: studentsData }
  })
    .then(function (r) { return r.json(); })
    .then(function (result) {
      saveInProgress = false;
      if (result.success) { dataVersion++; }
    })
    .catch(function (e) {
      saveInProgress = false;
      console.error('Sync serveur impossible :', e);
    });
}

/* Polling : détecte les changements d'autres utilisateurs */
function startPolling() {
  if (syncPollTimer) clearTimeout(syncPollTimer);
  syncPollTimer = setTimeout(function () {
    if (SERVER_MODE && currentUser && !editingModalOpen) {
      syncLoadAll().then(function () {
        renderFilters();
        renderStats();
        renderTable();
        updateFooter();
      }).catch(function (e) {
        console.error('Polling error:', e);
      });
    }
    startPolling();
  }, SYNC_POLL_MS);
}

function stopPolling() {
  if (syncPollTimer) { clearTimeout(syncPollTimer); syncPollTimer = null; }
}

/* Interface d'authentification */
function showLogin() {
  var ov = $('loginOverlay');
  if (ov) { ov.hidden = false; }
  var nameInput = $('loginUsername');
  if (nameInput) nameInput.focus();
}

function hideLogin() {
  var ov = $('loginOverlay');
  if (ov) { ov.hidden = true; }
}

function onLoginSubmit(e) {
  e.preventDefault();
  var username = $('loginUsername').value.trim();
  var password = $('loginPassword').value;
  if (!username || !password) {
    alert('Veuillez saisir le nom d\'utilisateur et le mot de passe.');
    return;
  }
  apiLogin(username, password).then(function () {
    hideLogin();
    showAppContent();
    loadServerDataAndRender();
    startPolling();
  }).catch(function (err) {
    alert('Connexion impossible : ' + err.message);
  });
}

function showAppContent() {
  var lock = $('serverAuthLock');
  var app = $('appContent');
  if (lock) lock.hidden = true;
  if (app) app.hidden = false;
  // Cacher les modaux d'authentification
  var loginOv = $('loginOverlay');
  if (loginOv) loginOv.hidden = true;
  var changePwdOv = $('changePwdOverlay');
  if (changePwdOv) changePwdOv.hidden = true;
  updateAuthStatus();
}

function updateAuthStatus() {
  var indicator = $('authStatusIndicator');
  var userLabel = $('authUserLabel');
  var logoutBtn = $('btnLogout');
  if (indicator) indicator.hidden = !SERVER_MODE;
  if (userLabel && currentUser) userLabel.textContent = currentUser.username;
  var adminBadge = $('adminBadge');
  if (adminBadge) adminBadge.hidden = !(currentUser && currentUser.role === 'admin');
  var settingsButton = $('btnSettings');
  if (settingsButton) {
    var isAdmin = !SERVER_MODE || (currentUser && currentUser.role === 'admin');
    settingsButton.hidden = !isAdmin;
    settingsButton.textContent = $('settingsPage') && !$('settingsPage').hidden ? '← Retour au registre' : '⚙️ Paramètres';
  }
  var profileButton = $('btnProfile');
  if (profileButton) profileButton.hidden = !(SERVER_MODE && currentUser);
  if (logoutBtn) logoutBtn.hidden = !(SERVER_MODE && currentUser);
}

/* ---------- Utilitaires ---------- */
function $(id) { return document.getElementById(id); }

function pad2(n) { return (n < 10 ? '0' : '') + n; }

function todayISO() {
  var d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function nowTime() {
  var d = new Date();
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function fmtDateFR(iso) {
  if (!iso) return '';
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? m[3] + '/' + m[2] + '/' + m[1] : String(iso);
}

/* Date + heure en français : « 01/09/2026 à 14:32 » */
function fmtDateTimeFR(d) {
  if (!d) d = new Date();
  if (!(d instanceof Date)) d = new Date(d);
  if (isNaN(d.getTime())) return '';
  return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() +
    ' à ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

/* Date pour les noms de fichiers (pas de « / » autorisé) : « 01-09-2026 » */
function fmtDateFileFR() {
  var d = new Date();
  return pad2(d.getDate()) + '-' + pad2(d.getMonth() + 1) + '-' + d.getFullYear();
}

/* « 11H15 » / « 11h25 » → « 11:15 » */
function normalizeTime(t) {
  if (t === null || t === undefined) return '';
  t = String(t).trim().toUpperCase().replace(/\s+/g, '');
  if (!t) return '';
  t = t.replace(/H/g, ':');
  var m = /^(\d{1,2})(?::(\d{2}))?$/.exec(t);
  if (m) return pad2(parseInt(m[1], 10) % 24) + ':' + (m[2] ? m[2] : '00');
  return String(t);
}

function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function genId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function normalizeKey(s) {
  return String(s === null || s === undefined ? '' : s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

/* ---------- Persistance ---------- */
function saveData() {
  if (SERVER_MODE && currentUser) {
    syncSaveAll();
  } else {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch (e) { console.error('Sauvegarde impossible :', e); }
  }
  scheduleBackup();
  var el = $('saveStatus');
  if (el) el.textContent = '💾 Enregistré à ' + nowTime();
}

function loadData() {
  if (SERVER_MODE && currentUser) {
    return syncLoadAll();
  }
  return new Promise(function (resolve) {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr)) data = arr;
      }
    } catch (e) { console.warn('Lecture du registre impossible :', e); }
    migrateData();
    resolve();
  });
}

function migrateData() {
  data.forEach(function (v) {
    if (!v.id) v.id = genId();
    if (!v.createdAt) v.createdAt = Date.now();
    if (v.archive === undefined) v.archive = false;
    v.arrivee = normalizeTime(v.arrivee);
    v.departClasse = normalizeTime(v.departClasse);
    v.departMaison = normalizeTime(v.departMaison);
  });
}

function saveSettings() {
  if (SERVER_MODE && currentUser) {
    syncSaveAll();
  } else {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }
  applySettingsUI();
  scheduleBackup();
}

var SETTINGS_MIGRATION_KEY = 'registre_infirmerie_jules_verne_settings_2026_2027';

function loadSettings() {
  if (SERVER_MODE && currentUser) {
    return syncLoadAll();
  }
  return new Promise(function (resolve) {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) settings = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
    } catch (e) { settings = Object.assign({}, DEFAULT_SETTINGS); }
    migrateSettings();
    resolve();
  });
}

/* Une seule fois : les paramètres datant de l'année 2025–2026 passent à 2026–2027.
   Ne touche jamais à un choix postérieur (le drapeau évite toute répétition). */
function migrateSettings() {
  var done = false;
  try { done = localStorage.getItem(SETTINGS_MIGRATION_KEY) === '1'; } catch (e) { /* ignore */ }
  if (done) return;
  var changed = false;
  if (settings.anneeDebut === '2025-09-01') {
    settings.anneeDebut = DEFAULT_SETTINGS.anneeDebut;
    settings.anneeFin = DEFAULT_SETTINGS.anneeFin;
    changed = true;
  }
  if (settings.titre === "Registre d'infirmerie scolaire 2025–2026") {
    settings.titre = DEFAULT_SETTINGS.titre;
    changed = true;
  }
  try { localStorage.setItem(SETTINGS_MIGRATION_KEY, '1'); } catch (e) { /* ignore */ }
  if (changed) saveSettings();
}

function loadStudents() {
  if (SERVER_MODE && currentUser) {
    return syncLoadAll();
  }
  return new Promise(function (resolve) {
    try {
      var raw = localStorage.getItem(STUDENTS_KEY);
      if (raw) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr)) studentsData = arr;
      }
    } catch (e) { console.warn('Lecture de la liste des élèves impossible :', e); }
    resolve();
  });
}

function saveStudents() {
  if (SERVER_MODE && currentUser) {
    syncSaveAll();
  } else {
    try { localStorage.setItem(STUDENTS_KEY, JSON.stringify(studentsData)); }
    catch (e) { console.error('Sauvegarde de la liste des élèves impossible :', e); }
  }
}

function maxNumero() {
  var m = 0;
  data.forEach(function (v) { if (v.numero && v.numero > m) m = v.numero; });
  return m;
}

/* =========================================================
   RENDU
   ========================================================= */
function filteredData() {
  var q = normalizeKey($('filterSearch').value);
  var classe = $('filterClasse').value;
  var age = $('filterAge').value;
  var from = $('filterFrom').value;
  var to = $('filterTo').value;
  var showArch = $('filterArchives').checked;
  var liste = data.filter(function (v) {
    if (!showArch && v.archive) return false;
    if (classe && v.classe !== classe) return false;
    if (age && v.age !== age) return false;
    if (from && v.date && v.date < from) return false;
    if (to && v.date && v.date > to) return false;
    if (q) {
      var hay = normalizeKey((v.nom || '') + ' ' + (v.observations || '') + ' ' + (v.traitement || '') + ' ' + (v.classe || '') + ' ' + (v.parent || '') + ' ' + (v.age || ''));
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
  liste.sort(function (a, b) {
    if ((a.date || '') === (b.date || '')) {
      if ((a.arrivee || '') === (b.arrivee || '')) return (b.numero || 0) - (a.numero || 0);
      return (a.arrivee || '') < (b.arrivee || '') ? 1 : -1;
    }
    return (a.date || '') < (b.date || '') ? 1 : -1;
  });
  return liste;
}

function renderTable() {
  var rows = filteredData();
  var tbody = $('registerBody');
  tbody.innerHTML = '';
  $('emptyState').hidden = rows.length > 0;
  rows.forEach(function (v) {
    var tr = document.createElement('tr');
    if (v.archive) tr.className = 'is-archived';
    tr.innerHTML =
      '<td class="col-num">' + (v.numero || '') + '</td>' +
      '<td class="col-date">' + esc(fmtDateFR(v.date)) + '</td>' +
      '<td class="col-time">' + esc(v.arrivee) + '</td>' +
      '<td class="col-nom">' + esc(v.nom) + '</td>' +
      '<td class="col-classe">' + (v.classe ? '<span class="badge-classe">' + esc(v.classe) + '</span>' : '') + '</td>' +
      '<td class="col-age">' + esc(v.age) + '</td>' +
      '<td class="col-observ">' + esc(v.observations) + '</td>' +
      '<td class="col-trait">' + esc(v.traitement) + '</td>' +
      '<td class="col-time">' + esc(v.departClasse) + '</td>' +
      '<td class="col-time">' + esc(v.departMaison) + '</td>' +
      '<td class="col-parent">' + esc(v.parent) + '</td>' +
      '<td class="col-actions"><div class="cell-actions">' +
        '<button type="button" class="btn-icon" data-action="edit" data-id="' + v.id + '" title="Modifier">✏️</button>' +
        (v.archive
          ? '<button type="button" class="btn-icon" data-action="restore" data-id="' + v.id + '" title="Restaurer la visite">↩️</button>'
          : '<button type="button" class="btn-icon danger" data-action="archive" data-id="' + v.id + '" title="Archiver (retirer du registre actif)">🗄️</button>') +
      '</div></td>';
    tbody.appendChild(tr);
  });
  updateFooter();
}

/* Valeurs distinctes pour les menus de filtre : tirées de la liste des élèves
   importée et des visites enregistrées (plus de listes par défaut). */
function uniqueSortedValues(values, numeric) {
  var seen = {};
  var out = [];
  values.forEach(function (v) {
    var t = String(v || '').trim();
    if (!t || seen[t]) return;
    seen[t] = true;
    out.push(t);
  });
  if (numeric) {
    out.sort(function (a, b) {
      var na = parseInt(a, 10); if (isNaN(na)) na = 9999;
      var nb = parseInt(b, 10); if (isNaN(nb)) nb = 9999;
      return (na - nb) || (a < b ? -1 : a > b ? 1 : 0);
    });
  } else {
    out.sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; });
  }
  return out;
}

/* Classes disponibles dans les filtres : liste des élèves importée + visites */
function filterClasses() {
  var vals = [];
  studentsData.forEach(function (s) { if (s.classe) vals.push(s.classe); });
  data.forEach(function (v) { if (v.classe) vals.push(v.classe); });
  return uniqueSortedValues(vals, false);
}

/* Âges disponibles dans les filtres : calculés depuis les dates de naissance + visites */
function filterAges() {
  var vals = [];
  studentsData.forEach(function (s) { var a = ageFromBirth(s.naissance); if (a) vals.push(a); });
  data.forEach(function (v) { if (v.age) vals.push(v.age); });
  return uniqueSortedValues(vals, true);
}

function renderFilters() {
  var selCl = $('filterClasse');
  var selAge = $('filterAge');
  var curCl = selCl.value;
  var curAge = selAge.value;
  selCl.innerHTML = '<option value="">Toutes les classes</option>';
  filterClasses().forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c;
    selCl.appendChild(o);
  });
  selCl.value = curCl;
  selAge.innerHTML = '<option value="">Tous les âges</option>';
  filterAges().forEach(function (a) {
    var o = document.createElement('option');
    o.value = a; o.textContent = a;
    selAge.appendChild(o);
  });
  selAge.value = curAge;
}

function populateFormSelects() {
  var sc = $('fClasse');
  sc.innerHTML = '<option value="">— Choisir —</option>';
  var allowedClasses = CLASSES;
  if (SERVER_MODE && currentUser && currentUser.role !== 'admin') {
    allowedClasses = currentUser.niveau === 'lycee' ? LYCEE_CLASSES : PRIMARY_CLASSES;
  }
  allowedClasses.forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c;
    sc.appendChild(o);
  });
  /* Classes issues de la liste des élèves importée (ex. « 4A Afrique ») */
  extraClasses().forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c;
    sc.appendChild(o);
  });
  var sa = $('fAge');
  sa.innerHTML = '<option value="">— Choisir —</option>';
  AGES.forEach(function (a) {
    var o = document.createElement('option');
    o.value = a; o.textContent = a;
    sa.appendChild(o);
  });
}

function weekBounds() {
  var d = new Date();
  var day = d.getDay();
  var diff = (day === 0 ? -6 : 1 - day);
  var mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  var sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  function iso(x) { return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate()); }
  return { from: iso(mon), to: iso(sun) };
}

function schoolYearMonths() {
  var start = settings.anneeDebut || '2026-09-01';
  var y0 = parseInt(start.slice(0, 4), 10);
  var m0 = parseInt(start.slice(5, 7), 10);
  var list = [];
  for (var i = 0; i < 12; i++) {
    var mo = (m0 - 1 + i) % 12;
    var yr = y0 + Math.floor((m0 - 1 + i) / 12);
    list.push({ key: yr + '-' + pad2(mo + 1), label: MOIS_NOMS[mo] });
  }
  return list;
}

/* Plage de mois pour le graphique : année scolaire étendue, au besoin,
   jusqu'au premier / dernier mois réellement présent dans les visites. */
function buildStatsMonths(active) {
  var months = schoolYearMonths();
  var first = months[0].key;
  var last = months[months.length - 1].key;
  active.forEach(function (v) {
    if (!v.date || v.date.length < 7) return;
    var mk = v.date.slice(0, 7);
    if (mk < first) first = mk;
    if (mk > last) last = mk;
  });
  if (first === months[0].key && last === months[months.length - 1].key) return months;
  var out = [];
  var y = parseInt(first.slice(0, 4), 10);
  var m = parseInt(first.slice(5, 7), 10) - 1;
  var endY = parseInt(last.slice(0, 4), 10);
  var endM = parseInt(last.slice(5, 7), 10) - 1;
  var guard = 0;
  while ((y < endY || (y === endY && m <= endM)) && guard < 240) {
    out.push({ key: y + '-' + pad2(m + 1), label: MOIS_NOMS[m] });
    m++;
    if (m > 11) { m = 0; y++; }
    guard++;
  }
  return out;
}

function renderStats() {
  var today = todayISO();
  var wk = weekBounds();
  var monthNow = today.slice(0, 7);
  var active = data.filter(function (v) { return !v.archive; });
  var total = active.length, todayN = 0, weekN = 0, monthN = 0;
  var students = {};
  active.forEach(function (v) {
    if (v.date === today) todayN++;
    if (v.date && v.date >= wk.from && v.date <= wk.to) weekN++;
    if (v.date && v.date.slice(0, 7) === monthNow) monthN++;
    var k = normalizeKey(v.nom);
    if (k) students[k] = true;
  });
  $('statTotal').textContent = total;
  $('statToday').textContent = todayN;
  $('statWeek').textContent = weekN;
  $('statMonth').textContent = monthN;
  $('statStudents').textContent = Object.keys(students).length;

  /* Graphique : visites par mois (année scolaire étendue pour couvrir toutes les visites) */
  var months = buildStatsMonths(active);
  var counts = {};
  active.forEach(function (v) {
    if (!v.date) return;
    var mk = v.date.slice(0, 7);
    counts[mk] = (counts[mk] || 0) + 1;
  });
  var max = 1;
  months.forEach(function (m) { if (counts[m.key] > max) max = counts[m.key]; });
  var cMonths = $('chartMonths');
  cMonths.innerHTML = '';
  months.forEach(function (m) {
    var n = counts[m.key] || 0;
    var bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.height = Math.round((n / max) * 100) + '%';
    bar.title = m.label + ' : ' + n + ' visite(s)';
    bar.setAttribute('data-label', n + ' · ' + m.label);
    cMonths.appendChild(bar);
  });

  /* Graphique : top 5 classes */
  var byCl = {};
  active.forEach(function (v) {
    var c = v.classe || '(sans classe)';
    byCl[c] = (byCl[c] || 0) + 1;
  });
  var top = Object.keys(byCl).map(function (k) { return { classe: k, n: byCl[k] }; })
    .sort(function (a, b) { return b.n - a.n; }).slice(0, 5);
  var maxC = 1;
  top.forEach(function (t) { if (t.n > maxC) maxC = t.n; });
  var cCl = $('chartClasses');
  cCl.innerHTML = '';
  if (top.length === 0) {
    var empty = document.createElement('span');
    empty.className = 'stat-label';
    empty.textContent = 'Aucune donnée';
    cCl.appendChild(empty);
  }
  top.forEach(function (t) {
    var row = document.createElement('div');
    row.className = 'row';
    var name = document.createElement('span');
    name.className = 'name';
    name.textContent = t.classe;
    var track = document.createElement('div');
    track.className = 'track';
    var fill = document.createElement('div');
    fill.className = 'fill';
    fill.style.width = Math.round((t.n / maxC) * 100) + '%';
    track.appendChild(fill);
    var num = document.createElement('span');
    num.textContent = t.n;
    row.appendChild(name);
    row.appendChild(track);
    row.appendChild(num);
    cCl.appendChild(row);
  });
}

function updateFooter() {
  var n = data.filter(function (v) { return !v.archive; }).length;
  var a = data.length - n;
  var t = $('footerCount');
  t.textContent = n + ' visite' + (n > 1 ? 's' : '') + ' enregistrée' + (n > 1 ? 's' : '') + ' | ' + a + ' archivée' + (a > 1 ? 's' : '');
}

function applySettingsUI() {
  $('schoolTitle').textContent = settings.ecole;
  $('registerTitle').textContent = settings.titre;
  $('printSchoolTitle').textContent = settings.ecole;
  $('printRegisterTitle').textContent = settings.titre;
  document.title = settings.titre + ' — ' + settings.ecole;
}

function renderAll() {
  renderFilters();
  renderStats();
  renderTable();
}

/* =========================================================
   MODALE ET CRUD
   ========================================================= */
function openModal(id) {
  editingId = id || null;
  editingModalOpen = true;
  $('visitForm').reset();
  hideAutocomplete();
  lastSelectedStudentName = '';
  setManualClassAge();
  var v = null;
  if (id) {
    for (var i = 0; i < data.length; i++) {
      if (data[i].id === id) { v = data[i]; break; }
    }
  }
  if (v) {
    $('fId').value = v.id;
    $('fDate').value = v.date || '';
    $('fArrivee').value = v.arrivee || '';
    $('fNom').value = v.nom || '';
    $('fClasse').value = v.classe || '';
    $('fAge').value = v.age || '';
    $('fObservations').value = v.observations || '';
    $('fTraitement').value = v.traitement || '';
    $('fDepartClasse').value = v.departClasse || '';
    $('fDepartMaison').value = v.departMaison || '';
    $('fParent').value = v.parent || '';
    $('modalTitle').textContent = 'Modifier la visite n° ' + (v.numero || '');
  } else {
    $('fId').value = '';
    $('fDate').value = todayISO();
    $('fArrivee').value = nowTime();
    $('modalTitle').textContent = 'Nouvelle visite';
  }
  $('modalOverlay').hidden = false;
  if (!v) setTimeout(function () { $('fNom').focus(); }, 50);
}

function closeModal() {
  $('modalOverlay').hidden = true;
  editingId = null;
  editingModalOpen = false;
  hideAutocomplete();
}

function onVisitSubmit(e) {
  e.preventDefault();
  var nom = $('fNom').value.trim();
  var date = $('fDate').value;
  var classe = $('fClasse').value;
  if (!nom) { alert('Veuillez saisir le nom et les prénoms.'); $('fNom').focus(); return; }
  if (!date) { alert('Veuillez choisir la date.'); $('fDate').focus(); return; }
  if (!classe) { alert('Veuillez choisir la classe.'); $('fClasse').focus(); return; }

  var rec = {
    id: editingId || genId(),
    numero: null,
    date: date,
    arrivee: normalizeTime($('fArrivee').value),
    nom: nom,
    classe: classe,
    niveau: currentUser && currentUser.role !== 'admin' ? currentUser.niveau : (['2A', '1A', 'TA'].indexOf(String(classe).replace(/\s+/g, '').toUpperCase()) !== -1 ? 'lycee' : 'primaire'),
    age: $('fAge').value,
    observations: $('fObservations').value.trim(),
    traitement: $('fTraitement').value.trim(),
    departClasse: normalizeTime($('fDepartClasse').value),
    departMaison: normalizeTime($('fDepartMaison').value),
    parent: $('fParent').value,
    archive: false,
    createdAt: Date.now()
  };

  if (editingId) {
    var idx = -1;
    for (var i = 0; i < data.length; i++) {
      if (data[i].id === editingId) { idx = i; break; }
    }
    if (idx >= 0) {
      rec.numero = data[idx].numero;
      rec.createdAt = data[idx].createdAt;
      rec.archive = data[idx].archive;
      data[idx] = rec;
    }
  }
  if (!editingId || idx < 0) {
    rec.numero = maxNumero() + 1;
    data.push(rec);
  }
  closeModal();
  saveData();
  renderAll();
}

function archiveVisit(id) {
  for (var i = 0; i < data.length; i++) {
    if (data[i].id === id && !data[i].archive) {
      data[i].archive = true;
      saveData();
      renderAll();
      return;
    }
  }
}

function restoreVisit(id) {
  for (var i = 0; i < data.length; i++) {
    if (data[i].id === id) {
      data[i].archive = false;
      saveData();
      renderAll();
      return;
    }
  }
}

/* ---------- Import / export : ouverture des menus ---------- */
function closeDropdowns() {
  $('importMenu').classList.remove('open');
  $('exportMenu').classList.remove('open');
}

function toggleMenu(menuId, otherId) {
  var m = $(menuId);
  var isOpen = m.classList.contains('open');
  closeDropdowns();
  if (!isOpen) m.classList.add('open');
}

function openFilePicker(action) {
  pendingImportAction = action;
  var accept = '.xlsx,.xlsm';
  if (action === 'csv') accept = '.csv,text/csv';
  if (action === 'json') accept = '.json,application/json';
  if (action === 'students') accept = '.xlsx,.xlsm,.csv,text/csv';
  var fi = $('fileInput');
  fi.accept = accept;
  fi.value = '';
  fi.click();
}

function handleExport(action) {
  var list = data.filter(function (v) { return !v.archive; });
  if (action === 'xlsx') {
    var bytes = buildXlsxBytes(list);
    downloadBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName('xlsx'));
  } else if (action === 'csv') {
    downloadBlob(new Blob([buildCsv(list)], { type: 'text/csv;charset=utf-8' }), fileName('csv'));
  } else if (action === 'json') {
    var payload = buildBackupPayload();
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), fileName('json'));
  }
  closeDropdowns();
  toast('Export ' + action.toUpperCase() + ' téléchargé.');
}

function toast(msg, isError) {
  var el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(function () { el.classList.add('show'); }, 20);
  setTimeout(function () {
    el.classList.remove('show');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 350);
  }, 2800);
}

function fileName(ext) {
  var base = (settings.titre || 'Registre infirmerie').replace(/[\\/:*?"<>|]+/g, '-');
  return base + ' ' + fmtDateFileFR() + '.' + ext;
}

/* =========================================================
   EXPORT CSV
   ========================================================= */
function csvField(s) {
  s = String(s === null || s === undefined ? '' : s);
  if (/[;"\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function buildCsv(list) {
  var HEADERS = ['N°', 'Date', "Heure d'arrivée", 'Nom et prénoms', 'Classe', 'Âge', 'Observations', 'Traitement', 'Heure de départ en classe', 'Heure de départ à la maison', 'Parent'];
  var lines = [HEADERS.join(';')];
  list.forEach(function (v) {
    lines.push([
      v.numero != null ? v.numero : '',
      fmtDateFR(v.date),
      v.arrivee || '',
      v.nom || '',
      v.classe || '',
      v.age || '',
      v.observations || '',
      v.traitement || '',
      v.departClasse || '',
      v.departMaison || '',
      v.parent || ''
    ].map(csvField).join(';'));
  });
  return '\uFEFF' + lines.join('\r\n');
}

function parseCSV(text) {
  text = String(text || '').replace(/^\uFEFF/, '');
  if (!text.trim()) return [];
  var firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
  var nbSemi = (firstLine.match(/;/g) || []).length;
  var nbComma = (firstLine.match(/,/g) || []).length;
  var delim = nbSemi >= nbComma ? ';' : ',';
  var rows = [], row = [], field = '', inQ = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += ch;
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === delim) {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* =========================================================
   EXPORT EXCEL (.xlsx) — générateur ZIP minimal (sans
   bibliothèque). Entrées non compressées (méthode "store"),
   lisible par Excel, LibreOffice…
   ========================================================= */
var _crcTable = null;
function crcTable() {
  if (_crcTable) return _crcTable;
  var t = new Uint32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  _crcTable = t;
  return t;
}

function crc32(bytes, start, end) {
  var table = crcTable();
  var crc = 0xFFFFFFFF;
  for (var i = start; i < end; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function buildZip(files) {
  var encoder = new TextEncoder();
  var now = new Date();
  var dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
  var dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;

  var chunks = [];
  var central = [];
  var offset = 0;

  files.forEach(function (f) {
    var nameBytes = encoder.encode(f.name);
    var crc = crc32(f.data, 0, f.data.length);
    var size = f.data.length;

    var lh = new Uint8Array(30 + nameBytes.length);
    var vl = new DataView(lh.buffer);
    vl.setUint32(0, 0x04034B50, true);
    vl.setUint16(4, 20, true);
    vl.setUint16(6, 0x0800, true);   /* drapeau : noms UTF-8 */
    vl.setUint16(8, 0, true);        /* méthode : stockée */
    vl.setUint16(10, dosTime, true);
    vl.setUint16(12, dosDate, true);
    vl.setUint32(14, crc, true);
    vl.setUint32(18, size, true);
    vl.setUint32(22, size, true);
    vl.setUint16(26, nameBytes.length, true);
    vl.setUint16(28, 0, true);
    lh.set(nameBytes, 30);

    var local = new Uint8Array(30 + nameBytes.length + size);
    local.set(lh, 0);
    local.set(f.data, 30 + nameBytes.length);

    central.push({ nameBytes: nameBytes, crc: crc, size: size, offset: offset });
    chunks.push(local);
    offset += local.length;
  });

  var cdStart = offset;
  var cdParts = [];
  central.forEach(function (c) {
    var cd = new Uint8Array(46 + c.nameBytes.length);
    var v = new DataView(cd.buffer);
    v.setUint32(0, 0x02014B50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 20, true);
    v.setUint16(8, 0x0800, true);
    v.setUint16(10, 0, true);
    v.setUint16(12, dosTime, true);
    v.setUint16(14, dosDate, true);
    v.setUint32(16, c.crc, true);
    v.setUint32(20, c.size, true);
    v.setUint32(24, c.size, true);
    v.setUint16(28, c.nameBytes.length, true);
    v.setUint16(30, 0, true);
    v.setUint16(32, 0, true);
    v.setUint16(34, 0, true);
    v.setUint16(36, 0, true);
    v.setUint32(38, 0, true);
    v.setUint32(42, c.offset, true);
    cd.set(c.nameBytes, 46);
    cdParts.push(cd);
    offset += cd.length;
  });

  var eocd = new Uint8Array(22);
  var e = new DataView(eocd.buffer);
  e.setUint32(0, 0x06054B50, true);
  e.setUint16(4, 0, true);
  e.setUint16(6, 0, true);
  e.setUint16(8, central.length, true);
  e.setUint16(10, central.length, true);
  e.setUint32(12, offset - cdStart, true);
  e.setUint32(16, cdStart, true);
  e.setUint16(20, 0, true);

  var total = 0;
  chunks.forEach(function (c) { total += c.length; });
  cdParts.forEach(function (c) { total += c.length; });
  total += 22;

  var out = new Uint8Array(total);
  var o = 0;
  chunks.forEach(function (c) { out.set(c, o); o += c.length; });
  cdParts.forEach(function (c) { out.set(c, o); o += c.length; });
  out.set(eocd, o);
  return out;
}

function xmlEscape(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildSheetXml(rows) {
  var letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];
  var widths = [6, 11, 9, 26, 9, 8, 30, 22, 12, 12, 8];
  var out = [];
  out.push('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">');
  out.push('<dimension ref="A1:' + letters[widths.length - 1] + Math.max(rows.length, 1) + '"/>');
  out.push('<cols>');
  for (var c = 0; c < widths.length; c++) {
    out.push('<col min="' + (c + 1) + '" max="' + (c + 1) + '" width="' + widths[c] + '" customWidth="1"/>');
  }
  out.push('</cols>');
  out.push('<sheetViews><sheetView workbookViewId="0"/></sheetViews>');
  out.push('<sheetData>');
  rows.forEach(function (row, ri) {
    var parts = [];
    row.forEach(function (val, ci) {
      var ref = letters[ci] + (ri + 1);
      if (ci === 0 && typeof val === 'number') {
        parts.push('<c r="' + ref + '"><v>' + val + '</v></c>');
      } else {
        parts.push('<c r="' + ref + '" t="inlineStr"><is><t>' + xmlEscape(val) + '</t></is></c>');
      }
    });
    out.push('<row r="' + (ri + 1) + '">' + parts.join('') + '</row>');
  });
  out.push('</sheetData></worksheet>');
  return out.join('');
}

var XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

var CONTENT_TYPES =
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '</Types>';

var ROOT_RELS =
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>';

var WORKBOOK =
  '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
  '<sheets><sheet name="Registre" sheetId="1" r:id="rId1"/></sheets>' +
  '</workbook>';

var WB_RELS =
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '</Relationships>';

function buildXlsxBytes(list) {
  var header = ['N°', 'Date', "Heure d'arrivée", 'Nom et prénoms', 'Classe', 'Âge', 'Observations', 'Traitement', 'Heure de départ en classe', 'Heure de départ à la maison', 'Parent'];
  var rows = [header];
  list.forEach(function (v) {
    rows.push([
      v.numero != null ? v.numero : '',
      fmtDateFR(v.date),
      v.arrivee || '',
      v.nom || '',
      v.classe || '',
      v.age || '',
      v.observations || '',
      v.traitement || '',
      v.departClasse || '',
      v.departMaison || '',
      v.parent || ''
    ]);
  });
  var enc = new TextEncoder();
  var files = [
    { name: '[Content_Types].xml', data: enc.encode(XML_DECL + CONTENT_TYPES) },
    { name: '_rels/.rels', data: enc.encode(XML_DECL + ROOT_RELS) },
    { name: 'xl/workbook.xml', data: enc.encode(XML_DECL + WORKBOOK) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(XML_DECL + WB_RELS) },
    { name: 'xl/worksheets/sheet1.xml', data: enc.encode(XML_DECL + buildSheetXml(rows)) }
  ];
  return buildZip(files);
}

function downloadBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 2000);
}

/* =========================================================
   IMPORT — utilitaires de dates
   ========================================================= */
function serialToISO(serial) {
  if (isNaN(serial) || serial <= 0) return '';
  var ms = Date.UTC(1899, 11, 30) + serial * 86400000;
  var d = new Date(ms);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

function parseAnyDate(raw) {
  if (!raw) return '';
  raw = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  if (/^\d+$/.test(raw)) {
    var n = parseInt(raw, 10);
    if (n > 1000 && n < 60000) return serialToISO(n);
    return '';
  }
  var m = /^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})$/.exec(raw);
  if (m) {
    var d2 = parseInt(m[1], 10);
    var mo = parseInt(m[2], 10);
    var y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    return y + '-' + pad2(mo) + '-' + pad2(d2);
  }
  return '';
}

function getRowVal(row, idx) {
  if (idx === undefined || idx === null) return '';
  var v = row[idx];
  return v === null || v === undefined ? '' : String(v);
}

function appendImportedRecords(recs) {
  var added = 0;
  var skipped = 0;
  recs.forEach(function (r) {
    if (!r.nom) return;
    var niveau = inferNiveau('', r.classe);
    if (SERVER_MODE && currentUser && currentUser.role !== 'admin' && niveau !== currentUser.niveau) { skipped++; return; }
    data.push({
      id: genId(),
      numero: maxNumero() + 1,
      date: r.date || todayISO(),
      arrivee: normalizeTime(r.arrivee),
      nom: String(r.nom).trim(),
      classe: r.classe || '',
      niveau: currentUser && currentUser.role !== 'admin' ? currentUser.niveau : niveau,
      age: r.age || '',
      observations: r.observations || '',
      traitement: r.traitement || '',
      departClasse: normalizeTime(r.departClasse),
      departMaison: normalizeTime(r.departMaison),
      parent: r.parent || '',
      archive: false,
      createdAt: Date.now()
    });
    added++;
  });
  if (added) { saveData(); renderAll(); }
  if (skipped) toast(skipped + ' visite(s) ignorée(s), car elles appartiennent à l’autre niveau.');
  return added;
}

function mapHeaderRow(row) {
  var idxOf = {};
  row.forEach(function (h, i) {
    var k = normalizeKey(h);
    if (FIELD_ALIASES[k] && idxOf[FIELD_ALIASES[k]] === undefined) idxOf[FIELD_ALIASES[k]] = i;
  });
  return idxOf;
}

function importCsvText(text) {
  var rows = parseCSV(text);
  if (!rows.length) throw new Error('Le fichier CSV est vide.');
  var idxOf = mapHeaderRow(rows[0]);
  if (idxOf.nom === undefined) throw new Error('Colonne « Nom et prénoms » introuvable dans le CSV.');
  var recs = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var nom = getRowVal(row, idxOf.nom);
    var obs = getRowVal(row, idxOf.observations);
    var dateRaw = getRowVal(row, idxOf.date);
    if (!nom.trim() && !obs.trim() && !dateRaw.trim()) continue;
    recs.push({
      nom: nom,
      date: parseAnyDate(dateRaw),
      arrivee: getRowVal(row, idxOf.arrivee),
      classe: getRowVal(row, idxOf.classe),
      age: getRowVal(row, idxOf.age),
      observations: obs,
      traitement: getRowVal(row, idxOf.traitement),
      departClasse: getRowVal(row, idxOf.departClasse),
      departMaison: getRowVal(row, idxOf.departMaison),
      parent: getRowVal(row, idxOf.parent)
    });
  }
  var added = appendImportedRecords(recs);
  return { added: added };
}

function importJsonText(text) {
  var obj = JSON.parse(text);
  if (!obj || !Array.isArray(obj.data)) throw new Error('Fichier de sauvegarde invalide.');
  var arr = obj.data.filter(function (v) { return v && v.nom; });
  data = arr;
  if (SERVER_MODE && currentUser && currentUser.role !== 'admin') {
    var accountLevel = currentUser.niveau || 'primaire';
    data = data.filter(function (v) { return inferNiveau('', v.classe) === accountLevel; });
  }
  if (obj.settings) settings = Object.assign({}, DEFAULT_SETTINGS, obj.settings);
  if (obj.eleves && Array.isArray(obj.eleves)) {
    studentsData = obj.eleves.filter(function (s) { return s && (s.nom || s.prenom); });
    if (SERVER_MODE && currentUser && currentUser.role !== 'admin') {
      var accountLevelForStudents = currentUser.niveau || 'primaire';
      studentsData = studentsData.filter(function (s) { return inferNiveau('', s.classe) === accountLevelForStudents; });
    }
    studentsData = studentsData.map(function (s) {
      var assigned = SERVER_MODE && currentUser && currentUser.role !== 'admin' ? currentUser.niveau : inferNiveau(s.niveau, s.classe);
      return Object.assign({}, s, { niveau: assigned || 'primaire' });
    });
  }
  migrateData();
  saveData();
  saveSettings();
  saveStudents();
  updateStudentsUI();
  populateFormSelects();
  renderAll();
  return { dataCount: data.length };
}

/* =========================================================
   LISTE DES ÉLÈVES (autocomplétion du formulaire)
   Colonnes attendues : Niveau (facultatif), Nom, Prénom, Né(e) le, Sexe, Classe
   ========================================================= */
function normalizeSexe(raw) {
  var k = normalizeKey(raw);
  if (!k) return '';
  if (k.charAt(0) === 'm') return 'Masculin';
  if (k.charAt(0) === 'f') return 'Féminin';
  return raw;
}

function inferNiveau(niveau, classe) {
  var classKey = String(classe || '').replace(/\s+/g, '').toUpperCase();
  if (LYCEE_CLASSES.indexOf(classKey) !== -1) return 'lycee';
  if (PRIMARY_CLASSES.indexOf(classKey) !== -1) return 'primaire';
  var levelKey = normalizeKey(niveau || '');
  if (levelKey.indexOf('lyc') === 0 || levelKey === 'secondaire') return 'lycee';
  if (levelKey) return 'primaire';
  return 'primaire';
}

function studentDisplayName(s) {
  return ((s.nom || '') + ' ' + (s.prenom || '')).replace(/\s+/g, ' ').trim();
}

function studentSearchKey(s) {
  return normalizeKey(studentDisplayName(s));
}

/* Âge calculé à partir de la date de naissance : « 13 ans », « 1 an »… */
function ageFromBirth(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  var b = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  if (isNaN(b.getTime())) return '';
  var t = new Date();
  var a = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
  if (a < 0) a = 0;
  return a + (a > 1 ? ' ans' : ' an');
}

/* Classes présentes dans la liste des élèves mais absentes de CLASSES */
function extraClasses() {
  var known = {};
  CLASSES.forEach(function (c) { known[c] = true; });
  var out = [];
  studentsData.forEach(function (s) {
    var c = (s.classe || '').trim();
    if (c && !known[c]) { known[c] = true; out.push(c); }
  });
  return out.sort();
}

/* Parse les lignes du fichier élèves (CSV ou feuille Excel) */
function studentsFromRows(rows) {
  var headerIdx = -1;
  for (var i = 0; i < rows.length; i++) {
    var rr = rows[i] || [];
    for (var j = 0; j < rr.length; j++) {
      if (normalizeKey(rr[j]) === 'nom') { headerIdx = i; break; }
    }
    if (headerIdx >= 0) break;
  }
  if (headerIdx < 0) throw new Error('Colonne « Nom » introuvable dans la liste des élèves.');
  var idxOf = {};
  (rows[headerIdx] || []).forEach(function (h, c) {
    var k = normalizeKey(h);
    if (STUDENT_ALIASES[k] && idxOf[STUDENT_ALIASES[k]] === undefined) idxOf[STUDENT_ALIASES[k]] = c;
  });
  if (idxOf.nom === undefined) throw new Error('Colonne « Nom » introuvable.');
  var out = [];
  for (var r = headerIdx + 1; r < rows.length; r++) {
    var row = rows[r] || [];
    var nom = getRowVal(row, idxOf.nom).replace(/\s+/g, ' ').trim();
    var prenom = getRowVal(row, idxOf.prenom).replace(/\s+/g, ' ').trim();
    if (!nom && !prenom) continue;
    out.push({
      nom: nom,
      prenom: prenom,
      niveau: getRowVal(row, idxOf.niveau).trim(),
      naissance: parseAnyDate(getRowVal(row, idxOf.naissance)),
      sexe: normalizeSexe(getRowVal(row, idxOf.sexe).trim()),
      classe: getRowVal(row, idxOf.classe).replace(/\s+/g, ' ').trim()
    });
  }
  if (!out.length) throw new Error('Aucun élève trouvé dans le fichier.');
  return out;
}

/* Import Excel : réutilise le lecteur XLSX, feuille « élèves » en priorité */
function importStudentsXlsxBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  var entries = parseZipBytes(bytes);
  var names = Object.keys(entries).filter(function (n) { return /^xl\/worksheets\/.+\.xml$/.test(n); });
  if (!names.length) throw new Error('Aucune feuille de calcul dans le fichier Excel.');
  names.sort(function (a, b) {
    var ka = normalizeKey(a).indexOf('eleve') !== -1 ? 0 : 1;
    var kb = normalizeKey(b).indexOf('eleve') !== -1 ? 0 : 1;
    return ka - kb;
  });
  var sstName = Object.keys(entries).filter(function (n) { return /^xl\/sharedStrings\.xml$/.test(n); })[0] || null;
  var jobs = names.map(function (n) { return inflateRaw(entries[n]); });
  if (sstName) jobs.push(inflateRaw(entries[sstName]));
  return Promise.all(jobs).then(function (arr) {
    var sstText = sstName ? decodeUtf8(arr[arr.length - 1]) : '';
    var lastErr = null;
    for (var i = 0; i < names.length; i++) {
      try {
        return { students: studentsFromRows(rowsFromSheetXml(decodeUtf8(arr[i]), sstText)) };
      } catch (err) { lastErr = err; }
    }
    throw lastErr || new Error('Liste des élèves introuvable dans ce fichier.');
  });
}

/* Remplace la liste actuelle et rafraîchit l'interface */
function applyStudentsList(list) {
  var forcedLevel = SERVER_MODE && currentUser && currentUser.role !== 'admin' ? currentUser.niveau : '';
  var importedStudents = list.filter(function (s) {
    return !forcedLevel || !s.classe || inferNiveau('', s.classe) === forcedLevel;
  }).map(function (s) {
    return Object.assign({}, s, { niveau: forcedLevel || inferNiveau(s.niveau, s.classe) });
  });
  if (SERVER_MODE && currentUser && currentUser.role === 'admin' && studentsData.length) {
    var importedLevels = {};
    importedStudents.forEach(function (s) { importedLevels[s.niveau] = true; });
    var existingOtherLevels = studentsData.filter(function (s) {
      return !importedLevels[inferNiveau(s.niveau, s.classe)];
    });
    studentsData = existingOtherLevels.concat(importedStudents);
  } else {
    studentsData = importedStudents;
  }
  saveStudents();
  updateStudentsUI();
  renderFilters();
  populateFormSelects();
  return studentsData.length;
}

function updateStudentsUI() {
  var box = $('studentsStatus');
  if (!box) return;
  var clearBtn = $('btnStudentsClear');
  if (!studentsData.length) {
    box.className = 'backup-status off';
    box.textContent = 'Aucun élève enregistré. Importez le fichier Excel / CSV fourni par la direction.';
    if (clearBtn) clearBtn.hidden = true;
  } else {
    box.className = 'backup-status on';
    box.textContent = studentsData.length + ' élève(s) enregistré(s) — autocomplétion active dans le formulaire de visite.';
    if (clearBtn) clearBtn.hidden = false;
  }
}

/* ---------- Autocomplétion du champ « Nom et prénoms » ---------- */
var acResults = [];
var acIndex = -1;
var lastSelectedStudentName = '';

function hideAutocomplete() {
  var box = $('nomAutocomplete');
  if (box) box.hidden = true;
  acResults = [];
  acIndex = -1;
}

function findStudents(q) {
  var k = normalizeKey(q);
  if (!k || !studentsData.length) return [];
  var matches = [];
  for (var i = 0; i < studentsData.length; i++) {
    if (studentSearchKey(studentsData[i]).indexOf(k) !== -1) matches.push(studentsData[i]);
  }
  if (!(SERVER_MODE && currentUser && currentUser.role === 'admin')) return matches.slice(0, 8);

  var primary = matches.filter(function (s) { return inferNiveau(s.niveau, s.classe) === 'primaire'; });
  var lycee = matches.filter(function (s) { return inferNiveau(s.niveau, s.classe) === 'lycee'; });
  var balanced = [];
  while (balanced.length < 8 && (primary.length || lycee.length)) {
    if (primary.length && balanced.length < 8) balanced.push(primary.shift());
    if (lycee.length && balanced.length < 8) balanced.push(lycee.shift());
  }
  return balanced;
}

function renderAutocomplete() {
  var box = $('nomAutocomplete');
  if (!box) return;
  var q = $('fNom').value;
  if (!q.trim() || !studentsData.length) { hideAutocomplete(); return; }
  acResults = findStudents(q);
  if (!acResults.length) { hideAutocomplete(); return; }
  box.innerHTML = '';
  acResults.forEach(function (s, i) {
    var item = document.createElement('div');
    item.className = 'ac-item' + (i === acIndex ? ' active' : '');
    item.setAttribute('data-index', String(i));

    var name = document.createElement('span');
    name.className = 'ac-name';
    var full = studentDisplayName(s);
    var pos = full.toLowerCase().indexOf(q.trim().toLowerCase());
    if (pos >= 0 && q.trim()) {
      name.appendChild(document.createTextNode(full.slice(0, pos)));
      var mark = document.createElement('mark');
      mark.textContent = full.slice(pos, pos + q.trim().length);
      name.appendChild(mark);
      name.appendChild(document.createTextNode(full.slice(pos + q.trim().length)));
    } else {
      name.textContent = full;
    }
    item.appendChild(name);

    var meta = document.createElement('span');
    meta.className = 'ac-meta';
    var bits = [];
    if (s.classe) bits.push(s.classe);
    if (SERVER_MODE && currentUser && currentUser.role === 'admin') bits.push(s.niveau === 'lycee' ? 'Lycée' : 'Primaire');
    var age = ageFromBirth(s.naissance);
    if (age) bits.push(age);
    if (s.sexe) bits.push(s.sexe);
    meta.textContent = bits.join(' · ');
    item.appendChild(meta);

    box.appendChild(item);
  });
  box.hidden = false;
}

function moveAutocompleteSelection(delta) {
  var box = $('nomAutocomplete');
  if (!box || box.hidden || !acResults.length) return;
  acIndex += delta;
  if (acIndex < 0) acIndex = acResults.length - 1;
  if (acIndex >= acResults.length) acIndex = 0;
  for (var i = 0; i < box.children.length; i++) {
    box.children[i].className = 'ac-item' + (i === acIndex ? ' active' : '');
  }
}

function selectStudentAt(index) {
  var s = acResults[index];
  if (s) applyStudentToForm(s);
}

function applyStudentToForm(s) {
  var full = studentDisplayName(s);
  $('fNom').value = full;
  lastSelectedStudentName = full;
  if (s.classe) ensureSelectValue($('fClasse'), s.classe);
  var age = ageFromBirth(s.naissance);
  if (age) ensureSelectValue($('fAge'), age);
  showAutoClassAge(s, age);
  hideAutocomplete();
}

/* Ajoute la valeur au menu déroulant si elle n'y figure pas encore */
function ensureSelectValue(sel, value) {
  if (!sel || !value) return;
  var exists = false;
  for (var i = 0; i < sel.options.length; i++) {
    if (sel.options[i].value === value) { exists = true; break; }
  }
  if (!exists) {
    var o = document.createElement('option');
    o.value = value;
    o.textContent = value;
    sel.appendChild(o);
  }
  sel.value = value;
}

/* « Formulaire réduit » : classe et âge affichés automatiquement */
function showAutoClassAge(s, age) {
  var zone = $('autoClassAge');
  if (!zone) return;
  if (!s.classe && !age) { setManualClassAge(); return; }
  $('autoClasse').textContent = s.classe || '—';
  $('autoAgeTxt').textContent = age ? 'Âge : ' + age : '';
  $('autoMeta').textContent = [
    s.naissance ? 'Né(e) le ' + fmtDateFR(s.naissance) : '',
    s.sexe || ''
  ].filter(Boolean).join(' · ');
  zone.hidden = false;
  var mc = $('manualClasseField'), ma = $('manualAgeField');
  if (mc) mc.hidden = true;
  if (ma) ma.hidden = true;
}

function setManualClassAge() {
  var zone = $('autoClassAge');
  if (zone) zone.hidden = true;
  var mc = $('manualClasseField'), ma = $('manualAgeField');
  if (mc) mc.hidden = false;
  if (ma) ma.hidden = false;
}

function onNomInput() {
  if ($('fNom').value.trim() !== lastSelectedStudentName) setManualClassAge();
  renderAutocomplete();
}

/* =========================================================
   IMPORT EXCEL — lecteur ZIP + XML
   ========================================================= */
function parseZipBytes(bytes) {
  var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  var eocdPos = -1;
  var searchStart = Math.max(0, bytes.length - 65557);
  for (var i = bytes.length - 22; i >= searchStart; i--) {
    if (dv.getUint32(i, true) === 0x06054B50) { eocdPos = i; break; }
  }
  if (eocdPos < 0) throw new Error('Fichier Excel invalide (fin ZIP introuvable).');
  var cdCount = dv.getUint16(eocdPos + 10, true);
  var cdStart = dv.getUint32(eocdPos + 16, true);
  var entries = {};
  var off = cdStart;
  var decoder = new TextDecoder('utf-8');
  for (var e = 0; e < cdCount; e++) {
    if (dv.getUint32(off, true) !== 0x02014B50) throw new Error('Archive ZIP corrompue.');
    var method = dv.getUint16(off + 10, true);
    var compSize = dv.getUint32(off + 20, true);
    var nameLen = dv.getUint16(off + 28, true);
    var extraLen = dv.getUint16(off + 30, true);
    var commentLen = dv.getUint16(off + 32, true);
    var lho = dv.getUint32(off + 42, true);
    var name = decoder.decode(bytes.subarray(off + 46, off + 46 + nameLen));
    if (lho >= 0 && lho + 30 <= bytes.length) {
      var lNameLen = dv.getUint16(lho + 26, true);
      var lExtraLen = dv.getUint16(lho + 28, true);
      var dataStart = lho + 30 + lNameLen + lExtraLen;
      var data = bytes.subarray(dataStart, dataStart + compSize);
      entries[name] = { method: method, data: data };
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function inflateRaw(entry) {
  if (entry.method === 0) return Promise.resolve(entry.data);
  if (entry.method === 8) {
    if (typeof DecompressionStream === 'undefined') {
      return Promise.reject(new Error('Ce navigateur ne peut pas lire les .xlsx. Utilisez CSV.'));
    }
    var ds = new DecompressionStream('deflate-raw');
    var stream = new Blob([entry.data]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
  }
  return Promise.reject(new Error('Compression ZIP non prise en charge (' + entry.method + ').'));
}

function colIndex(ref) {
  var m = /^([A-Z]+)/.exec(String(ref || ''));
  if (!m) return 0;
  var s = m[1];
  var idx = 0;
  for (var i = 0; i < s.length; i++) idx = idx * 26 + (s.charCodeAt(i) - 64);
  return idx - 1;
}

function parseSharedStrings(sstXml) {
  var shared = [];
  if (!sstXml) return shared;
  var doc = new DOMParser().parseFromString(sstXml, 'application/xml');
  if (doc.querySelector('parsererror')) return shared;
  var sis = doc.getElementsByTagName('si');
  for (var i = 0; i < sis.length; i++) {
    var txt = '';
    var ts = sis[i].getElementsByTagName('t');
    for (var j = 0; j < ts.length; j++) txt += ts[j].textContent;
    shared.push(txt);
  }
  return shared;
}

function cellValue(cell, shared) {
  var t = cell.getAttribute('t');
  if (t === 's') {
    var iv = cell.getElementsByTagName('v')[0];
    var idx = iv ? parseInt(iv.textContent, 10) : NaN;
    return (shared[idx] !== undefined) ? shared[idx] : '';
  }
  if (t === 'inlineStr') {
    var isEl = cell.getElementsByTagName('is')[0];
    if (!isEl) return '';
    var ts = isEl.getElementsByTagName('t');
    var s = '';
    for (var i = 0; i < ts.length; i++) s += ts[i].textContent;
    return s;
  }
  var v = cell.getElementsByTagName('v')[0];
  return v ? v.textContent : '';
}

function rowsFromSheetXml(sheetXml, sstXml) {
  var shared = parseSharedStrings(sstXml);
  var doc = new DOMParser().parseFromString(sheetXml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Feuille Excel illisible (XML invalide).');
  var ns = doc.documentElement.namespaceURI || '';
  var rEls = ns ? doc.getElementsByTagNameNS(ns, 'row') : doc.getElementsByTagName('row');
  if (!rEls.length) rEls = doc.getElementsByTagName('row');
  var rows = [];
  for (var i = 0; i < rEls.length; i++) {
    var rowCells = [];
    var cells = ns ? rEls[i].getElementsByTagNameNS(ns, 'c') : rEls[i].getElementsByTagName('c');
    if (!cells.length) cells = rEls[i].getElementsByTagName('c');
    for (var j = 0; j < cells.length; j++) {
      var c = cells[j];
      var idx = colIndex(c.getAttribute('r') || '');
      rowCells[idx] = cellValue(c, shared);
    }
    rows.push(rowCells);
  }
  return rows;
}

function recordsFromRows(rows) {
  var headerIdx = -1;
  for (var i = 0; i < rows.length; i++) {
    for (var j = 0; j < rows[i].length; j++) {
      var k = normalizeKey(rows[i][j]);
      if (k === 'nom et prenoms' || k === 'nom') { headerIdx = i; break; }
    }
    if (headerIdx >= 0) break;
  }
  if (headerIdx < 0) throw new Error('En-tête du registre introuvable (colonne « Nom et prénoms » requise).');
  var idxOf = mapHeaderRow(rows[headerIdx]);
  if (idxOf.nom === undefined) throw new Error('Colonne « Nom et prénoms » introuvable.');
  if (idxOf.date === undefined) throw new Error('Colonne « Date » introuvable dans le fichier Excel.');
  var recs = [];
  for (var r = headerIdx + 1; r < rows.length; r++) {
    var row = rows[r] || [];
    var nom = getRowVal(row, idxOf.nom);
    var obs = getRowVal(row, idxOf.observations);
    var dateRaw = getRowVal(row, idxOf.date);
    if (!nom.trim() && !obs.trim() && !dateRaw.trim()) continue;
    recs.push({
      nom: nom,
      date: parseAnyDate(dateRaw),
      arrivee: getRowVal(row, idxOf.arrivee),
      classe: getRowVal(row, idxOf.classe),
      age: getRowVal(row, idxOf.age),
      observations: obs,
      traitement: getRowVal(row, idxOf.traitement),
      departClasse: getRowVal(row, idxOf.departClasse),
      departMaison: getRowVal(row, idxOf.departMaison),
      parent: getRowVal(row, idxOf.parent)
    });
  }
  return { records: recs };
}

function decodeUtf8(u8) {
  return new TextDecoder('utf-8').decode(u8);
}

/* Résout le chemin de la feuille « Registre » via workbook.xml + rels */
function findRegistreSheetPath(wbText, relsText) {
  if (!wbText) return null;
  var doc;
  try { doc = new DOMParser().parseFromString(wbText, 'application/xml'); }
  catch (e) { return null; }
  if (doc.querySelector('parsererror')) return null;
  var sheets = doc.getElementsByTagName('sheet');
  var rId = null;
  for (var i = 0; i < sheets.length; i++) {
    var nm = normalizeKey(sheets[i].getAttribute('name') || '');
    if (nm.indexOf('registre') >= 0) {
      rId = sheets[i].getAttribute('r:id') || sheets[i].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      break;
    }
  }
  if (!rId || !relsText) return null;
  try {
    var d2 = new DOMParser().parseFromString(relsText, 'application/xml');
    var rels = d2.getElementsByTagName('Relationship');
    for (var j = 0; j < rels.length; j++) {
      if ((rels[j].getAttribute('Id') || '') === rId) {
        var target = rels[j].getAttribute('Target') || '';
        if (!target) return null;
        if (target.charAt(0) === '/') return target.replace(/^\/+/, '');
        return 'xl/' + target.replace(/^\.\.\//, '');
      }
    }
  } catch (e) { return null; }
  return null;
}

function importXlsxBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  var entries = parseZipBytes(bytes);
  var names = Object.keys(entries);
  if (!names.length) throw new Error('Aucun fichier dans l’archive.');

  var sheetNames = names.filter(function (n) { return /^xl\/worksheets\/.+\.xml$/.test(n); });
  if (!sheetNames.length) throw new Error('Aucune feuille de calcul dans le fichier Excel.');
  var sstName = names.filter(function (n) { return /^xl\/sharedStrings\.xml$/.test(n); })[0] || null;
  var wbName = names.filter(function (n) { return /^xl\/workbook\.xml$/.test(n); })[0] || null;
  var relsName = names.filter(function (n) { return /^xl\/_rels\/workbook\.xml\.rels$/.test(n); })[0] || null;

  var aux = [];
  if (sstName) aux.push(sstName);
  if (wbName) aux.push(wbName);
  if (relsName) aux.push(relsName);
  var auxPos = {};
  aux.forEach(function (n, i) { auxPos[n] = i; });
  var sheetPos = {};
  sheetNames.forEach(function (n, i) { sheetPos[n] = aux.length + i; });

  return Promise.all(
    aux.map(function (n) { return inflateRaw(entries[n]); })
      .concat(sheetNames.map(function (n) { return inflateRaw(entries[n]); }))
  ).then(function (arr) {
    var sstText = sstName ? decodeUtf8(arr[auxPos[sstName]]) : '';
    var wbText = wbName ? decodeUtf8(arr[auxPos[wbName]]) : '';
    var relsText = relsName ? decodeUtf8(arr[auxPos[relsName]]) : '';

    var preferred = findRegistreSheetPath(wbText, relsText);
    var tries = [];
    if (preferred && sheetPos[preferred] !== undefined) tries.push(preferred);
    sheetNames.forEach(function (n) { if (tries.indexOf(n) === -1) tries.push(n); });

    var lastErr = null;
    for (var i = 0; i < tries.length; i++) {
      var n = tries[i];
      try {
        var sheetText = decodeUtf8(arr[sheetPos[n]]);
        var parsed = recordsFromRows(rowsFromSheetXml(sheetText, sstText));
        var added = appendImportedRecords(parsed.records);
        return { added: added, records: parsed.records };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('Aucune feuille contenant la colonne « Nom et prénoms ».');
  });
}

/* =========================================================
   ÉVÉNEMENTS
   ========================================================= */
function bindEvents() {
  $('btnAdd').addEventListener('click', function () { openModal(null); });

  $('btnCloseModal').addEventListener('click', closeModal);
  $('btnCancelVisit').addEventListener('click', closeModal);
  $('modalOverlay').addEventListener('click', function (e) { if (e.target === this) closeModal(); });
  $('visitForm').addEventListener('submit', onVisitSubmit);

  $('registerBody').addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('button[data-action]') : null;
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    var action = btn.getAttribute('data-action');
    if (action === 'edit') openModal(id);
    else if (action === 'archive') archiveVisit(id);
    else if (action === 'restore') restoreVisit(id);
  });

  $('btnImport').addEventListener('click', function (e) { e.stopPropagation(); toggleMenu('importMenu'); });
  $('btnExport').addEventListener('click', function (e) { e.stopPropagation(); toggleMenu('exportMenu'); });
  document.addEventListener('click', closeDropdowns);

  $('importMenu').addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('button[data-action]') : null;
    if (!btn) return;
    e.stopPropagation();
    closeDropdowns();
    var action = btn.getAttribute('data-action');
    if (action === 'import-excel') openFilePicker('excel');
    else if (action === 'import-csv') openFilePicker('csv');
    else if (action === 'import-students') openFilePicker('students');
    else if (action === 'import-json') openFilePicker('json');
  });

  $('exportMenu').addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('button[data-action]') : null;
    if (!btn) return;
    e.stopPropagation();
    handleExport(btn.getAttribute('data-action'));
  });

  $('fileInput').addEventListener('change', onFileInputChange);

  /* Filtres */
  var filterIds = ['filterSearch', 'filterClasse', 'filterAge', 'filterFrom', 'filterTo', 'filterArchives'];
  filterIds.forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener('input', renderTable);
    el.addEventListener('change', renderTable);
  });

  /* Boutons « Maintenant » */
  document.querySelectorAll('.btn-mini[data-time-target]').forEach(function (b) {
    b.addEventListener('click', function () { $(b.getAttribute('data-time-target')).value = nowTime(); });
  });

  /* Paramètres */
  $('btnSettings').addEventListener('click', function () {
    if ($('settingsPage').hidden) openSettingsModal();
    else closeSettingsModal();
  });
  $('btnSettingsBack').addEventListener('click', closeSettingsModal);
  $('settingsForm').addEventListener('submit', onSettingsSubmit);
  $('createUserForm').addEventListener('submit', onCreateUserSubmit);
  $('usersBody').addEventListener('click', onUsersTableClick);
  $('newUserRole').addEventListener('change', updateNewUserLevelControl);
  updateNewUserLevelControl();

    /* Authentification (mode serveur) */
    /* Authentification (mode serveur) */
  var loginForm = $('loginForm');
  if (loginForm) loginForm.addEventListener('submit', onLoginSubmit);

  var btnOpenLogin = $('btnOpenLogin');
  if (btnOpenLogin) btnOpenLogin.addEventListener('click', showLogin);

  var btnLogout = $('btnLogout');
  if (btnLogout) btnLogout.addEventListener('click', function () {
    if (confirm('Voulez-vous vous déconnecter ?')) {
      apiLogout();
    }
  });
    var btnChangePwd = $('btnChangePwd');
  if (btnChangePwd) btnChangePwd.addEventListener('click', openChangePasswordModal);
  var btnProfile = $('btnProfile');
  if (btnProfile) btnProfile.addEventListener('click', openChangePasswordModal);
  var changePwdForm = $('changePwdForm');
  if (changePwdForm) changePwdForm.addEventListener('submit', onChangePasswordSubmit);
  var btnCloseChangePwd = $('btnCloseChangePwd');
  if (btnCloseChangePwd) btnCloseChangePwd.addEventListener('click', closeChangePasswordModal);
  var btnCancelChangePwd = $('btnCancelChangePwd');
  if (btnCancelChangePwd) btnCancelChangePwd.addEventListener('click', closeChangePasswordModal);
  var changePwdOverlay = $('changePwdOverlay');
  if (changePwdOverlay) changePwdOverlay.addEventListener('click', function (e) { if (e.target === this) closeChangePasswordModal(); });

  /* Sauvegarde automatique dans un dossier */
  $('btnBackupPick').addEventListener('click', chooseBackupFolder);
  $('btnBackupNow').addEventListener('click', function () {
    if (!backupDirHandle) { chooseBackupFolder(); return; }
    performBackup('manuel').then(function (ok) {
      toast(ok ? 'Sauvegarde écrite dans « ' + backupDirHandle.name + ' ».' : 'Échec de la sauvegarde : ' + backupLastError);
    });
  });
  $('btnBackupRestore').addEventListener('click', restoreFromBackupFolder);
  $('btnBackupReactivate').addEventListener('click', reactivateBackup);
  $('btnBackupDisable').addEventListener('click', disableBackupFolder);

  /* Liste des élèves (autocomplétion) */
  $('btnStudentsImport').addEventListener('click', function () { openFilePicker('students'); });
  $('btnStudentsClear').addEventListener('click', function () {
    if (!studentsData.length) return;
    if (!confirm('Vider la liste des élèves ? L\'autocomplétion sera désactivée.')) return;
    studentsData = [];
    saveStudents();
    updateStudentsUI();
    toast('Liste des élèves vidée.');
  });

  /* Autocomplétion du champ « Nom et prénoms » */
  $('fNom').addEventListener('input', onNomInput);
  $('fNom').addEventListener('keydown', function (e) {
    var box = $('nomAutocomplete');
    if (box && !box.hidden && acResults.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveAutocompleteSelection(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveAutocompleteSelection(-1); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        selectStudentAt(acIndex >= 0 ? acIndex : 0);
        return;
      }
    }
    if (e.key === 'Escape') hideAutocomplete();
  });
  $('fNom').addEventListener('blur', function () { setTimeout(hideAutocomplete, 150); });
  $('nomAutocomplete').addEventListener('mousedown', function (e) {
    var item = e.target.closest ? e.target.closest('.ac-item') : null;
    if (!item) return;
    e.preventDefault();
    selectStudentAt(parseInt(item.getAttribute('data-index'), 10));
  });
  $('btnManualClassAge').addEventListener('click', setManualClassAge);

  $('btnPrint').addEventListener('click', function () {
    var pd = $('printDate');
    if (pd) pd.textContent = 'Édité le ' + fmtDateTimeFR(new Date());
    window.print();
  });

  /* Installation en tant qu'application (PWA) */
  $('btnInstallApp').addEventListener('click', function () {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(function () {
      deferredInstallPrompt = null;
      $('btnInstallApp').hidden = true;
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeModal();
      closeSettingsModal();
      closeDropdowns();
    }
  });
}

function openSettingsModal() {
  if (SERVER_MODE && (!currentUser || currentUser.role !== 'admin')) {
    toast('Accès réservé à l’administrateur.');
    return;
  }
  $('sSchool').value = settings.ecole;
  $('sTitle').value = settings.titre;
  $('sYearStart').value = settings.anneeDebut;
  $('sYearEnd').value = settings.anneeFin;
  updateBackupUI();
  updateStudentsUI();
  $('mainContent').hidden = true;
  $('appFooter').hidden = true;
  $('settingsPage').hidden = false;
  $('usersPanel').hidden = !SERVER_MODE;
  $('btnSettings').textContent = '← Retour au registre';
  if (SERVER_MODE) loadUsers();
}

function closeSettingsModal() {
  $('settingsPage').hidden = true;
  $('mainContent').hidden = false;
  $('appFooter').hidden = false;
  $('btnSettings').textContent = '⚙️ Paramètres';
}

function onSettingsSubmit(e) {
  e.preventDefault();
  if (SERVER_MODE && (!currentUser || currentUser.role !== 'admin')) {
    closeSettingsModal();
    toast('Accès réservé à l’administrateur.');
    return;
  }
  settings.ecole = $('sSchool').value.trim() || DEFAULT_SETTINGS.ecole;
  settings.titre = $('sTitle').value.trim() || DEFAULT_SETTINGS.titre;
  settings.anneeDebut = $('sYearStart').value || DEFAULT_SETTINGS.anneeDebut;
  settings.anneeFin = $('sYearEnd').value || DEFAULT_SETTINGS.anneeFin;
  saveSettings();
  renderAll();
  closeSettingsModal();
  toast('Paramètres enregistrés.');
}

function loadUsers() {
  var status = $('usersStatus');
  if (!SERVER_MODE || !currentUser || currentUser.role !== 'admin') return;
  if (status) { status.textContent = 'Chargement des comptes…'; status.className = 'backup-status off'; }
  apiFetch('/users').then(function (r) {
    if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || 'Erreur de chargement'); });
    return r.json();
  }).then(function (users) {
    var body = $('usersBody');
    body.textContent = '';
    users.forEach(function (user) {
      var tr = document.createElement('tr');
      var username = document.createElement('td'); username.textContent = user.username;
      var name = document.createElement('td'); name.textContent = [user.nom, user.prenoms].filter(Boolean).join(' ') || '—';
      var role = document.createElement('td'); role.textContent = user.role === 'admin' ? 'Administrateur' : 'Utilisateur';
      var level = document.createElement('td'); level.textContent = user.role === 'admin' || user.niveau === 'all' ? 'Tous' : (user.niveau === 'lycee' ? 'Lycée' : 'Primaire');
      var action = document.createElement('td');
      if (Number(user.id) !== Number(currentUser.id)) {
        var remove = document.createElement('button');
        remove.type = 'button'; remove.className = 'btn btn-secondary btn-user-delete';
        remove.textContent = 'Supprimer'; remove.setAttribute('data-user-id', user.id);
        action.appendChild(remove);
      } else { action.textContent = 'Compte actuel'; }
      tr.appendChild(username); tr.appendChild(name); tr.appendChild(role); tr.appendChild(level); tr.appendChild(action);
      body.appendChild(tr);
    });
    if (status) { status.textContent = users.length + ' compte' + (users.length > 1 ? 's' : '') + ' enregistré' + (users.length > 1 ? 's' : '') + '.'; status.className = 'backup-status on'; }
  }).catch(function (err) {
    if (status) { status.textContent = err.message; status.className = 'backup-status error'; }
  });
}

function onCreateUserSubmit(e) {
  e.preventDefault();
  if (!SERVER_MODE || !currentUser || currentUser.role !== 'admin') return;
  var username = $('newUsername').value.trim();
  var password = $('newUserPassword').value;
  var role = $('newUserRole').value;
  var niveau = $('newUserLevel').value;
  if (password.length < 8) { alert('Le mot de passe doit contenir au moins 8 caractères.'); return; }
  apiFetch('/users', { method: 'POST', body: { username: username, password: password, role: role, niveau: niveau } })
    .then(function (r) {
      if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || 'Création impossible'); });
      return r.json();
    }).then(function () {
      $('createUserForm').reset();
      updateNewUserLevelControl();
      loadUsers();
      toast('Utilisateur créé.');
    }).catch(function (err) { alert('Erreur : ' + err.message); });
}

function updateNewUserLevelControl() {
  var role = $('newUserRole');
  var level = $('newUserLevel');
  if (role && level) level.disabled = role.value === 'admin';
}

function onUsersTableClick(e) {
  var button = e.target.closest ? e.target.closest('button[data-user-id]') : null;
  if (!button || !currentUser || currentUser.role !== 'admin') return;
  var id = button.getAttribute('data-user-id');
  if (!confirm('Supprimer ce compte utilisateur ?')) return;
  apiFetch('/users/' + encodeURIComponent(id), { method: 'DELETE' }).then(function (r) {
    if (!r.ok) return r.json().then(function (err) { throw new Error(err.error || 'Suppression impossible'); });
    loadUsers();
    toast('Utilisateur supprimé.');
  }).catch(function (err) { alert('Erreur : ' + err.message); });
}

/* ---------- Changement de mot de passe (mode serveur) ---------- */
function openChangePasswordModal() {
  var modal = $('changePwdOverlay');
  if (!SERVER_MODE || !currentUser) return;
  if (modal) {
    $('profileNom').value = currentUser.nom || '';
    $('profilePrenoms').value = currentUser.prenoms || '';
    $('changePwdCurrent').value = '';
    $('changePwdPassword').value = '';
    $('changePwdPassword2').value = '';
    modal.hidden = false;
    $('profileNom').focus();
  }
}

function closeChangePasswordModal() {
  var modal = $('changePwdOverlay');
  if (modal) { modal.hidden = true; }
  // Si l'utilisateur n'est pas connecté, revenir à l'écran de connexion
  if (!currentUser) {
    var loginOv = $('loginOverlay');
    if (loginOv) { loginOv.hidden = false; }
  }
}

function onChangePasswordSubmit(e) {
  e.preventDefault();
  var current = $('changePwdCurrent').value;
  var pwd1 = $('changePwdPassword').value;
  var pwd2 = $('changePwdPassword2').value;
  if (pwd1 || pwd2) {
    if (!current) { alert('Saisissez votre mot de passe actuel pour le modifier.'); return; }
    if (pwd1 !== pwd2) { alert('Les deux mots de passe ne correspondent pas.'); return; }
    if (pwd1.length < 8) { alert('Le nouveau mot de passe doit contenir au moins 8 caractères.'); return; }
  }

  apiFetch('/auth/profile', {
    method: 'POST',
    body: { nom: $('profileNom').value.trim(), prenoms: $('profilePrenoms').value.trim(), currentPassword: current, password: pwd1 }
  }).then(function (r) {
    if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || 'Erreur'); });
    return r.json();
  }).then(function (result) {
    currentUser = result.user;
    updateAuthStatus();
    closeChangePasswordModal();
    toast('Profil enregistré.');
  }).catch(function (err) {
    alert('Erreur : ' + err.message);
  });
}

/* =========================================================
   SAUVEGARDE AUTOMATIQUE DANS UN DOSSIER (File System Access)
   Le dossier est choisi une fois via Paramètres, mémorisé dans
   IndexedDB, puis chaque modification y est écrite en silence :
   - registre-infirmerie-sauvegarde.json  (dernier état complet)
   - sauvegarde-JJ-MM-AAAA.json           (copie datée par jour)
   ========================================================= */
var backupDirHandle = null;        // handle du dossier choisi
var backupNeedsPermission = false; // autorisation à réactiver (nouvelle session)
var backupLastError = null;
var backupLastOkAt = null;         // Date de la dernière écriture réussie (session)
var backupTimer = null;            // temporisation anti-écriture en rafale
var backupBusy = false;            // une écriture est en cours
var BACKUP_DEBOUNCE_MS = 1200;
var BACKUP_MAIN_FILE = 'registre-infirmerie-sauvegarde.json';
var BACKUP_DAILY_PREFIX = 'sauvegarde-';
var BACKUP_DAILY_SUFFIX = '.json';
var BACKUP_MAX_DAILY = 30;         // purge des copies quotidiennes trop anciennes
var IDB_NAME = 'registre-infirmerie-fs';
var IDB_STORE = 'handles';

/* =========================================================
   INSTALLATION EN TANT QU'APPLICATION (PWA)
   ========================================================= */
var deferredInstallPrompt = null;

function canRegisterServiceWorker() {
  if (!('serviceWorker' in navigator)) return false;
  if (location.protocol === 'file:') return false;
  return location.protocol === 'https:' ||
    location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}

if (canRegisterServiceWorker()) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js').then(function () {
      document.body.setAttribute('data-sw', 'ok');
    })['catch'](function (err) {
      document.body.setAttribute('data-sw', 'erreur: ' + (err && err.message ? err.message : String(err)));
    });
  });
}

window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  deferredInstallPrompt = e;
  var b = $('btnInstallApp');
  if (b) b.hidden = false;
});

window.addEventListener('appinstalled', function () {
  deferredInstallPrompt = null;
  var b = $('btnInstallApp');
  if (b) b.hidden = true;
  toast('Application installée : raccourci ajouté au menu Démarrer.');
});

function buildBackupPayload() {
  return {
    application: "Registre d'infirmerie — École Jules Verne",
    version: 2,
    exportedAt: new Date().toISOString(),
    settings: settings,
    data: data,
    eleves: studentsData
  };
}

/* ---------- Mémorisation du dossier (IndexedDB) ---------- */
function idbOpen() {
  return new Promise(function (resolve, reject) {
    var rq = indexedDB.open(IDB_NAME, 1);
    rq.onupgradeneeded = function () { rq.result.createObjectStore(IDB_STORE); };
    rq.onsuccess = function () { resolve(rq.result); };
    rq.onerror = function () { reject(rq.error); };
  });
}

function idbSet(key, val) {
  return idbOpen().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(val, key);
      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}

function idbGet(key) {
  return idbOpen().then(function (db) {
    return new Promise(function (resolve, reject) {
      var rq = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
      rq.onsuccess = function () { resolve(rq.result || null); };
      rq.onerror = function () { reject(rq.error); };
    });
  });
}

function idbDel(key) {
  return idbOpen().then(function (db) {
    return new Promise(function (resolve) {
      var tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE)['delete'](key);
      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { resolve(false); };
    });
  });
}

/* ---------- Primitives fichiers ---------- */
function backupSupported() {
  return typeof window.showDirectoryPicker === 'function';
}

function verifyBackupPermission(handle, askUser) {
  var opts = { mode: 'readwrite' };
  return handle.queryPermission(opts).then(function (st) {
    if (st === 'granted') return true;
    if (!askUser) return false;
    return handle.requestPermission(opts).then(function (st2) { return st2 === 'granted'; });
  });
}

function writeTextToDir(dirHandle, name, text) {
  return dirHandle.getFileHandle(name, { create: true }).then(function (fh) {
    return fh.createWritable().then(function (w) {
      return w.write(new Blob([text], { type: 'application/json;charset=utf-8' })).then(function () {
        return w.close();
      });
    });
  });
}

function readTextFromDir(dirHandle, name) {
  return dirHandle.getFileHandle(name).then(function (fh) {
    return fh.getFile().then(function (f) { return f.text(); });
  });
}

function listBackupEntries(dirHandle) {
  return new Promise(function (resolve, reject) {
    if (!dirHandle.values) { resolve([]); return; }
    var it = dirHandle.values(), out = [];
    (function step() {
      it.next().then(function (r) {
        if (r.done) { resolve(out); return; }
        out.push(r.value);
        step();
      })['catch'](reject);
    })();
  });
}

function parseDailyName(name) {
  var m = name.match(/^sauvegarde-(\d{2})-(\d{2})-(\d{4})\.json$/);
  return m ? (m[3] + '-' + m[2] + '-' + m[1]) : null; // AAAA-MM-JJ
}

function purgeOldDailies(dirHandle) {
  return listBackupEntries(dirHandle).then(function (entries) {
    var dailies = [];
    entries.forEach(function (en) {
      if (en.kind !== 'file') return;
      var d = parseDailyName(en.name);
      if (d) dailies.push({ name: en.name, date: d });
    });
    dailies.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    var chain = Promise.resolve();
    dailies.slice(BACKUP_MAX_DAILY).forEach(function (d) {
      chain = chain.then(function () { return dirHandle.removeEntry(d.name); })['catch'](function () { /* ignore */ });
    });
    return chain;
  });
}

/* ---------- Écriture de la sauvegarde ---------- */
var BACKUP_TS_KEY = 'registre_infirmerie_jules_verne_backup_ts';

function performBackup() {
  if (!backupDirHandle || backupBusy) return Promise.resolve(false);
  backupBusy = true;
  updateBackupUI();
  var json = JSON.stringify(buildBackupPayload(), null, 2);
  var dailyName = BACKUP_DAILY_PREFIX + fmtDateFileFR() + BACKUP_DAILY_SUFFIX;
  return verifyBackupPermission(backupDirHandle, false).then(function (ok) {
    if (!ok) {
      backupNeedsPermission = true;
      return false;
    }
    return writeTextToDir(backupDirHandle, BACKUP_MAIN_FILE, json)
      .then(function () { return writeTextToDir(backupDirHandle, dailyName, json); })
      .then(function () { return purgeOldDailies(backupDirHandle); })
      .then(function () {
        backupLastError = null;
        backupNeedsPermission = false;
        backupLastOkAt = new Date();
        try { localStorage.setItem(BACKUP_TS_KEY, String(backupLastOkAt.getTime())); } catch (e2) { /* ignore */ }
        return true;
      });
  })['catch'](function (e) {
    backupLastError = (e && e.message) ? e.message : String(e);
    return false;
  }).then(function (ok) {
    backupBusy = false;
    updateBackupUI();
    return ok;
  });
}

/* Écriture différée : évite un fichier réécrit à chaque frappe */
function scheduleBackup() {
  if (!backupDirHandle || backupNeedsPermission) return;
  if (backupTimer) clearTimeout(backupTimer);
  backupTimer = setTimeout(function () {
    backupTimer = null;
    performBackup();
  }, BACKUP_DEBOUNCE_MS);
}

/* ---------- Interface de la boîte Paramètres ---------- */
function updateBackupUI() {
  var box = $('backupStatus');
  if (!box) return;
  var pick = $('btnBackupPick'), now = $('btnBackupNow'), rest = $('btnBackupRestore'),
      react = $('btnBackupReactivate'), dis = $('btnBackupDisable');
  function setCls(c) { box.className = 'backup-status ' + c; }

  if (!backupSupported()) {
    setCls('off');
    box.textContent = 'Sauvegarde automatique : non prise en charge par ce navigateur. Utilisez Microsoft Edge ou Google Chrome, ou passez par Exporter → Sauvegarde complète (JSON).';
    pick.hidden = true; now.hidden = true; rest.hidden = true; react.hidden = true; dis.hidden = true;
    return;
  }
  pick.hidden = false;
  if (!backupDirHandle) {
    setCls('off');
    box.textContent = 'Sauvegarde automatique : désactivée. Cliquez sur « Choisir le dossier… » puis sélectionnez le dossier sauvegarde de l’application.';
    now.hidden = true; rest.hidden = true; react.hidden = true; dis.hidden = true;
    return;
  }

  var lastTxt = '';
  var ts = null;
  try { ts = localStorage.getItem(BACKUP_TS_KEY); } catch (e3) { /* ignore */ }
  if (backupLastOkAt) lastTxt = ' · dernière écriture : ' + fmtDateTimeFR(backupLastOkAt);
  else if (ts) lastTxt = ' · dernière écriture : ' + fmtDateTimeFR(new Date(parseInt(ts, 10)));

  if (backupBusy) {
    setCls('off');
    box.textContent = 'Sauvegarde en cours dans « ' + backupDirHandle.name + ' »…';
  } else if (backupLastError) {
    setCls('error');
    box.textContent = 'Échec de sauvegarde (' + backupLastError + ')' + lastTxt;
  } else if (backupNeedsPermission) {
    setCls('warn');
    box.textContent = 'Autorisation à réactiver pour « ' + backupDirHandle.name + ' » : cliquez sur 🔑 Réactiver l’autorisation.';
  } else {
    setCls('on');
    box.textContent = 'Sauvegarde automatique active — dossier « ' + backupDirHandle.name + ' »' + lastTxt;
  }
  now.hidden = false; rest.hidden = false; dis.hidden = false;
  react.hidden = !backupNeedsPermission;
}

/* ---------- Choix du dossier, autorisation, désactivation ---------- */
var IDB_DIR_KEY = 'backupDirHandle';

function chooseBackupFolder() {
  if (!backupSupported()) { updateBackupUI(); return; }
  window.showDirectoryPicker({ mode: 'readwrite' }).then(function (handle) {
    return verifyBackupPermission(handle, true).then(function (granted) {
      if (!granted) {
        backupLastError = 'autorisation refusée pour ce dossier';
        updateBackupUI();
        return;
      }
      backupDirHandle = handle;
      backupNeedsPermission = false;
      backupLastError = null;
      return idbSet(IDB_DIR_KEY, handle).then(function () {
        updateBackupUI();
        toast('Sauvegarde automatique : dossier « ' + handle.name + ' » activé.');
        performBackup();
      });
    });
  })['catch'](function (e) {
    if (e && (e.name === 'AbortError' || e.code === 20)) return; /* sélection annulée par l'utilisateur */
    backupLastError = (e && e.message) ? e.message : String(e);
    updateBackupUI();
  });
}

function reactivateBackup() {
  if (!backupDirHandle) { updateBackupUI(); return; }
  verifyBackupPermission(backupDirHandle, true).then(function (granted) {
    if (!granted) {
      backupNeedsPermission = true;
      updateBackupUI();
      toast('Autorisation toujours refusée pour « ' + backupDirHandle.name + ' ».', true);
      return;
    }
    backupNeedsPermission = false;
    backupLastError = null;
    updateBackupUI();
    performBackup();
  })['catch'](function (e) {
    backupLastError = (e && e.message) ? e.message : String(e);
    updateBackupUI();
  });
}

function disableBackupFolder() {
  backupDirHandle = null;
  backupNeedsPermission = false;
  backupLastError = null;
  if (backupTimer) { clearTimeout(backupTimer); backupTimer = null; }
  idbDel(IDB_DIR_KEY)['catch'](function () { /* ignore */ });
  updateBackupUI();
  toast('Sauvegarde automatique désactivée.');
}

function restoreFromBackupFolder() {
  if (!backupDirHandle) { chooseBackupFolder(); return; }
  verifyBackupPermission(backupDirHandle, true).then(function (granted) {
    if (!granted) {
      backupNeedsPermission = true;
      updateBackupUI();
      return;
    }
    return readTextFromDir(backupDirHandle, BACKUP_MAIN_FILE).then(function (text) {
      var res = importJsonText(text); /* restaure les données, sauvegarde et ré-affiche */
      toast('Restauration réussie depuis « ' + backupDirHandle.name + ' » : ' + res.dataCount + ' visite(s).');
    });
  })['catch'](function (e) {
    if (e && e.name === 'NotFoundError') {
      toast('Aucun fichier « ' + BACKUP_MAIN_FILE + ' » dans ce dossier.', true);
      return;
    }
    toast('Restauration impossible : ' + ((e && e.message) ? e.message : String(e)), true);
  });
}

/* ---------- Démarrage : reprise du dossier mémorisé (IndexedDB) ---------- */
function initBackupSystem() {
  if (!backupSupported()) { updateBackupUI(); return; }
  idbGet(IDB_DIR_KEY).then(function (handle) {
    if (!handle) { updateBackupUI(); return; }
    backupDirHandle = handle;
    return verifyBackupPermission(handle, false).then(function (granted) {
      backupNeedsPermission = !granted;
      updateBackupUI();
    });
  })['catch'](function () { updateBackupUI(); });
}

/* ---------- Traitement du fichier choisi ---------- */
function onFileInputChange() {
  var file = this.files && this.files[0];
  var action = pendingImportAction;
  pendingImportAction = '';
  if (!file) return;

  if (action === 'excel') {
    var r = new FileReader();
    r.onload = function (ev) {
      importXlsxBytes(new Uint8Array(ev.target.result)).then(function (res) {
        toast('Import Excel terminé : ' + res.added + ' visite(s) ajoutée(s).');
      }, function (err) {
        alert('Import Excel impossible : ' + err.message + '\n\nAstuce : dans Excel, « Enregistrer sous » en format CSV puis utiliser « Importer CSV ».');
      });
    };
    r.readAsArrayBuffer(file);
  } else if (action === 'csv') {
    var r2 = new FileReader();
    r2.onload = function (ev) {
      try {
        var res = importCsvText(String(ev.target.result));
        toast('Import CSV terminé : ' + res.added + ' visite(s) ajoutée(s).');
      } catch (err) {
        alert('Import CSV impossible : ' + err.message);
      }
    };
    r2.readAsText(file, 'UTF-8');
  } else if (action === 'json') {
    var r3 = new FileReader();
    r3.onload = function (ev) {
      try {
        var res = importJsonText(String(ev.target.result));
        toast('Sauvegarde restaurée (' + res.dataCount + ' visites).');
      } catch (err) {
        alert('Restauration impossible : ' + err.message);
      }
    };
    r3.readAsText(file, 'UTF-8');
  } else if (action === 'students') {
    var isCsv = /\.csv$/i.test(file.name || '');
    if (isCsv) {
      var r4 = new FileReader();
      r4.onload = function (ev) {
        try {
          var n = applyStudentsList(studentsFromRows(parseCSV(String(ev.target.result))));
          toast('Liste des élèves importée : ' + n + ' élève(s).');
        } catch (err) {
          alert('Import de la liste des élèves impossible : ' + err.message);
        }
      };
      r4.readAsText(file, 'UTF-8');
    } else {
      var r5 = new FileReader();
      r5.onload = function (ev) {
        importStudentsXlsxBytes(new Uint8Array(ev.target.result)).then(function (res) {
          var n2 = applyStudentsList(res.students);
          toast('Liste des élèves importée : ' + n2 + ' élève(s).');
        }, function (err) {
          alert('Import de la liste des élèves impossible : ' + err.message);
        });
      };
      r5.readAsArrayBuffer(file);
    }
  }
}

/* =========================================================
   AUTO-TESTS (?selftest=1) — validation automatique
   ========================================================= */
function bytesToBase64(bytes) {
  var bin = '';
  for (var i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
  }
  return btoa(bin);
}

function base64ToBytes(b64) {
  var bin = atob(b64);
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function makeSampleVisits() {
  return [
    { numero: 1, date: '2026-09-01', arrivee: '11:15', nom: 'Kouamé Alain Xavier', classe: 'CM1A', age: '10 ans', observations: 'Fièvre', traitement: 'Paracétamol', departClasse: '11:25', departMaison: '', parent: 'Oui' },
    { numero: 2, date: '2026-09-02', arrivee: '08:40', nom: 'Dupont Marie', classe: 'CE2B', age: '8 ans', observations: 'Maux de tête', traitement: '', departClasse: '', departMaison: '09:00', parent: 'Oui' },
    { numero: 3, date: '2025-10-15', arrivee: '09:30', nom: 'Martin Léo', classe: 'GSB', age: '5 ans', observations: 'Écorchure au genou', traitement: 'Désinfection + pansement', departClasse: '09:50', departMaison: '', parent: '' }
  ];
}

function finishSelftest(results) {
  var el = document.getElementById('js-error');
  el.hidden = false;
  el.textContent = results.join('\n');
  document.title = 'SELFTEST';
}

function runSelfTest() {
  var results = [];
  /* Instantané des données réelles : le selftest ne doit RIEN modifier */
  var snapshot = JSON.parse(JSON.stringify(data));
  function restore() {
    data = snapshot;
    saveData();
    renderAll();
    results.push('data_restored=' + data.length);
  }
  function done() {
    var blob = '|' + results.join('|') + '|';
    results.push('RESULT=' + (/_KO=|_KO\||=KO\|/i.test(blob) ? 'HAS_KO' : 'ALL_OK'));
    finishSelftest(results);
  }
  try {
    var enc = new TextEncoder();

    /* 0. Formats de date français : affichage, re-import, série Excel, nom de fichier */
    var dfrOk = fmtDateFR('2026-09-01') === '01/09/2026' &&
      parseAnyDate('01/09/2026') === '2026-09-01' &&
      parseAnyDate('1/9/2026') === '2026-09-01' &&
      parseAnyDate('46266') === '2026-09-01' &&
      fmtDateFileFR().indexOf('/') === -1;
    results.push('dateFR=' + (dfrOk ? 'OK' : 'KO'));

    /* 1. CRC32 — vecteur de référence connu */
    var crc = crc32(enc.encode('123456789'), 0, 9);
    results.push('crc32=' + crc.toString(16).toLowerCase() + (crc === 0xCBF43926 ? '_OK' : '_KO'));

    /* 2. Archive ZIP : construction puis relecture du contenu */
    var zip = buildZip([{ name: 'test.txt', data: enc.encode('Bonjour Jules Verne') }]);
    results.push('zip_len=' + zip.length);
    var zipEntry = parseZipBytes(zip)['test.txt'];
    var zipCheck = zipEntry
      ? inflateRaw(zipEntry).then(function (u8) {
          results.push('zip_content=' + (decodeUtf8(u8) === 'Bonjour Jules Verne' ? 'OK' : 'KO'));
        }).catch(function (e) {
          results.push('ZIP_CONTENT_KO=' + e.message);
        })
      : Promise.resolve(results.push('ZIP_CONTENT_KO=entrée test.txt absente'));

    /* 3. Export XLSX */
    var xlsx = buildXlsxBytes(makeSampleVisits());
    results.push('xlsx_len=' + xlsx.length);

    /* 4. Export + import CSV (round-trip texte) */
    var csv = buildCsv(makeSampleVisits());
    results.push('csv_head=' + encodeURIComponent(csv.split('\r\n')[0]));
    try {
      var csvRes = importCsvText(csv);
      results.push('csv_import_added=' + csvRes.added);
      if (csvRes.added > 0) {
        var c0 = data[data.length - csvRes.added];
        results.push('csv_first=' + encodeURIComponent(JSON.stringify({ nom: c0.nom, classe: c0.classe, date: c0.date, arrivee: c0.arrivee, departClasse: c0.departClasse })));
      }
    } catch (ec) {
      results.push('CSV_IMPORT_KO=' + ec.message);
    }

    /* 5. Ré-import de l'export XLSX (aller-retour binaire) */
    importXlsxBytes(xlsx).then(function (res) {
      results.push('roundtrip_added=' + res.added);
      var r0 = res.records[0] || {};
      results.push('roundtrip_first=' + encodeURIComponent(JSON.stringify({ nom: r0.nom, classe: r0.classe, date: r0.date, arrivee: r0.arrivee })));
      return zipCheck;
    }).catch(function (err) {
      results.push('ROUNDTRIP_KO=' + err.message);
      return zipCheck;
    }).then(function () {
      restore();
      done();
    });
  } catch (e) {
    results.push('EXCEPTION=' + e.message);
    restore();
    done();
  }
}

/* =========================================================
   INITIALISATION
   ========================================================= */
function init() {
  bindEvents();

  // Détection du mode serveur (backend Node.js present)
  detectServerMode().then(function () {
    if (SERVER_MODE) {
      initServerMode();
    } else {
      initLocalMode();
    }
  }).catch(function () {
    initLocalMode();
  });
}

/* --- Mode local (PWA hors ligne) : localStorage --- */
function initLocalMode() {
  loadSettings();
  loadData();
  loadStudents();
  renderFilters();
  populateFormSelects();
  applySettingsUI();
  renderAll();
  initBackupSystem();
  var params = new URLSearchParams(location.search);
  if (params.get('selftest') === '1') setTimeout(runSelfTest, 200);
}

/* --- Mode serveur : authentification + synchronisation --- */
function initServerMode() {
  // Montrer le verrouillage (l'appContent reste dans le DOM mais est couvert)
  var lock = $('serverAuthLock');
  if (lock) lock.hidden = false;

  verifyAuthToken().then(function (user) {
    if (user) {
      currentUser = user;
      showAppContent();
      loadServerDataAndRender();
      startPolling();
    } else {
      showLogin();
    }
    var params = new URLSearchParams(location.search);
    if (params.get('selftest') === '1') setTimeout(runSelfTest, 200);
  });
}

/* Charge toutes les données depuis le serveur, puis rendu */
function loadServerDataAndRender() {
  syncLoadAll().then(function () {
    renderFilters();
    populateFormSelects();
    applySettingsUI();
    renderAll();
  }).catch(function (err) {
    console.error('Erreur de chargement serveur :', err);
    alert('Impossible de charger les données depuis le serveur : ' + err.message);
    // Revenir au mode local en fallback
    SERVER_MODE = false;
    initLocalMode();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

window.RegistreApp = {
  importXlsxBytes: importXlsxBytes,
  importCsvText: importCsvText,
  importJsonText: importJsonText,
  buildXlsxBytes: buildXlsxBytes,
  buildCsv: buildCsv,
  parseZipBytes: parseZipBytes,
  base64ToBytes: base64ToBytes,
  bytesToBase64: bytesToBase64,
    getData: function () { return data; },
  // --- Mode serveur ---
  apiFetch: apiFetch,
  apiLogin: apiLogin,
  apiLogout: apiLogout,
  detectServerMode: detectServerMode,
  syncLoadAll: syncLoadAll,
  syncSaveAll: syncSaveAll,
  getServerMode: function () { return SERVER_MODE; },
  getCurrentUser: function () { return currentUser; },
  _backupTest: {
    setHandle: function (h) { backupDirHandle = h; },
    performBackup: performBackup,
    buildBackupPayload: buildBackupPayload,
    updateBackupUI: updateBackupUI,
    scheduleBackup: scheduleBackup,
    purgeOldDailies: purgeOldDailies,
    storeHandle: function (h) { return idbSet('backupDir', h); },
    readStoredHandle: function () { return idbGet('backupDir'); }
  }
};
