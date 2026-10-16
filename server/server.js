'use strict';

/* =========================================================
   Serveur multi-utilisateurs — Registre d'infirmerie
   École Jules Verne
   ---------------------------------------------------------
   - API REST sécurisée par JWT (bcrypt pour les mots de passe)
   - Base de données SQLite partagée (module intégré node:sqlite,
     repli JSON automatique — voir store.js)
   - Service des fichiers statiques de l'application (liste blanche)
   - Comptes par défaut : admin/admin123 et medecin/medecin123
   ========================================================= */

/* Masque uniquement l'avertissement « experimental » de node:sqlite
   sans masquer les autres avertissements Node.js. */
var _emitWarning = process.emitWarning.bind(process);
process.emitWarning = function (warning) {
  var msg = warning && warning.message ? warning.message : String(warning || '');
  if (msg.indexOf('SQLite') !== -1) return;
  return _emitWarning.apply(null, arguments);
};

var express = require('express');
var bcrypt = require('bcryptjs');
var jwt = require('jsonwebtoken');
var cors = require('cors');
var path = require('path');
var fs = require('fs');
var os = require('os');

var storage = require('./store');
var createStore = storage.createStore;

var app = express();
var PORT = process.env.PORT || 8461;
var SECRET_KEY = process.env.JWT_SECRET || 'infirmerie-jv-secret-key-2026';
var APP_ROOT = path.join(__dirname, '..');
var SEED_PATH = process.env.SEED_PATH ||
  path.join(APP_ROOT, 'sauvegarde', 'registre-infirmerie-sauvegarde.json');

var store = createStore();

/* ---------- Initialisation : comptes + données par défaut ---------- */
function seedUsers() {
  if (store.countUsers() > 0) return;
  (store.defaultUsers || []).forEach(function (u) {
    try {
      store.createUser(u.username, bcrypt.hashSync(u.password, 10), u.role);
      console.log('  Compte créé : ' + u.username + ' / ' + u.password + ' (à changer !)');
    } catch (e) { /* déjà existant */ }
  });
}

function seedFromBackup() {
  try {
    if (store.countVisits() > 0) return;              // base déjà peuplée
    if (!fs.existsSync(SEED_PATH)) return;            // aucune sauvegarde à importer
    var d = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
    var visits = Array.isArray(d.data) ? d.data : (Array.isArray(d.visits) ? d.visits : []);
    if (!visits.length) return;
    store.saveAll({
      visits: visits,
      settings: d.settings && typeof d.settings === 'object' ? d.settings : {},
      students: Array.isArray(d.eleves) ? d.eleves : (Array.isArray(d.students) ? d.students : [])
    });
    console.log('  Données initiales importées : ' + visits.length + ' visites (depuis ' +
      path.basename(SEED_PATH) + ')');
  } catch (e) {
    console.warn('  Import des données initiales impossible : ' + e.message);
  }
}

seedUsers();
seedFromBackup();

/* ---------- Middlewares ---------- */
app.use(cors());
app.use(express.json({ limit: '10mb' }));

/* ---------- Fichiers statiques (liste blanche stricte) ----------
   On ne sert QUE les fichiers de l'application : la base de
   données, les sauvegardes et node_modules ne sont jamais exposés. */
var STATIC_FILES = ['index.html', 'app.js', 'styles.css', 'sw.js', 'manifest.webmanifest'];
STATIC_FILES.forEach(function (name) {
  app.get('/' + name, function (req, res) {
    res.sendFile(path.join(APP_ROOT, name));
  });
});
app.use('/assets', express.static(path.join(APP_ROOT, 'assets'), { maxAge: '1d' }));
app.get('/', function (req, res) {
  res.sendFile(path.join(APP_ROOT, 'index.html'));
});

