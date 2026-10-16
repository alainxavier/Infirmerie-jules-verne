# Registre d'infirmerie — École Jules Verne
## Manuel d'installation et d'utilisation

*Version révisée — octobre 2026*

L'application fonctionne uniquement avec le **serveur partagé**, ouvert dans un navigateur : il n'y a plus de version PWA à installer sur les postes. Si une ancienne icône « Infirmerie JV » est installée, supprimez-la et utilisez l'adresse web du serveur. Les visites, la liste des élèves et les réglages sont conservés sur l'ordinateur serveur et partagés entre les postes autorisés. Si le serveur est inaccessible, l'application bloque l'accès : aucune donnée médicale n'est enregistrée localement dans le navigateur.

Les données sont sensibles. Limitez l'accès au réseau privé de l'établissement et n'exposez pas le port 8461 directement sur Internet. Le serveur fourni utilise HTTP ; pour un accès distant, demandez à l'administrateur de configurer une connexion sécurisée.

---

## 1. Installer le serveur

### Prérequis

- Un ordinateur Windows 10/11 ou Windows Server 2019 ou ultérieur, accessible sur le réseau de l'établissement.
- Node.js **22.5 ou ultérieur** et npm installés sur l'ordinateur serveur et disponibles dans son `PATH`.
- Le dossier de l'application, notamment `server`, `assets` et le fichier de lancement.
- Le port TCP **8461** disponible et autorisé sur le réseau privé.

Le serveur de l'école dispose déjà de Node.js 24.22.0 et npm 11.19.1, versions compatibles. Si les dépendances de l'application ne sont pas présentes, le lanceur les installe avec npm au premier démarrage.

### Démarrer sur l'ordinateur serveur

1. Copiez le dossier complet de l'application sur l'ordinateur qui hébergera le registre. Gardez-le à un emplacement permanent et protégé.
2. Double-cliquez sur **`Infirmerie-Serveur-Node.bat`**.
3. Si le pare-feu Windows le demande, autorisez l'accès sur les **réseaux privés**. Laissez la fenêtre du serveur ouverte pendant l'utilisation.
4. Le navigateur de l'ordinateur serveur s'ouvre sur `http://localhost:8461/`.
5. Pour arrêter le serveur, revenez dans la fenêtre de commande et appuyez sur **Ctrl+C**.

L'ordinateur serveur doit rester allumé et ne pas se mettre en veille. En cas de redémarrage, relancez le fichier BAT.

### Connecter les autres postes

1. Dans la fenêtre du serveur, relevez l'adresse réseau affichée après **« Depuis le réseau local »**. Si besoin, trouvez l'adresse IPv4 avec `ipconfig`.
2. Depuis chaque poste client, ouvrez Edge ou Chrome sur `http://ADRESSE-IP:8461/`, par exemple `http://192.168.1.10:8461/`.
3. Connectez-vous avec votre compte personnel.

N'utilisez pas `localhost` depuis un poste client : cette adresse désigne le poste client lui-même. Si l'accès réseau échoue, l'administrateur informatique doit autoriser le port TCP 8461 dans le pare-feu du serveur pour le réseau privé.

---

## 2. Première connexion et utilisateurs

Sur une base neuve, le serveur crée ces comptes initiaux :

| Identifiant | Mot de passe initial | Rôle |
|---|---|---|
| `admin` | `admin123` | Administrateur |
| `medecin` | `medecin123` | Utilisateur |

1. Connectez-vous avec `admin` et changez immédiatement son mot de passe depuis **Mon profil**.
2. Dans **Paramètres**, créez un compte individuel pour chaque personne et attribuez le rôle et le niveau appropriés (primaire ou lycée).
3. Chaque utilisateur peut modifier son mot de passe dans **Mon profil**. Utilisez un mot de passe d'au moins 8 caractères.

Ne partagez pas les comptes. Les comptes initiaux ne sont créés que si la base ne contient encore aucun utilisateur.

---

## 3. Utiliser l'application

- **Nouvelle visite** : recherchez ou saisissez l'élève, complétez les observations et le traitement si nécessaire, renseignez les heures, puis enregistrez. Les modifications sont envoyées au serveur.
- **Liste des élèves** : dans **Paramètres**, importez un fichier Excel ou CSV comportant les colonnes `Nom`, `Prénom`, `Né(e) le`, `Sexe` et `Classe` (le niveau est facultatif). Les informations importées alimentent l'autocomplétion.
- **Recherche, filtres et statistiques** : utilisez les filtres de nom, classe, âge et dates ainsi que les indicateurs du registre.
- **Import/export** : les visites peuvent être importées depuis Excel/CSV. Utilisez **Exporter → Sauvegarde complète (JSON)** pour créer une copie de secours. **Importer → Restauration de sauvegarde (JSON)** permet de restaurer un fichier.
- **Impression** : le bouton **Imprimer** produit un rapport des visites affichées.

Tous les postes doivent utiliser la même adresse du serveur pour consulter le même registre. Si le serveur est coupé, l'application ne stocke pas les nouvelles données dans le navigateur : attendez son rétablissement avant de reprendre la saisie.

---

## 4. Données et sauvegardes

- La base principale est `server/data.sqlite`. Elle est créée automatiquement et partagée par les utilisateurs connectés.
- Au premier démarrage, si le registre est vide, le serveur importe les données de `sauvegarde/registre-infirmerie-sauvegarde.json` si le fichier existe.
- Pour sauvegarder directement la base, arrêtez le serveur avec **Ctrl+C**, puis copiez `server/data.sqlite` vers un emplacement protégé. Redémarrez le serveur après la copie.
- Vous pouvez également créer une sauvegarde complète JSON depuis l'application. Conservez les sauvegardes dans un emplacement protégé, distinct de l'ordinateur serveur.
- Pour restaurer une sauvegarde JSON, connectez-vous comme administrateur et utilisez **Importer → Restauration de sauvegarde (JSON)**. Pour restaurer une copie SQLite, arrêtez le serveur avant de remplacer la base.

Les sauvegardes contiennent des données sensibles : limitez leur accès aux personnes autorisées.

---

## 5. Dépannage

| Problème | Solution |
|---|---|
| La fenêtre du serveur se ferme | Relancez le BAT et relevez le message d'erreur. Vérifiez que `node --version` affiche au moins v22.5 et que le port 8461 n'est pas déjà utilisé. |
| L'application indique « Serveur indisponible » | Vérifiez que le serveur tourne et utilisez l'adresse affichée dans sa fenêtre. Cliquez sur **Réessayer** après vérification. |
| Un poste client affiche `ERR_CONNECTION_REFUSED` | Vérifiez l'adresse IP et le port 8461, puis l'autorisation du pare-feu Windows sur le réseau privé. N'utilisez pas `localhost` depuis le client. |
| Identifiants refusés | Vérifiez l'identifiant et le mot de passe auprès de l'administrateur. Les mots de passe initiaux peuvent avoir été changés. |
| Les changements d'un autre poste n'apparaissent pas | Vérifiez que les deux postes utilisent exactement la même adresse IP du serveur et rechargez la page. |
| Dépendances manquantes | Le serveur doit avoir accès à Internet lors de la première installation via `npm install`. Vérifiez aussi que `npm --version` fonctionne. |

Pour toute question technique, contactez l'administrateur informatique de l'École Jules Verne.
