'use strict';

/* =========================================================
   Couche de stockage partagée — Registre d'infirmerie
   École Jules Verne
   ---------------------------------------------------------
   Moteur principal : SQLite via le module intégré de
   Node.js 22+ (node:sqlite) — aucune dépendance native,
   aucune compilation.
   Repli automatique : fichier JSON (server/data.json) si
   node:sqlite n'est pas disponible.
   ========================================================= */

var fs = require('fs');
var path = require('path');

var DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.sqlite');
var JSON_PATH = process.env.JSON_PATH || path.join(__dirname, 'data.json');

/* Utilisateurs par défaut créés au premier démarrage */
var DEFAULT_USERS = [
  { username: 'admin', role: 'admin', niveau: 'all', password: 'admin123' },
  { username: 'medecin', role: 'user', niveau: 'primaire', password: 'medecin123' },
  { username: 'lycee', role: 'user', niveau: 'lycee', password: 'lycee123' }
];

function stripHash(u) {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    niveau: u.role === 'admin' ? 'all' : (u.niveau || 'primaire'),
    nom: u.nom || '',
    prenoms: u.prenoms || '',
    createdAt: u.createdAt || null
  };
}

/* =========================================================
   Store JSON (repli simple, zéro dépendance)
   ========================================================= */
function createJsonStore() {
  function readDoc() {
    try {
      var d = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
      d.visits = Array.isArray(d.visits) ? d.visits : [];
      d.settings = d.settings && typeof d.settings === 'object' ? d.settings : {};
      d.students = Array.isArray(d.students) ? d.students : [];
      d.users = Array.isArray(d.users) ? d.users : [];
      return d;
    } catch (e) {
      return { visits: [], settings: {}, students: [], users: [] };
    }
  }

  function writeDoc(d) {
    var tmp = JSON_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(d, null, 2), 'utf8');
    fs.renameSync(tmp, JSON_PATH);
  }

  return {
    backend: 'json',
    loadAll: function () {
      var d = readDoc();
      return { visits: d.visits, settings: d.settings, students: d.students };
    },
    saveAll: function (all) {
      var d = readDoc();
      d.visits = Array.isArray(all.visits) ? all.visits : [];
      d.settings = all.settings && typeof all.settings === 'object' ? all.settings : {};
      d.students = Array.isArray(all.students) ? all.students : [];
      writeDoc(d);
    },
    countVisits: function () { return readDoc().visits.length; },
    listUsers: function () {
      return readDoc().users.map(stripHash);
    },
    findUserByUsername: function (username) {
      var users = readDoc().users;
      for (var i = 0; i < users.length; i++) {
        if (users[i].username === username) return users[i];
      }
      return null;
    },
    findUserById: function (id) {
      var users = readDoc().users;
      for (var i = 0; i < users.length; i++) {
        if (Number(users[i].id) === Number(id)) return users[i];
      }
      return null;
    },
    createUser: function (username, hash, role, niveau) {
      var d = readDoc();
      for (var i = 0; i < d.users.length; i++) {
        if (d.users[i].username === username) throw new Error('EXISTS');
      }
      var user = {
        id: d.users.reduce(function (m, u) { return Math.max(m, Number(u.id) || 0); }, 0) + 1,
        username: username,
        password_hash: hash,
        role: role || 'user',
        niveau: role === 'admin' ? 'all' : (niveau || 'primaire'),
        createdAt: new Date().toISOString()
      };
      d.users.push(user);
      writeDoc(d);
      return stripHash(user);
    },
    deleteUser: function (id) {
      var d = readDoc();
      d.users = d.users.filter(function (u) { return Number(u.id) !== Number(id); });
      writeDoc(d);
    },
    updateUserPassword: function (id, hash) {
      var d = readDoc();
      d.users.forEach(function (u) {
        if (Number(u.id) === Number(id)) u.password_hash = hash;
      });
      writeDoc(d);
    },
    updateUserProfile: function (id, nom, prenoms, hash) {
      var d = readDoc();
      d.users.forEach(function (u) {
        if (Number(u.id) === Number(id)) {
          u.nom = nom;
          u.prenoms = prenoms;
          if (hash) u.password_hash = hash;
        }
      });
      writeDoc(d);
      return this.findUserById(id);
    },
    countUsers: function () { return readDoc().users.length; },
    close: function () {},
    defaultUsers: DEFAULT_USERS
  };
}

/* =========================================================
   Store SQLite (node:sqlite, intégré à Node.js 22+)
   ========================================================= */
