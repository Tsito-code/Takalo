# 💬 Messagerie Instantanée (Temps Réel & Haute Performance)

Une application web moderne de messagerie instantanée en temps réel (type WhatsApp / Telegram), développée avec **Node.js**, **Express**, **Socket.io**, **SQLite** (`better-sqlite3`), et une interface responsive en **HTML / CSS / JavaScript vanilla** (aucun framework frontend).

---

## 🚀 Fonctionnalités Complètes

### 1. Authentification & Sécurité
- **Inscription & Connexion** (nom d'utilisateur + mot de passe).
- Mots de passe hachés avec **bcrypt** (salt rounds = 10).
- Tokens JWT stockés dans des **cookies `httpOnly`** sécurisés (inaccessibles via JavaScript client, protection contre le vol de session XSS).
- Protection contre les attaques par force brute avec **express-rate-limit** sur les tentatives de connexion.
- Déconnexion propre avec invalidation de session.

### 2. Messagerie en Temps Réel (Socket.io)
- **Affichage optimiste instantané** : le message s'affiche immédiatement chez l'expéditeur dès l'envoi, puis est validé et confirmé par le serveur (statuts envoyé / lu).
- **Réception instantanée sans rafraîchir la page** : le destinataire reçoit le message en direct dans la conversation active.
- **Gestion intelligente des conversations** : si le destinataire a une autre conversation ouverte, le message n'apparaît pas dans le chat actuel : le badge de non-lus s'incrémente et la conversation remonte automatiquement en haut de la liste.
- **Rooms dédiées par utilisateur** : chaque utilisateur rejoint sa propre room `user:<id>`, synchronisant instantanément tous ses onglets ouverts.
- **Reconnexion automatique & Anti-doublons** : après une coupure réseau, le client se reconnecte automatiquement et récupère les messages manqués via l'API de synchronisation (`/api/messages/sync`). Dédoublonnage strict par identifiant unique de message.
- **Défilement intelligent** : défilement automatique vers le bas uniquement si l'utilisateur est déjà positionné en bas de la discussion.

### 3. Suppression de ses Propres Messages
- **Bouton de suppression** : accessible au survol (et par appui prolongé sur mobile) uniquement sur ses propres messages.
- **Confirmation avant suppression** pour éviter toute action accidentelle.
- **Suppression logique sécurisée côté serveur** : vérification stricte de l'auteur (`sender_id === req.user.id`, renvoi d'une erreur 403 sinon) avec horodatage (`deleted_at`) et drapeau (`is_deleted = 1`). Le contenu supprimé n'est plus jamais retourné par l'API.
- **Mise à jour en temps réel chez les deux interlocuteurs** : événement Socket.io `message:deleted` remplaçant le message par *"Ce message a été supprimé"* en italique grisé.
- **Mise à jour dynamique de l'aperçu** dans la barre latérale des discussions si le dernier message est supprimé.

### 4. Notifications Avancées
- **Bannières Toast empilées** : affichage en haut de l'écran des nouveaux messages arrivant dans une conversation fermée (nom de l'expéditeur, aperçu tronqué à 60 caractères, fermeture à la croix et clic pour ouvrir la discussion, max 3 visibles à la fois, disparition en 4s).
- **Notifications système du navigateur (`Notification API`)** : affichées lorsque l'onglet est en arrière-plan (`document.hidden`). Demande de permission initiée par l'utilisateur via le bouton dédié dans l'en-tête.
- **Son discret à la réception (Web Audio API)** : carillon synthétisé harmonieusement sans dépendance de fichier externe, avec bouton d'activation/désactivation persistant dans `localStorage`.
- **Compteur de non-lus dans le titre de l'onglet** : affichage dynamique `(3) Messagerie Instantanée`, synchronisé au focus de la page.
- Aucune notification déclenchée pour ses propres messages.

