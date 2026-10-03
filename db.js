/**
 * Module de gestion de la base de données SQLite avec better-sqlite3.
 * Contient la structure des tables, l'initialisation et les requêtes préparées paramétrées.
 */

const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DB_PATH || 'database.sqlite';
const db = new Database(path.resolve(__dirname, dbPath));

// Activation des performances WAL et des contraintes de clés étrangères
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Initialisation des tables et des index
 */
function initDatabase() {
  db.exec(`
    -- Table des utilisateurs
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Table des messages
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Index pour accélérer les requêtes fréquentes
    CREATE INDEX IF NOT EXISTS idx_messages_conversation 
      ON messages(sender_id, receiver_id);

    CREATE INDEX IF NOT EXISTS idx_messages_receiver_read 
      ON messages(receiver_id, is_read);

    CREATE INDEX IF NOT EXISTS idx_messages_created_at 
      ON messages(created_at);
  `);
}

initDatabase();

// --- Requêtes préparées pour la sécurité et les performances ---

const stmtCreateUser = db.prepare(`
  INSERT INTO users (username, password_hash) 
  VALUES (?, ?)
`);

const stmtFindUserByUsername = db.prepare(`
  SELECT id, username, password_hash, created_at 
  FROM users 
  WHERE username = ?
`);

const stmtFindUserById = db.prepare(`
  SELECT id, username, created_at 
  FROM users 
  WHERE id = ?
`);

const stmtSearchUsers = db.prepare(`
  SELECT id, username, created_at 
  FROM users 
  WHERE id != ? AND username LIKE ? COLLATE NOCASE 
  ORDER BY username ASC 
  LIMIT 25
`);

const stmtListAllOtherUsers = db.prepare(`
  SELECT id, username, created_at 
  FROM users 
  WHERE id != ? 
  ORDER BY username ASC 
  LIMIT 50
`);

const stmtSaveMessage = db.prepare(`
  INSERT INTO messages (sender_id, receiver_id, content, is_read) 
  VALUES (?, ?, ?, 0)
`);

const stmtGetMessageById = db.prepare(`
  SELECT id, sender_id, receiver_id, content, is_read, created_at 
  FROM messages 
  WHERE id = ?
`);

const stmtGetConversationMessages = db.prepare(`
  SELECT id, sender_id, receiver_id, content, is_read, created_at 
  FROM messages 
  WHERE (sender_id = ? AND receiver_id = ?) 
     OR (sender_id = ? AND receiver_id = ?) 
  ORDER BY id ASC
`);

const stmtMarkMessagesAsRead = db.prepare(`
  UPDATE messages 
  SET is_read = 1 
  WHERE sender_id = ? AND receiver_id = ? AND is_read = 0
`);

const stmtCountUnreadPerSender = db.prepare(`
  SELECT COUNT(*) as count 
  FROM messages 
  WHERE receiver_id = ? AND sender_id = ? AND is_read = 0
`);

const stmtGetUserConversations = db.prepare(`
  WITH ranked_messages AS (
    SELECT 
      id,
      sender_id,
      receiver_id,
      content,
      is_read,
      created_at,
      CASE 
        WHEN sender_id = ? THEN receiver_id 
        ELSE sender_id 
      END AS contact_id,
      ROW_NUMBER() OVER (
        PARTITION BY (CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END)
        ORDER BY id DESC
      ) as rn
    FROM messages
    WHERE sender_id = ? OR receiver_id = ?
  ),
  unread_counts AS (
    SELECT sender_id AS contact_id, COUNT(*) as unread_count
    FROM messages
    WHERE receiver_id = ? AND is_read = 0
    GROUP BY sender_id
  )
  SELECT 
    u.id AS user_id,
    u.username,
    rm.content AS last_message,
    rm.created_at AS last_message_time,
    rm.sender_id AS last_sender_id,
    COALESCE(uc.unread_count, 0) AS unread_count
  FROM ranked_messages rm
  JOIN users u ON u.id = rm.contact_id
  LEFT JOIN unread_counts uc ON uc.contact_id = rm.contact_id
  WHERE rm.rn = 1
  ORDER BY rm.id DESC
`);

module.exports = {
  db,
  createUser: (username, passwordHash) => {
    const info = stmtCreateUser.run(username, passwordHash);
    return { id: info.lastInsertRowid, username };
  },
  findUserByUsername: (username) => stmtFindUserByUsername.get(username),
  findUserById: (id) => stmtFindUserById.get(id),
  searchUsers: (query, currentUserId) => stmtSearchUsers.all(currentUserId, `%${query}%`),
  listAllOtherUsers: (currentUserId) => stmtListAllOtherUsers.all(currentUserId),
  saveMessage: (senderId, receiverId, content) => {
    const info = stmtSaveMessage.run(senderId, receiverId, content);
    return stmtGetMessageById.get(info.lastInsertRowid);
  },
  getMessageById: (id) => stmtGetMessageById.get(id),
  getConversationMessages: (user1Id, user2Id) => stmtGetConversationMessages.all(user1Id, user2Id, user2Id, user1Id),
  markMessagesAsRead: (senderId, receiverId) => {
    const info = stmtMarkMessagesAsRead.run(senderId, receiverId);
    return info.changes;
  },
  countUnreadFromSender: (receiverId, senderId) => {
    const res = stmtCountUnreadPerSender.get(receiverId, senderId);
    return res ? res.count : 0;
  },
  getUserConversations: (userId) => stmtGetUserConversations.all(userId, userId, userId, userId, userId)
};
