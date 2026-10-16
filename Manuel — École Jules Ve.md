# Registre d'infirmerie — École Jules Verne
## Manuel d'installation et d'utilisation

*Version révisée — octobre 2026*

L'application peut fonctionner de deux façons : en **mode serveur**, recommandé pour partager un registre entre plusieurs postes, ou en **mode local**, pour un seul poste. Choisissez le mode avant de commencer : les données de ces deux modes ne se synchronisent pas entre elles.

---

## 1. Choisir le mode

| | Mode serveur (recommandé pour l'école) | Mode local |
|---|---|---|
| Utilisateurs | Plusieurs postes, registre partagé | Un navigateur sur un poste |
| Où sont les données ? | Base du serveur (`server/data.sqlite`) | Stockage du navigateur (`localStorage`) |
| Connexion au serveur | Nécessaire pour consulter et enregistrer | Pas nécessaire après installation |
| Lancement | Démarrer le serveur puis ouvrir son adresse | Démarrer le serveur local pour installer/ouvrir la PWA |

En mode serveur, le poste hébergeant l'application doit rester allumé et le serveur lancé. Les données sont médicales et personnelles : réservez l'accès au réseau de l'établissement et n'exposez pas le port 8461 directement sur Internet. Le serveur fourni utilise HTTP ; n'utilisez pas un réseau public ou non fiable.

---

## 2. Installer le mode serveur

### Prérequis

- Un ordinateur Windows 10/11 ou Windows Server 2019 ou ultérieur, accessible sur le réseau local.
- Le dossier complet de l'application, y compris `server`, `assets` et `node-portable`.
- Le port TCP **8461** disponible. Le lanceur embarque Node.js 22.23.2 ; aucune installation distincte de Node.js n'est normalement requise.

### Démarrer sur l'ordinateur hôte

1. Copiez le dossier complet de l'application sur l'ordinateur qui hébergera le registre. Gardez ce dossier à un emplacement permanent et accessible uniquement aux personnes autorisées.
2. Double-cliquez sur **`Infirmerie-Serveur-Node.bat`**.
3. À la première exécution, le lanceur installe les dépendances nécessaires. Autorisez l'accès au réseau privé si le pare-feu Windows le demande.
4. Une fenêtre de terminal affiche l'état du serveur. Laissez-la ouverte pendant l'utilisation. Le navigateur de l'hôte s'ouvre sur `http://localhost:8461/`.
5. Pour arrêter le serveur, revenez dans cette fenêtre et appuyez sur **Ctrl+C**.

Pour démarrer automatiquement après un redémarrage, configurez le lancement du fichier BAT avec l'administrateur informatique. Ne fermez pas la session Windows et ne mettez pas l'hôte en veille tant que le service doit être disponible.

### Autoriser les postes clients

1. Sur l'hôte, ouvrez PowerShell ou l'invite de commandes et exécutez `ipconfig`.
2. Relevez son adresse IPv4 sur le réseau de l'établissement (par exemple `192.168.1.10`). Réservez cette adresse dans le réseau si possible afin qu'elle ne change pas.
3. Si Windows le demande, autorisez le serveur sur les **réseaux privés**. Sinon, demandez à l'administrateur informatique d'autoriser le port TCP 8461 dans le pare-feu pour le réseau local.
4. Sur chaque poste client, ouvrez Edge ou Chrome et accédez à `http://ADRESSE-IP:8461/`, par exemple `http://192.168.1.10:8461/`.

Il n'est pas nécessaire d'installer l'application comme PWA sur les postes clients. En mode serveur, utilisez l'adresse de l'hôte ; `localhost` désigne toujours l'ordinateur utilisé et ne convient donc pas aux autres postes.

---

## 3. Première connexion et comptes

Lors de la première exécution sur une base vierge, deux comptes sont créés :

| Identifiant | Mot de passe initial | Rôle |
|---|---|---|
| `admin` | `admin123` | Administrateur |
| `medecin` | `medecin123` | Utilisateur |

1. Connectez-vous avec le compte administrateur.
2. Ouvrez **Paramètres → Compte utilisateur** et changez immédiatement le mot de passe initial. Les mots de passe doivent contenir au moins 8 caractères.
3. Créez les comptes nécessaires depuis la gestion des utilisateurs. Donnez un compte individuel à chaque personne ; ne partagez pas les identifiants. Attribuez le rôle et le niveau (primaire ou lycée) appropriés.
4. Chaque utilisateur peut modifier son propre mot de passe depuis **Paramètres → Compte utilisateur**. Une session expire après 12 heures ; reconnectez-vous si l'écran de connexion réapparaît.

Les comptes par défaut ne sont ajoutés que lorsque la base ne contient encore aucun compte. Si le mot de passe administrateur est perdu, contactez la personne qui administre le serveur.

---

## 4. Données et première mise en service

Au premier démarrage, si le registre serveur est vide et que le fichier `sauvegarde/registre-infirmerie-sauvegarde.json` est présent, ses visites, réglages et élèves sont importés automatiquement. Cet import initial ne se répète pas si la base contient déjà des visites.

Les données partagées sont stockées sur l'hôte dans `server/data.sqlite`. Le navigateur des utilisateurs envoie les modifications au serveur et récupère périodiquement celles des autres utilisateurs. Si le serveur est inaccessible, les changements locaux hors ligne ne sont pas partagés automatiquement : attendez le retour du serveur et vérifiez les données avant de reprendre la saisie.

### Importer une liste d'élèves

Dans **Paramètres → Liste des élèves**, cliquez sur **Importer la liste…** puis choisissez un fichier Excel ou CSV avec les colonnes `Nom`, `Prénom`, `Né(e) le`, `Sexe` et `Classe` (le niveau peut aussi être fourni). L'autocomplétion renseigne ensuite les informations disponibles lors de la création d'une visite.

### Sauvegarder et restaurer

- Depuis l'application, utilisez **Exporter → Sauvegarde complète (JSON)** et enregistrez régulièrement le fichier dans un emplacement protégé, distinct de l'hôte.
- L'option de sauvegarde automatique vers un dossier dans **Paramètres** concerne le navigateur et son autorisation d'accès au dossier ; ne la considérez pas comme la seule sauvegarde du serveur.
- Pour copier directement la base, arrêtez le serveur avec **Ctrl+C**, puis copiez `server/data.sqlite` vers un support protégé. Redémarrez ensuite le serveur. Ne copiez pas la base pendant qu'elle est active.
- Pour restaurer une sauvegarde JSON, connectez-vous, puis utilisez **Importer → Restauration de sauvegarde (JSON)**. Pour restaurer une copie SQLite, arrêtez d'abord le serveur et demandez à l'administrateur de remplacer le fichier de base.

Les sauvegardes peuvent contenir des données sensibles : limitez leur accès et leur durée de conservation selon les règles de l'établissement.

---

## 5. Utiliser le registre

- **Nouvelle visite** : recherchez ou saisissez l'élève, complétez les observations et le traitement si nécessaire, renseignez les heures de départ, puis enregistrez.
- **Recherche et filtres** : filtrez par nom, classe, âge ou période.
- **Statistiques** : consultez les récapitulatifs et graphiques disponibles.
- **Importer / exporter** : importez des visites Excel/CSV, restaurez une sauvegarde JSON ou exportez les données selon le besoin.
- **Imprimer** : utilisez **Imprimer** pour produire un rapport des visites affichées.

---

## 6. Utiliser le mode local (un seul poste)

Le mode local convient à un usage individuel sans partage de registre. Ses données restent dans le navigateur de ce poste ; elles ne sont pas copiées dans la base du serveur.

1. Double-cliquez sur **`Infirmerie-Lancer-serveur.bat`** à la racine du dossier.
2. Le navigateur s'ouvre sur `http://localhost:8461/`. Laissez la fenêtre du serveur ouverte pendant l'utilisation.
3. Pour installer l'application comme PWA, utilisez l'option **Installer** du navigateur lorsqu'elle est proposée. L'installation ne rend pas les données disponibles sans serveur : ce lanceur local doit continuer à fonctionner.
4. Sauvegardez les données avec **Exporter → Sauvegarde complète (JSON)**.

Ne passez pas du mode local au mode serveur en pensant que les données sont déjà partagées. Exportez une sauvegarde JSON, ouvrez le mode cible et restaurez-la explicitement.

---

## 7. Dépannage

| Problème | Vérification / solution |
|---|---|
| Le serveur ne démarre pas | Vérifiez que le port 8461 n'est pas déjà utilisé et que le dossier `node-portable` est complet. Consultez le message dans la fenêtre du lanceur. |
| Un poste client ne se connecte pas | Vérifiez que le serveur tourne, que l'adresse IP est correcte et que le port TCP 8461 est autorisé sur le réseau privé. |
| L'écran de connexion n'apparaît pas | Vérifiez l'adresse et rechargez la page. Sur l'hôte, `http://localhost:8461/api/config` doit afficher une réponse JSON. |
| Identifiants refusés | Vérifiez l'orthographe et les majuscules. Les mots de passe initiaux ne fonctionnent que s'ils n'ont pas été modifiés. |
| Les modifications ne sont pas visibles | Vérifiez que tous les postes utilisent la même adresse de serveur et que le serveur est accessible ; rechargez la page ou reconnectez-vous. |
| Les élèves n'apparaissent pas | Importez la liste Excel/CSV dans les paramètres et vérifiez les en-têtes des colonnes. |
| Le serveur s'est arrêté | Relancez `Infirmerie-Serveur-Node.bat` sur l'hôte. Les clients ne peuvent pas utiliser le registre partagé tant qu'il est arrêté. |

Pour toute question technique, contactez l'administrateur informatique de l'École Jules Verne.