### 5. Interface Responsive Moderne (Desktop & Mobile)
- **Desktop** : disposition élégante en 2 colonnes (panneau des conversations à gauche, fenêtre de chat à droite).
- **Mobile** : navigation fluide en 1 colonne avec bouton de retour (`←`).
- **Thème Clair / Sombre** mémorisé dans `localStorage` avec respect automatique des préférences système (`prefers-color-scheme`).
- **Annuaire & Recherche en direct** avec filtre debounce instantané.

---

## 🛡️ Sécurité & Bonnes Pratiques

- **Protection XSS intégrale** : toutes les données utilisateur sont insérées exclusivement via `textContent` ou les méthodes DOM natives.
- **Requêtes SQL 100% paramétrées** : requêtes préparées `better-sqlite3` avec liaisons d'arguments (`?`), immunisées contre l'injection SQL.
- **Authentification sur chaque événement Socket.io** : middleware de validation des tokens de cookie lors du handshake et vérification systématique de l'identité de l'émetteur.
- **Mode SQLite WAL (Write-Ahead Logging)** : concurrence élevée et intégrité transactionnelle.

---

## 🗄️ Schéma de la Base de Données (SQLite)

```sql
-- Table des utilisateurs
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table des messages
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  is_deleted INTEGER DEFAULT 0,
  deleted_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index pour accélérer les recherches fréquentes
CREATE INDEX idx_messages_conversation ON messages(sender_id, receiver_id);
CREATE INDEX idx_messages_receiver_read ON messages(receiver_id, is_read);
CREATE INDEX idx_messages_created_at ON messages(created_at);
```

---

## 📂 Structure du Projet

```text
messagerie/
├── server.js               # Serveur Express & Socket.io
├── db.js                   # Gestionnaire SQLite, migrations et requêtes paramétrées
├── package.json            # Dépendances et scripts npm
├── .env.example            # Gabarit des variables d'environnement
├── .env                    # Configuration active locale (non suivi par Git)
├── README.md               # Documentation complète
├── middleware/
│   └── auth.js             # Middlewares JWT cookie httpOnly (Express & Socket.io)
├── routes/
│   ├── auth.js             # Authentification (inscription, connexion, déconnexion)
│   ├── users.js            # Annuaire et liste des conversations récentes
│   └── messages.js         # Historique, lecture, suppression et synchronisation
├── socket/
│   └── chat.js             # Événements temps réel (présence, frappe, messages, suppression)
├── public/
│   ├── index.html          # Interface de chat principale
│   ├── login.html          # Page de connexion & inscription
│   ├── css/
│   │   ├── style.css       # Styles modernes, responsive, thèmes clair/sombre, toasts
│   │   └── auth.css        # Styles de la page d'authentification
│   └── js/
│       ├── app.js          # Client de chat (Socket.io, DOM XSS-safe, notifications, son)
│       ├── auth.js         # Client d'authentification (AJAX, validation)
│       └── theme.js        # Gestionnaire de thème clair/sombre
├── test_e2e.js             # Suite de tests d'intégration automatisés
└── test_server.js          # Tests unitaires de la base SQLite
```

---

## ⚙️ Installation & Lancement

### 1. Prérequis
- [Node.js](https://nodejs.org/) (version 18 ou supérieure recommandée).
- `npm` (inclus avec Node.js).

### 2. Cloner le projet
```bash
git clone https://github.com/Tsito-code/Takalo.git
cd Takalo
```

### 3. Installer les dépendances
```bash
npm install
```

### 4. Configuration de l'environnement
Copiez le fichier d'exemple pour initialiser votre fichier `.env` :
```bash
cp .env.example .env
```
Contenu de `.env` :
```env
PORT=3000
JWT_SECRET=votre_cle_secrete_jwt_super_securisee_a_changer
NODE_ENV=development
DB_PATH=database.sqlite
```

### 5. Démarrer le serveur
```bash
npm start
```
*L'application est immédiatement accessible à l'adresse : **[http://localhost:3000](http://localhost:3000)***.

En mode développement avec rechargement automatique :
```bash
npm run dev
```

### 6. Lancer les tests automatisés
Pour valider l'intégrité de l'authentification, de la base de données, du temps réel et de la suppression :
```bash
npm test
```
