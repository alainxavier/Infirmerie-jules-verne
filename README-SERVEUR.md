# Registre d'infirmerie — Déploiement serveur

L'application fonctionne exclusivement en mode serveur multi-utilisateurs et s'ouvre dans le navigateur, sans PWA à installer. Les visites, réglages et listes d'élèves sont conservés sur le serveur. Si celui-ci est inaccessible, l'application bloque l'accès et ne stocke pas de copie locale.

Les données sont sensibles : limitez l'accès au réseau privé de l'établissement et n'exposez pas directement le port 8461 sur Internet. Le serveur fourni utilise HTTP ; pour un accès distant, configurez un accès sécurisé.

## Prérequis

- Windows 10/11 ou Windows Server 2019 ou ultérieur.
- Node.js **22.5+** et npm installés sur le serveur, tous deux disponibles dans le `PATH`.
- Le dossier de l'application (`server/`, `assets/`, lanceur) et le port TCP **8461**.
- Accès réseau privé des postes clients vers le serveur.

Le serveur cible possède déjà Node.js 24.22.0 et npm 11.19.1. Le backend utilise SQLite intégré à Node.js et le paquet Express. Si les dépendances ne sont pas présentes, le lanceur exécute `npm install` au premier démarrage ; le serveur doit alors pouvoir accéder au registre npm.

## Installation et démarrage

1. Copiez le dossier complet sur l'ordinateur qui hébergera le registre.
2. Lancez `Infirmerie-Serveur-Node.bat`.
3. Autorisez l'accès au réseau privé dans le pare-feu Windows si demandé. Gardez la fenêtre de commande ouverte.
4. Le navigateur local s'ouvre sur `http://localhost:8461/`. L'application attend que l'API soit prête avant l'ouverture.
5. La fenêtre affiche aussi l'adresse réseau à ouvrir depuis les postes clients, par exemple `http://192.168.1.10:8461/`.

Les postes clients doivent utiliser l'adresse IPv4 du serveur. `localhost` ne fonctionne que sur l'ordinateur où le serveur tourne. Si le pare-feu bloque les clients, autorisez le port TCP 8461 pour le réseau privé (opération administrateur).

Pour arrêter le serveur, appuyez sur **Ctrl+C** dans sa fenêtre. Ne mettez pas l'ordinateur hôte en veille pendant que le registre doit être accessible.

### Lancement manuel

```bat
cd server
npm install
npm start
```

Le serveur écoute sur toutes les interfaces réseau sur le port 8461 par défaut.

## Comptes et rôles

Sur une base neuve, le serveur crée `admin` / `admin123` (administrateur) et `medecin` / `medecin123` (utilisateur). Changez immédiatement les mots de passe initiaux depuis **Mon profil**. Créez ensuite des comptes individuels dans **Paramètres**. Les comptes utilisateurs sont attribués au primaire ou au lycée ; l'administrateur a accès aux deux niveaux.

Les sessions expirent après 12 heures. Le serveur ne recrée les comptes initiaux que si aucun compte n'est encore enregistré.

## Stockage, import et sauvegarde

- Base principale : `server/data.sqlite`, créée au premier démarrage.
- Repli automatique en JSON : `server/data.json` si SQLite ne peut pas être initialisé.
- Import initial : si la base ne contient aucune visite, le serveur importe `sauvegarde/registre-infirmerie-sauvegarde.json` lorsqu'il existe.
- L'application permet aussi l'import de visites Excel/CSV, l'import de listes d'élèves et l'export/restauration de sauvegardes JSON.

Copie sûre de la base SQLite : arrêtez le serveur, copiez le fichier, puis redémarrez-le.

```bat
copy server\data.sqlite sauvegarde\registre-infirmerie.sqlite
```

Pour restaurer une copie SQLite, arrêtez le serveur, remplacez le fichier de base et redémarrez. Conservez les sauvegardes sur un emplacement protégé, distinct de l'hôte. Elles contiennent des données sensibles.

## Synchronisation

Les postes authentifiés lisent et écrivent dans la base partagée. Les changements des autres utilisateurs sont récupérés toutes les 30 secondes. Si le serveur devient inaccessible, l'application verrouille l'accès et n'enregistre pas de copie locale des données.

## Configuration

| Variable | Par défaut | Description |
|---|---|---|
| `PORT` | `8461` | Port du serveur |
| `JWT_SECRET` | `infirmerie-jv-secret-key-2026` | Clé de signature des sessions |
| `DB_PATH` | `server/data.sqlite` | Chemin de la base SQLite |
| `JSON_PATH` | `server/data.json` | Chemin de stockage JSON de repli |
| `SEED_PATH` | `sauvegarde/registre-infirmerie-sauvegarde.json` | Fichier d'import initial |

Exemple pour un autre port :

```bat
set PORT=9090
set JWT_SECRET=remplacer-par-une-cle-longue-et-aleatoire
node server\server.js
```

## Dépannage

| Symptôme | Vérification |
|---|---|
| « Node.js 22.5+ requis » | Installez Node.js 22.5 ou ultérieur et vérifiez que `node` est dans le `PATH`. |
| Le port est déjà utilisé | Libérez le port 8461 ou définissez `PORT` avant le lancement. |
| `ERR_CONNECTION_REFUSED` depuis un client | Vérifiez l'adresse IP du serveur, que le serveur tourne et que le pare-feu autorise TCP 8461 sur le réseau privé. |
| Échec de dépendances | Vérifiez que npm est dans le `PATH` et que le serveur peut accéder à Internet lors du premier `npm install`. |
| Le serveur ne répond plus | Consultez sa fenêtre de commande et redémarrez le BAT si le processus s'est arrêté. |

## Fichiers principaux

```text
Infirmerie-jules-verne/
├── app.js                         # Interface et API cliente
├── index.html                     # Interface web avec authentification
├── styles.css                     # Styles
├── Infirmerie-Serveur-Node.bat    # Lanceur du serveur partagé
├── README-SERVEUR.md              # Ce guide
├── Manuel — École Jules Ve.md     # Manuel utilisateur
├── assets/                        # Logos et images de l'école
├── sauvegarde/                    # Sauvegardes et éventuel import initial
└── server/
    ├── package.json               # Dépendances
    ├── server.js                  # Serveur web et API authentifiée
    ├── store.js                   # Stockage SQLite / JSON
    ├── package-lock.json          # Versions verrouillées des dépendances
    └── data.sqlite                # Base créée au démarrage
```
