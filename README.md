# 💬 Messagerie Instantanée (MVP Temps Réel)

Une application web moderne de messagerie instantanée en temps réel (type WhatsApp / Telegram, version MVP), développée avec **Node.js**, **Express**, **Socket.io**, **SQLite** (`better-sqlite3`), et une interface responsive en **HTML / CSS / JavaScript vanilla** (aucun framework frontend).

---

## 🚀 Fonctionnalités du MVP

1. **Authentification complète** :
   - Inscription et connexion (nom d'utilisateur + mot de passe).
   - Déconnexion avec invalidation de session.
   - Mots de passe hachés avec `bcrypt` (salt rounds = 10).
   - Tokens JWT stockés dans des cookies `httpOnly` sécurisés (inaccessibles via JavaScript client).
   - Protection contre le brute-force avec `express-rate-limit`.

2. **Gestion des utilisateurs & Annuaire** :
   - Annuaire complet des utilisateurs inscrits.
   - Recherche dynamique en temps réel avec auto-complétion et debounce.

3. **Conversations privées 1-à-1** :
   - Liste des discussions récentes classées par date du dernier message.
   - Compteur en temps réel de messages non lus par conversation (badge numérique).
   - Confirmation automatique de lecture à l'ouverture de la discussion.

4. **Messagerie en temps réel (Socket.io)** :
   - Envoi et réception instantanée de messages sans rechargement de page.
   - Historique complet sauvegardé en base de données SQLite et rechargé lors de l'ouverture d'un chat.
   - Double coche visuelle de statut (envoyé / lu).

5. **Présence & Statuts dynamiques** :
   - Indicateur **en ligne / hors ligne** en temps réel (pastille verte / grise et statut textuel).
   - Indicateur **« est en train d'écrire... »** (animation fluide à 3 points et texte d'en-tête).