function createSqliteStore() {
  var Database = require('node:sqlite').DatabaseSync;
  var db = new Database(DB_PATH);

  db.exec(
    'PRAGMA journal_mode = WAL;' +
    'PRAGMA busy_timeout = 5000;' +
    'CREATE TABLE IF NOT EXISTS users (' +
    '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
    '  username TEXT UNIQUE NOT NULL,' +
    '  password_hash TEXT NOT NULL,' +
    "  role TEXT NOT NULL DEFAULT 'user'," +
    "  niveau TEXT NOT NULL DEFAULT 'primaire'," +
    '  createdAt TEXT DEFAULT CURRENT_TIMESTAMP' +
    ');' +
    'CREATE TABLE IF NOT EXISTS visits (' +
    '  id TEXT PRIMARY KEY,' +
    '  ord INTEGER NOT NULL DEFAULT 0,' +
    '  data TEXT NOT NULL' +
    ');' +
    'CREATE TABLE IF NOT EXISTS meta (' +
    '  key TEXT PRIMARY KEY,' +
    '  value TEXT NOT NULL' +
    ');'
  );

  // Migration douce des bases SQLite déjà créées.
  var userColumns = db.prepare('PRAGMA table_info(users)').all().map(function (c) { return c.name; });
  if (userColumns.indexOf('nom') === -1) db.exec("ALTER TABLE users ADD COLUMN nom TEXT NOT NULL DEFAULT ''");
  if (userColumns.indexOf('prenoms') === -1) db.exec("ALTER TABLE users ADD COLUMN prenoms TEXT NOT NULL DEFAULT ''");
  if (userColumns.indexOf('niveau') === -1) db.exec("ALTER TABLE users ADD COLUMN niveau TEXT NOT NULL DEFAULT 'primaire'");

  var q = {
    allVisits: db.prepare('SELECT data FROM visits ORDER BY ord ASC'),
    delVisits: db.prepare('DELETE FROM visits'),
    insVisit: db.prepare('INSERT OR REPLACE INTO visits (id, ord, data) VALUES (?, ?, ?)'),
    getMeta: db.prepare('SELECT value FROM meta WHERE key = ?'),
    setMeta: db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
    userByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    allUsers: db.prepare('SELECT id, username, role, niveau, nom, prenoms, createdAt FROM users ORDER BY id'),
    insUser: db.prepare('INSERT INTO users (username, password_hash, role, niveau) VALUES (?, ?, ?, ?)'),
    userIdByName: db.prepare('SELECT id FROM users WHERE username = ?'),
    delUser: db.prepare('DELETE FROM users WHERE id = ?'),
    updUserPwd: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
    updUserProfile: db.prepare('UPDATE users SET nom = ?, prenoms = ? WHERE id = ?'),
    updUserProfilePwd: db.prepare('UPDATE users SET nom = ?, prenoms = ?, password_hash = ? WHERE id = ?'),
    countUsers: db.prepare('SELECT COUNT(*) AS c FROM users'),
    countVisits: db.prepare('SELECT COUNT(*) AS c FROM visits')
  };

  function readMeta(key, fallback) {
    var row = q.getMeta.get(key);
    if (!row) return fallback;
    try { return JSON.parse(row.value); } catch (e) { return fallback; }
  }

  function writeMeta(key, value) {
    q.setMeta.run(key, JSON.stringify(value));
  }

  return {
    backend: 'sqlite',
    loadAll: function () {
      var visits = q.allVisits.all()
        .map(function (r) {
          try { return JSON.parse(r.data); } catch (e) { return null; }
        })
        .filter(function (v) { return v && typeof v === 'object'; });
      return {
        visits: visits,
        settings: readMeta('settings', {}),
        students: readMeta('students', [])
      };
    },
    saveAll: function (all) {
      var visits = Array.isArray(all.visits) ? all.visits : [];
      var settings = all.settings && typeof all.settings === 'object' ? all.settings : {};
      var students = Array.isArray(all.students) ? all.students : [];
      db.exec('BEGIN IMMEDIATE');
      try {
        q.delVisits.run();
        for (var i = 0; i < visits.length; i++) {
          var v = visits[i] && typeof visits[i] === 'object' ? visits[i] : {};
          var id = v.id ? String(v.id) : 'auto-' + Date.now() + '-' + i;
          q.insVisit.run(id, i, JSON.stringify(v));
        }
        writeMeta('settings', settings);
        writeMeta('students', students);
        db.exec('COMMIT');
      } catch (e) {
        try { db.exec('ROLLBACK'); } catch (e2) { /* ignore */ }
        throw e;
      }
    },
    countVisits: function () { return q.countVisits.get().c; },
    listUsers: function () { return q.allUsers.all(); },
    findUserByUsername: function (username) {
      return q.userByUsername.get(String(username)) || null;
    },
    findUserById: function (id) {
      return q.userById.get(Number(id)) || null;
    },
    createUser: function (username, hash, role, niveau) {
      if (q.userIdByName.get(username)) throw new Error('EXISTS');
      var userRole = role || 'user';
      var userLevel = userRole === 'admin' ? 'all' : (niveau === 'lycee' ? 'lycee' : 'primaire');
      var info = q.insUser.run(String(username), hash, userRole, userLevel);
      return {
        id: Number(info.lastInsertRowid),
        username: username,
        role: userRole,
        niveau: userLevel
      };
    },
    deleteUser: function (id) {
      q.delUser.run(Number(id));
    },
    updateUserPassword: function (id, hash) {
      q.updUserPwd.run(hash, Number(id));
    },
    updateUserProfile: function (id, nom, prenoms, hash) {
      if (hash) q.updUserProfilePwd.run(nom, prenoms, hash, Number(id));
      else q.updUserProfile.run(nom, prenoms, Number(id));
      return this.findUserById(id);
    },
    countUsers: function () { return q.countUsers.get().c; },
    close: function () { try { db.close(); } catch (e) { /* ignore */ } },
    defaultUsers: DEFAULT_USERS
  };
}

/* =========================================================
   Fabrique : SQLite d'abord, JSON en repli
   ========================================================= */
function createStore() {
  try {
    require.resolve('node:sqlite');
    return createSqliteStore();
  } catch (e) {
    console.warn('[stockage] node:sqlite indisponible (' + e.message + ')');
    console.warn('[stockage] Repli sur fichier JSON : ' + JSON_PATH);
    return createJsonStore();
  }
}

module.exports = {
  createStore: createStore,
  DB_PATH: DB_PATH,
  JSON_PATH: JSON_PATH
};
