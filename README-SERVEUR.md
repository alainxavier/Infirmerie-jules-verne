# 📖 Guide d'installation — Mode serveur multi-utilisateurs

> **Registre d'infirmerie — École Jules Verne**  
> Ce guide explique comment installer l'application sur un serveur pour permettre à plusieurs utilisateurs de se connecter et de partager une base de données unique.

---

## ⚙️ Prérequis

| Composant | Version minimale |
|-----------|-----------------|
| **Windows** | Windows 10 / Windows Server 2019 |
| **Node.js** | **22.5 ou supérieur** (module SQLite intégré `node:sqlite`) |
| **Accès réseau** | Le port **8461** doit être accessible depuis les postes clients |

> ✅ **Aucune compilation, aucune dépendance native** : la base de données utilise
> le module SQLite **intégré à Node.js** (`node:sqlite`). Un **Node.js portable
> 22.23 est déjà inclus** dans le dossier `node-portable/` du projet : installer
> Node.js sur le serveur est donc **facultatif**.

---

## 🚀 Installation

### 1. Node.js (facultatif si node-portable est présent)

Le lanceur utilise **en priorité** le Node.js portable embarqué
(`node-portable\node-v22.23.2-win-x64\node.exe`). Si vous préférez un Node.js
installé sur la machine, vérifiez la version :

```bat
node --version
rem doit afficher v22.5.0 ou plus
```

### 2. Lancer l'application

**Option A — Script de lancement automatique** (recommandé) :

1. Double-cliquez sur `Infirmerie-Serveur-Node.bat` à la racine du projet.
2. Le script détecte le Node.js portable, vérifie la version et démarre le serveur.
3. Le navigateur s'ouvre sur `http://localhost:8461/`.

**Option B — Ligne de commande** :

```bat
cd server
npm install
npm start
```

Le serveur écoute sur le port **8461**.

---

## 👥 Première connexion

Le serveur crée automatiquement deux comptes :

| Nom d'utilisateur | Mot de passe | Rôle |
|-------------------|-------------|------|
| `admin` | `admin123` | Administrateur (gère les utilisateurs) |
| `medecin` | `medecin123` | Utilisateur (lecture/écriture) |

> 🔒 **Important** : Changez immédiatement les mots de passe après la première connexion !

---

## 💻 Accès depuis un poste client

Depuis un autre ordinateur du réseau local, ouvrez :

```
http://<adresse-IP-du-serveur>:8461/
```

Exemple : `http://192.168.1.10:8461/`

1. L'écran de connexion s'affiche.
2. Saisissez vos identifiants.
3. Le registre partagé s'affiche automatiquement.

---

## 🔐 Gestion des utilisateurs (admin)

1. Connectez-vous avec le compte **admin**.
2. Ouvrez **Paramètres** → section **🔐 Compte utilisateur**.
3. Pour créer / supprimer des utilisateurs, utilisez l'API :

```bash
# Lister
curl -H "Authorization: Bearer <TOKEN>" http://localhost:8461/api/users

# Créer
curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"username":"infirmier","password":"motdepasse","role":"user"}' \
  http://localhost:8461/api/users

# Supprimer (id > 1)
curl -X DELETE -H "Authorization: Bearer <TOKEN>" http://localhost:8461/api/users/2
```

### Changer son mot de passe

Depuis **Paramètres → 🔐 Compte utilisateur → Modifier mon mot de passe**, ou via l'API :

```bash
curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"currentPassword":"ancien","password":"nouveau"}' \
  http://localhost:8461/api/auth/change-password
```

---

## 🗄️ Base de données

- **SQLite** : fichier `server/data.sqlite` (créé automatiquement au premier lancement).
- **Import initial automatique** : si la base est vide, le serveur importe les
  données existantes depuis `sauvegarde/registre-infirmerie-sauvegarde.json`
  (visites, réglages et liste des élèves).
- Partagée par tous les utilisateurs connectés (mode WAL, écritures sécurisées).
- Si le module SQLite n'est pas disponible, le serveur bascule automatiquement
  sur un stockage fichier JSON : `server/data.json`.

### Sauvegarder la base

Le plus simple : copier le fichier quand le serveur est arrêté.

```bat
rem 1. Arrêtez le serveur (Ctrl+C), puis :
copy server\data.sqlite sauvegarde\registre-infirmerie.sqlite
```

Ou à chaud avec l'outil officiel SQLite (si installé) :

```bat
sqlite3 server\data.sqlite ".backup sauvegarde-infirmerie.sqlite"
```

