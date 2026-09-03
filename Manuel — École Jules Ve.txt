# Registre d'infirmerie — École Jules Verne
### Manuel d'installation et de première utilisation

---

## 1. Configuration requise

| Composant | Version |
|---|---|
| **Système d'exploitation** | Windows 10 ou Windows 11 |
| **Navigateur web** | Microsoft Edge (Chromium) ou Google Chrome |
| **Espace disque** | 50 Mo (pour le logiciel + fichiers de données) |
| **Connexion internet** | Une seule fois, pour l'installation initiale |

> ⚠️ **Important** : L'application est entièrement **locale**. Aucune donnée n'est envoyée sur Internet.

---

## 2. Installation en tant que PWA (sur le bureau)

### Étape 1 : Lancer le serveur local
1. Rendez-vous dans le dossier :
   ```
   d:\Web-app\Infirmerie-jules-verne
   ```
2. Double-cliquez sur le fichier :
   ```
   Infirmerie-Lancer-serveur.bat
   ```
   - Un terminal PowerShell s’ouvre et reste en arrière-plan.
   - Un message vert indique :
     ```
     Serveur local démarré : http://localhost:8461/
     ```
   - Laissez cette fenêtre ouverte.

### Étape 2 : Ouvrir l'application et l'installer
1. Un navigateur s’ouvre automatiquement sur :
   ```
   http://localhost:8461/
   ```
2. Attendez 3 à 5 secondes.
3. Cliquez sur l’icône **"Installer"** dans la barre d’adresse du navigateur.
   - Sous **Edge** : une notification apparaît en haut à droite.
   - Sous **Chrome** : le bouton "📲 Installer l'application" devient visible.
4. Confirmez l’installation.
5. Une icône **"Infirmerie JV"** apparaîtra sur votre bureau.

✅ **Félicitations !** Vous pouvez maintenant lancer l’application directement depuis le bureau, **sans serveur**, ni même connexion internet.

---

## 3. Désinstallation (si nécessaire)
1. Supprimez l’icône du bureau.
2. Dans **Paramètres Windows → Applications**, cherchez :
   ```
   Infirmerie JV
   ```
   et désinstallez.
3. Pour supprimer le serveur local, supprimez simplement le dossier :
   ```
   d:\Web-app\Infirmerie-jules-verne
   ```

---

## 4. Première utilisation de l'application

### Import de la liste des élèves (recommandé)
1. Lancez l’application via l’icône du bureau.
2. Cliquez sur **⚙️ Paramètres**.
3. Dans la section 👥 **Liste des élèves**, cliquez sur :
   ```
   📥 Importer la liste…
   ```
4. Sélectionnez votre fichier Excel (.xlsx) ou CSV contenant les colonnes :
   ```
   Nom | Prénom | Né(e) le | Sexe | Classe
   ```
5. Validez. Les élèves apparaissent dans le champ de recherche du formulaire de visite.

> 🎯 Le nom, la classe et l’âge s’autocomplètent automatiquement lors de la création d’une visite.

### Création d’une visite
1. Cliquez sur **＋ Nouvelle visite**.
2. Saisissez :
   - **Nom de l’élève** → l’autocomplétion remplit la **classe** et l’**âge** automatiquement.
   - **Observation(s)** et **Traitement** si nécessaire.
   - **Heure de départ en classe** et **Heure de départ à la maison**.
3. Cliquez sur **Enregistrer**.

---

## 5. Fonctionnalités principales

### 📊 Statistiques
- Cartes récapitulatives : visites d’aujourd’hui, cette semaine, ce mois, élèves différents.
- Graphiques :
  - Visites par mois
  - Classes les plus fréquentes

### 🔍 Filtrage
- Par nom (recherche en temps réel)
- Par classe (dynamique selon les élèves importés)
- Par âge (calculé automatiquement)
- Par plage de dates

### 💾 Sauvegarde
- **📤 Exporter → Sauvegarde complète (JSON)** : télécharge un fichier de secours complet.
- (Optionnel) Configurer un dossier de sauvegarde automatique dans **⚙️ Paramètres**.

### 🖨️ Impression
- Cliquez sur **🖨️ Imprimer** pour générer un rapport PDF des visites filtrées.

---

## 6. Dépannage

| Problème | Solution |
|---|---|
| Le serveur ne démarre pas | Vérifiez que PowerShell est autorisé (exécuter en tant qu’administrateur si nécessaire) |
| L’icône d’installation n’apparaît pas | Actualisez la page (`F5`) ou essayez un autre navigateur |
| La liste des élèves ne s’affiche pas | Vérifiez que le fichier Excel/CSV contient bien une colonne "Nom" |
| L’application est lente | Fermez d’autres onglets lourds dans le navigateur |

---

## 7. Support
Pour toute question technique ou signalement de bug :
> Contactez l’administrateur informatique de l’École Jules Verne.

---

*Version du logiciel : 1.0 — Dernière mise à jour : Septembre 2026*