/* ---------- Authentification ---------- */
function authenticate(req, res, next) {
  var header = String(req.headers.authorization || '');
  var token = header.indexOf('Bearer ') === 0 ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Connexion requise' });
  try {
    req.user = jwt.verify(token, SECRET_KEY);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session expirée, reconnectez-vous' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ error: 'Droits administrateur requis' });
}

function publicUser(u) {
  return { id: u.id, username: u.username, role: u.role, niveau: u.role === 'admin' ? 'all' : (u.niveau || 'primaire'), nom: u.nom || '', prenoms: u.prenoms || '' };
}

function normalizeLevel(level, classe) {
  var classKey = String(classe || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (['2A', '1A', 'TA'].indexOf(classKey) !== -1) return 'lycee';
  if (['TPS', 'PSA', 'PSB', 'MSA', 'MSB', 'GSA', 'GSB', 'CPA', 'CPB', 'CPC', 'CE1A', 'CE1B', 'CE1C', 'CE2A', 'CE2B', 'CE2C', 'CM1A', 'CM1B', 'CM1C', 'CM2A', 'CM2B', 'CM2C', 'PERSONNEL'].indexOf(classKey) !== -1) return 'primaire';
  var value = String(level || '').trim().toLowerCase();
  if (value === 'lycee' || value === 'lycée' || value === 'secondaire') return 'lycee';
  if (value === 'primaire' || value === 'primary') return 'primaire';
  return 'primaire';
}

function withLevel(item) {
  var copy = Object.assign({}, item);
  copy.niveau = normalizeLevel(copy.niveau, copy.classe);
  return copy;
}

/* ---------- API : détection + authentification ---------- */
app.get('/api/config', function (req, res) {
  res.json({ serverMode: true, backend: store.backend, version: 2 });
});

app.post('/api/auth/login', function (req, res) {
  var username = String(req.body.username || '').trim();
  var password = String(req.body.password || '');
  if (!username || !password) {
    return res.status(400).json({ error: "Nom d'utilisateur et mot de passe requis" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });
  }
  var user = store.findUserByUsername(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }
  var token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    SECRET_KEY,
    { expiresIn: '12h' }
  );
  res.json({ token: token, user: publicUser(user) });
});

app.get('/api/auth/verify', authenticate, function (req, res) {
  var user = store.findUserById(req.user.id);
  if (!user) return res.status(401).json({ error: 'Compte introuvable' });
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/change-password', authenticate, function (req, res) {
  var current = String(req.body.currentPassword || '');
  var next = String(req.body.password || '');
  if (!current || !next) {
    return res.status(400).json({ error: 'Mot de passe actuel et nouveau requis' });
  }
  var user = store.findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  if (!bcrypt.compareSync(current, user.password_hash)) {
    return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
  }
  store.updateUserPassword(user.id, bcrypt.hashSync(next, 10));
  res.json({ success: true });
});

app.post('/api/auth/profile', authenticate, function (req, res) {
  var body = req.body || {};
  var nom = String(body.nom || '').trim();
  var prenoms = String(body.prenoms || '').trim();
  var currentPassword = String(body.currentPassword || '');
  var password = String(body.password || '');
  if (nom.length > 80 || prenoms.length > 120) {
    return res.status(400).json({ error: 'Le nom ou les prénoms sont trop longs' });
  }
  if (password && password.length < 8) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 8 caractères' });
  }
  var user = store.findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Compte introuvable' });
  if (password && (!currentPassword || !bcrypt.compareSync(currentPassword, user.password_hash))) {
    return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
  }
  var hash = password ? bcrypt.hashSync(password, 10) : null;
  var updated = store.updateUserProfile(user.id, nom, prenoms, hash);
  res.json({ success: true, user: publicUser(updated) });
});

/* ---------- API : données partagées (visites / réglages / élèves) ---------- */
app.get('/api/data', authenticate, function (req, res) {
  var user = store.findUserById(req.user.id);
  if (!user) return res.status(401).json({ error: 'Compte introuvable' });
  var all = store.loadAll();
  var visits = all.visits.map(withLevel);
  var students = all.students.map(withLevel);
  if (user.role !== 'admin') {
    var level = normalizeLevel(user.niveau);
    visits = visits.filter(function (v) { return v.niveau === level; });
    students = students.filter(function (s) { return s.niveau === level; });
  }
  res.json({ visits: visits, students: students, settings: all.settings });
});

