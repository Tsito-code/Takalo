/**
 * Gestionnaire temps réel Socket.io
 * Gère la présence (en ligne/hors ligne), l'envoi/réception de messages,
 * les indicateurs d'écriture et les confirmations de lecture.
 */

const db = require('../db');
const { socketAuthMiddleware } = require('../middleware/auth');

// Map pour suivre les utilisateurs connectés et leurs sockets : userId => Set(socketId)
const onlineUsers = new Map();

function initSocket(io) {
  // Application du middleware d'authentification Socket.io
  io.use(socketAuthMiddleware);

  io.on('connection', (socket) => {
    const user = socket.user;
    const userId = user.id;

    // Rejoindre la salle personnelle de l'utilisateur pour cibler facilement les messages
    socket.join(`user_${userId}`);

    // Gestion du statut en ligne
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
      // Informer tous les autres clients que cet utilisateur vient de se connecter
      socket.broadcast.emit('user_status_change', {
        userId,
        username: user.username,
        status: 'online'
      });
    }
    onlineUsers.get(userId).add(socket.id);

    // Envoyer à l'utilisateur qui vient de se connecter la liste de tous les IDs en ligne
    const activeUserIds = Array.from(onlineUsers.keys());
    socket.emit('initial_online_users', activeUserIds);

    /**
     * Envoi d'un message privé 1-à-1
     */
    socket.on('send_message', (data, callback) => {
      try {
        if (!data || typeof data !== 'object') {
          if (callback) callback({ error: 'Données invalides.' });
          return;
        }

        const receiverId = parseInt(data.receiverId, 10);
        const rawContent = data.content;

        if (isNaN(receiverId) || receiverId <= 0 || receiverId === userId) {
          if (callback) callback({ error: 'Destinataire invalide.' });
          return;
        }

        // Vérification de l'existence du destinataire
        const receiver = db.findUserById(receiverId);
        if (!receiver) {
          if (callback) callback({ error: 'Le destinataire n’existe pas.' });
          return;
        }

        // Nettoyage et validation du contenu
        if (typeof rawContent !== 'string') {
          if (callback) callback({ error: 'Contenu du message invalide.' });
          return;
        }

        const content = rawContent.trim();
        if (content.length === 0) {
          if (callback) callback({ error: 'Le message ne peut pas être vide.' });
          return;
        }

        if (content.length > 3000) {
          if (callback) callback({ error: 'Le message dépasse la limite de 3000 caractères.' });
          return;
        }

        // Sauvegarde persistante en base de données SQLite (requête paramétrée)
        const savedMessage = db.saveMessage(userId, receiverId, content);

        // Envoyer le message au destinataire s'il est connecté
        io.to(`user_${receiverId}`).emit('new_message', savedMessage);

        // Répondre à l'expéditeur avec le message persisté (horodatage, id généré)
        if (callback) {
          callback({ success: true, message: savedMessage });
        } else {
          socket.emit('message_sent', savedMessage);
        }
      } catch (err) {
        console.error('Erreur socket send_message :', err);
        if (callback) callback({ error: 'Erreur lors de l’envoi du message.' });
      }
    });

    /**
     * Indicateur d'écriture : commence à écrire
     */
    socket.on('typing_start', (data) => {
      if (!data || !data.receiverId) return;
      const receiverId = parseInt(data.receiverId, 10);
      if (isNaN(receiverId) || receiverId === userId) return;

      io.to(`user_${receiverId}`).emit('user_typing', {
        senderId: userId,
        username: user.username
      });
    });

    /**
     * Indicateur d'écriture : a arrêté d'écrire
     */
    socket.on('typing_stop', (data) => {
      if (!data || !data.receiverId) return;
      const receiverId = parseInt(data.receiverId, 10);
      if (isNaN(receiverId) || receiverId === userId) return;

      io.to(`user_${receiverId}`).emit('user_stop_typing', {
        senderId: userId
      });
    });

    /**
     * Marquage des messages comme lus en temps réel
     */
    socket.on('mark_read', (data) => {
      if (!data || !data.senderId) return;
      const otherSenderId = parseInt(data.senderId, 10);
      if (isNaN(otherSenderId) || otherSenderId === userId) return;

      const changes = db.markMessagesAsRead(otherSenderId, userId);
      if (changes > 0) {
        // Prévenir l'expéditeur d'origine que ses messages ont été lus
        io.to(`user_${otherSenderId}`).emit('messages_read_by_recipient', {
          readerId: userId
        });
      }
    });

    /**
     * Déconnexion du socket
     */
    socket.on('disconnect', () => {
      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
          // Prévenir tout le monde que l'utilisateur est maintenant hors ligne
          socket.broadcast.emit('user_status_change', {
            userId,
            username: user.username,
            status: 'offline'
          });
        }
      }
    });
  });
}

module.exports = {
  initSocket,
  onlineUsers
};