6. **Interface moderne & Responsive** :
   - **Desktop** : Disposition en deux colonnes (liste des conversations à gauche, fenêtre de chat à droite).
   - **Mobile** : Affichage fluide à une colonne avec bouton de retour (`←`) vers les conversations.
   - Thème **Clair / Sombre** basculable avec détection des préférences système et mémorisation dans `localStorage`.
   - Bulles de messages ergonomiques avec horodatage (`14:32`) et séparateurs de date intelligents (« Aujourd'hui », « Hier »).
   - Défilement automatique vers le bas lors de l'arrivée ou de l'envoi de nouveaux messages.

---

## 🛡️ Sécurité & Bonnes Pratiques

- **Protection contre les attaques XSS** : Toutes les entrées et contenus de messages sont injectés dans le DOM via des APIs sécurisées (`textContent`, création de nœuds DOM). Aucun `innerHTML` avec du contenu utilisateur brut.
- **Requêtes SQL 100% paramétrées** : Utilisation stricte des `prepare()` de `better-sqlite3` pour bannir toute possibilité d'injection SQL.
- **Vérification d'authentification Socket.io** : Chaque connexion WebSocket est vérifiée via son cookie JWT lors du handshake, et l'identité de l'expéditeur est garantie côté serveur sur chaque événement.
- **Mode SQLite WAL (Write-Ahead Logging)** : Concurrence élevée et performances optimales en lecture/écriture.

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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index pour optimiser les performances
CREATE INDEX idx_messages_conversation ON messages(sender_id, receiver_id);
CREATE INDEX idx_messages_receiver_read ON messages(receiver_id, is_read);
CREATE INDEX idx_messages_created_at ON messages(created_at);
```

---

## 📂 Structure du Projet

```text
messagerie/
├── server.js               # Point d'entrée du serveur Express & Socket.io
├── db.js                   # Gestionnaire de base de données SQLite & requêtes
├── package.json            # Dépendances et scripts de démarrage
├── .env.example            # Gabarit des variables d'environnement
├── .env                    # Configuration active locale
├── README.md               # Documentation complète
├── middleware/
│   └── auth.js             # Middlewares d'authentification JWT (Express & Socket.io)
├── routes/
│   ├── auth.js             # Routes d'authentification (login, register, logout, me)
│   ├── users.js            # Recherche d'utilisateurs et liste des conversations
│   └── messages.js         # Historique des messages et statut de lecture
├── socket/
│   └── chat.js             # Événements temps réel (présence, messages, saisie)
├── public/
│   ├── index.html          # Interface principale du chat (2 colonnes / responsive)
│   ├── login.html          # Page de connexion et inscription (onglets)
│   ├── css/
│   │   ├── style.css       # Styles du chat, thèmes clair/sombre, responsive mobile
│   │   └── auth.css        # Styles de la page d'authentification
│   └── js/
│       ├── app.js          # Client de chat (Socket.io, DOM XSS-safe, événements)
│       ├── auth.js         # Client d'authentification (AJAX, validation, redirection)
│       └── theme.js        # Gestionnaire de thème clair/sombre persistant
└── test_e2e.js             # Suite de tests d'intégration automatisés de bout en bout
```

---

## ⚙️ Installation & Démarrage

### 1. Prérequis
- [Node.js](https://nodejs.org/) (version 18 ou supérieure recommandée).
- `npm` inclus avec Node.js.

### 2. Cloner ou se placer dans le répertoire du projet
```bash
cd messagerie
```

### 3. Installer les dépendances
```bash
npm install
```

### 4. Configuration de l'environnement
Un fichier `.env.example` est fourni. Copiez-le vers `.env` si ce n'est pas déjà fait :
```bash
cp .env.example .env
```
Contenu par défaut de `.env` :
```env
PORT=3000
JWT_SECRET=votre_cle_secrete_jwt_a_personnaliser
NODE_ENV=development
DB_PATH=database.sqlite
```

### 5. Lancer l'application
- **Mode production / standard :**
  ```bash
  npm start
  ```
- **Mode développement (redémarrage automatique avec Node --watch) :**
  ```bash
  npm run dev
  ```

L'application est immédiatement accessible à l'adresse : **[http://localhost:3000](http://localhost:3000)**.

### 6. Exécuter les tests automatisés
Pour valider l'intégrité de la base de données, de l'authentification et du temps réel Socket.io :
```bash
npm test
```

---

## 💡 Comment tester l'échange de messages en direct ?

1. Ouvrez un premier navigateur (ex: Chrome ou Edge standard) et rendez-vous sur `http://localhost:3000`.
2. Créez un compte (par exemple : `alice` avec le mot de passe `password123`).
3. Ouvrez une **fenêtre de navigation privée** ou un second navigateur (ex: Firefox) sur `http://localhost:3000`.
4. Créez un second compte (par exemple : `bob` avec le mot de passe `password123`).
5. Depuis le compte `bob`, cliquez sur l'onglet **Annuaire** à gauche et sélectionnez `alice`.
6. Envoyez un message : vous observerez instantanément l'arrivée du message chez `alice`, l'indicateur de saisie en temps réel, l'indicateur « En ligne », ainsi que la mise à jour des compteurs et des statuts de lecture !

---

## 🔮 Évolutions Futures (Roadmap)

Voici les extensions architecturales recommandées pour enrichir cette base :

1. **Discussions et Salons de Groupe** :
   - Ajout d'une table `groups` et d'une table associative `group_members`.
   - Rooms Socket.io par groupe (`socket.join('group_' + groupId)`).
   - Gestion des rôles (administrateur, membre, modérateur).
2. **Partage de Médias et Pièces Jointes** :
   - Support des images, notes vocales et documents PDF.
   - Téléversement sécurisé via `multer` ou stockage objet (Cloud Storage / S3 / MinIO) avec génération de miniatures.
3. **Chiffrement de Bout en Bout (E2EE)** :
   - Implémentation du protocole Double Ratchet / Signal Protocol via la **Web Crypto API**.
   - Génération et échange de paires de clés publiques (X3DH) côté client dans le navigateur.
   - Les messages transitent et sont stockés sous forme de ciphertexts illisibles pour le serveur.
4. **Notifications Push Web & Sons** :
   - Support de la Web Push API et Service Workers pour recevoir des notifications même lorsque l'onglet est en arrière-plan.
   - Signaux sonores discrets configurables pour les messages entrants.
5. **Appels Audio & Vidéo** :
   - Signalisation WebRTC via Socket.io pour lancer des appels directs de pair-à-pair (P2P).