app.post('/api/data', authenticate, function (req, res) {
  var body = req.body || {};
  if (body.visits !== undefined && !Array.isArray(body.visits)) {
    return res.status(400).json({ error: 'Format invalide : "visits" doit être un tableau' });
  }
  try {
    // Les paramètres restent réservés à l'administrateur. Chaque infirmier
    // ne remplace que les visites et les élèves de son propre niveau.
    var user = store.findUserById(req.user.id);
    if (!user) return res.status(401).json({ error: 'Compte introuvable' });
    var current = store.loadAll();
    var isAdmin = user.role === 'admin';
    var nextVisits = Array.isArray(body.visits) ? body.visits : current.visits;
    var nextStudents = Array.isArray(body.students) ? body.students : current.students;
    if (isAdmin) {
      nextVisits = nextVisits.map(withLevel);
      nextStudents = nextStudents.map(withLevel);
    } else {
      var level = normalizeLevel(user.niveau);
      var otherVisits = current.visits.map(withLevel).filter(function (v) { return v.niveau !== level; });
      var otherStudents = current.students.map(withLevel).filter(function (s) { return s.niveau !== level; });
      var scopedVisits = nextVisits.map(function (v) {
        if (normalizeLevel('', v.classe) !== level) throw new Error('Une visite appartient à un autre niveau.');
        return Object.assign({}, v, { niveau: level });
      });
      var scopedStudents = nextStudents.map(function (s) {
        if (s.classe && normalizeLevel('', s.classe) !== level) throw new Error('Un élève appartient à un autre niveau.');
        return Object.assign({}, s, { niveau: level });
      });
      nextVisits = otherVisits.concat(scopedVisits);
      nextStudents = otherStudents.concat(scopedStudents);
    }
    store.saveAll({
      visits: nextVisits,
      settings: isAdmin ? body.settings : current.settings,
      students: nextStudents
    });
    res.json({ success: true, backend: store.backend });
  } catch (e) {
    if (e.message.indexOf('autre niveau') !== -1) {
      return res.status(403).json({ error: e.message });
    }
    res.status(500).json({ error: 'Erreur serveur : ' + e.message });
  }
});

/* ---------- API : gestion des comptes (admin) ---------- */
app.get('/api/users', authenticate, requireAdmin, function (req, res) {
  res.json(store.listUsers());
});

app.post('/api/users', authenticate, requireAdmin, function (req, res) {
  var username = String(req.body.username || '').trim();
  var password = String(req.body.password || '');
  var role = req.body.role === 'admin' ? 'admin' : 'user';
  var niveau = req.body.niveau === 'lycee' ? 'lycee' : 'primaire';
  if (!username || !password) {
    return res.status(400).json({ error: "Nom d'utilisateur et mot de passe requis" });
  }
  try {
    var u = store.createUser(username, bcrypt.hashSync(password, 10), role, niveau);
    res.status(201).json(u);
  } catch (e) {
    if (e.message === 'EXISTS') return res.status(409).json({ error: 'Cet utilisateur existe déjà' });
    res.status(500).json({ error: 'Erreur serveur : ' + e.message });
  }
});

app.delete('/api/users/:id', authenticate, requireAdmin, function (req, res) {
  var u = store.findUserById(Number(req.params.id));
  if (!u) return res.status(404).json({ error: 'Utilisateur introuvable' });
  if (Number(u.id) === Number(req.user.id)) {
    return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
  }
  if (u.username === 'admin' && u.role === 'admin') {
    return res.status(400).json({ error: "Impossible de supprimer l'administrateur principal" });
  }
  store.deleteUser(u.id);
  res.json({ success: true });
});

/* ---------- API : endpoint inconnu ---------- */
app.use('/api', function (req, res) {
  res.status(404).json({ error: 'Endpoint inconnu' });
});

/* ---------- Démarrage ---------- */
function lanAddresses() {
  var out = [];
  var ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach(function (name) {
    (ifaces[name] || []).forEach(function (iface) {
      if (iface.family === 'IPv4' && !iface.internal) {
        out.push('http://' + iface.address + ':' + PORT + '/');
      }
    });
  });
  return out;
}

var server = app.listen(PORT, '0.0.0.0', function () {
  console.log('');
  console.log("  Registre d'infirmerie — École Jules Verne");
  console.log('  Serveur multi-utilisateurs démarré.');
  console.log('  Moteur de stockage : ' + store.backend.toUpperCase() +
    (store.backend === 'sqlite' ? ' (' + storage.DB_PATH + ')' : ' (' + storage.JSON_PATH + ')'));
  console.log('');
  console.log('  Sur ce poste           : http://localhost:' + PORT + '/');
  lanAddresses().forEach(function (url) {
    console.log('  Depuis le réseau local  : ' + url);
  });
  console.log('');
  console.log('  Comptes par défaut : admin/admin123 | medecin/medecin123 (à changer !)');
  console.log('  Pour arrêter le serveur : Ctrl+C');
  console.log('');
});

process.on('SIGINT', function () {
  console.log('\nArrêt du serveur...');
  try { store.close(); } catch (e) { /* ignore */ }
  try { server.close(); } catch (e) { /* ignore */ }
  process.exit(0);
});

module.exports = app;