### Restaurer la base

1. Arrêtez le serveur (`Ctrl+C`).
2. Remplacez `server\data.sqlite` par votre fichier de sauvegarde.
3. Redémarrez le serveur.

---

## 🔄 Synchronisation

- **Sauvegarde en temps réel** : chaque modification est envoyée au serveur immédiatement.
- **Synchronisation périodique** : le client interroge le serveur toutes les **30 secondes** pour récupérer les changements des autres utilisateurs.
- **Mode hors ligne** : si le serveur est inaccessible, l'application continue à fonctionner localement via `localStorage`. Les données locales ne sont pas partagées tant que le serveur n'est pas de retour.

---

## ⚠️ Mode local vs mode serveur

| Fonctionnalité | Mode local (PWA) | Mode serveur |
|----------------|-----------------|--------------|
| Stockage | localStorage du navigateur | Base SQLite partagée |
| Multi-utilisateur | ❌ Chaque navigateur a ses propres données | ✅ Tous partagent la même base |
| Hors ligne | ✅ (PWA installée) | ❌ Nécessite le serveur |
| PWA installable | ✅ | ❌ (pas de service worker en HTTP non-localhost) |
| Authentification | ❌ | ✅ (JWT) |
| Sauvegarde dossier | ✅ (File System Access) | ✅ (export JSON) |

> Le mode est détecté automatiquement : le serveur répond à `/api/config`, l'application active le mode serveur.

---

## 🔧 Configuration avancée

| Variable | Valeur par défaut | Description |
|----------|-------------------|-------------|
| `PORT` | `8461` | Port d'écoute du serveur |
| `JWT_SECRET` | `infirmerie-jv-secret-key-2026` | Clé secrète pour les tokens JWT |
| `DB_PATH` | `server/data.sqlite` | Chemin vers la base SQLite |
| `JSON_PATH` | `server/data.json` | Fichier de repli (mode JSON) |
| `SEED_PATH` | `sauvegarde/registre-infirmerie-sauvegarde.json` | Données importées au premier démarrage |

Exemple :

```bat
set PORT=9090
set JWT_SECRET=mon-super-secret-2026
node server/server.js
```

---

## 🛠️ Dépannage

| Problème | Solution |
|----------|----------|
| Serveur ne démarre pas | Vérifiez `node --version` (22.5+ requis). Libérez le port 8461 (`netstat -an \| findstr 8461`). |
| « Node.js 22.5+ requis » | Le Node.js installé est trop ancien : conservez le dossier `node-portable/` du projet. |
| "Identifiants incorrects" | Utilisez `admin`/`admin123` ou `medecin`/`medecin123` (minuscules). |
| Blocage sur écran de connexion | Vérifiez que `http://localhost:8461/api/config` retourne du JSON. |
| Inaccessible depuis un autre poste | Ouvrez le port 8461 dans le **pare-feu Windows** (voir ci-dessous). |
| Données non synchronisées | Tous les utilisateurs doivent utiliser la même adresse IP du serveur. |
| Erreur de dépendances | Supprimez `server\node_modules` et relancez `npm install`. |

### 🔥 Pare-feu Windows (accès multi-postes)

Au premier démarrage, Windows peut demander l'autorisation : cochez
**« Réseaux privés »** et validez. Pour ouvrir le port manuellement (en
administrateur) :

```bat
netsh advfirewall firewall add rule name="Infirmerie Jules Verne" dir=in action=allow protocol=TCP localport=8461
```

---

## 📁 Structure des fichiers

```
Infirmerie-jules-verne/
├── app.js                        # Client (mode serveur + local)
├── index.html                    # Interface (login modal incluse)
├── sw.js                         # Service worker
├── styles.css                    # Styles
├── manifest.webmanifest          # PWA manifest
├── Infirmerie-Serveur-Node.bat   # Lanceur serveur multi-utilisateurs
├── Infirmerie-Lancer-serveur.bat # Lanceur local (PWA)
├── serveur-infirmerie.ps1        # Serveur PowerShell local (statique)
├── README-SERVEUR.md             # Ce guide
├── assets/                       # Images, icônes
├── sauvegarde/                   # Dossier de sauvegarde locale
└── server/                       # Backend Node.js
    ├── package.json              # Dépendances
    ├── server.js                 # Express + API REST + JWT
    ├── store.js                  # Couche stockage (SQLite node:sqlite + repli JSON)
    ├── data.sqlite               # Base de données (auto-créée)
    └── node_modules/             # Modules npm
```
