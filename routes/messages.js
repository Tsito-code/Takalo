/**
 * Routes de gestion des messages : historique, synchronisation, statut de lecture et suppression
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

/**
 * GET /api/messages/sync?sinceId=123
 * Récupère les messages manqués depuis le dernier ID connu pour gérer la reconnexion automatique
 */
router.get('/sync', (req, res) => {
  try {
    const currentUserId = req.user.id;
    const sinceId = parseInt(req.query.sinceId, 10) || 0;

    const messages = db.getMissedMessages(currentUserId, sinceId);
    res.json({ messages });
  } catch (err) {
    console.error('Erreur synchronisation messages :', err);
    res.status(500).json({ error: 'Impossible de synchroniser les messages récents.' });
  }
});

/**
 * GET /api/messages/:otherUserId
 * Récupère l'historique complet des messages entre l'utilisateur connecté et un autre utilisateur
 */
router.get('/:otherUserId', (req, res) => {
  try {
    const currentUserId = req.user.id;
    const otherUserId = parseInt(req.params.otherUserId, 10);

    if (isNaN(otherUserId) || otherUserId <= 0) {
      return res.status(400).json({ error: 'Identifiant d’interlocuteur invalide.' });
    }

    if (otherUserId === currentUserId) {
      return res.status(400).json({ error: 'Impossible de charger une conversation avec soi-même.' });
    }

    const messages = db.getConversationMessages(currentUserId, otherUserId);
    res.json({ messages });
  } catch (err) {
    console.error('Erreur chargement messages :', err);
    res.status(500).json({ error: 'Impossible de charger l’historique des messages.' });
  }
});

/**
 * POST /api/messages/:otherUserId/read
 * Marque tous les messages reçus de cet interlocuteur comme lus
 */
router.post('/:otherUserId/read', (req, res) => {
  try {
    const currentUserId = req.user.id;
    const otherUserId = parseInt(req.params.otherUserId, 10);

    if (isNaN(otherUserId) || otherUserId <= 0) {
      return res.status(400).json({ error: 'Identifiant invalide.' });
    }

    const count = db.markMessagesAsRead(otherUserId, currentUserId);
    res.json({ success: true, markedCount: count });
  } catch (err) {
    console.error('Erreur marquage lecture :', err);
    res.status(500).json({ error: 'Erreur lors de la mise à jour des messages lus.' });
  }
});

/**
 * DELETE /api/messages/:id
 * Suppression logique de son propre message (vérification des droits et diffusion Socket.io)
 */
router.delete('/:id', (req, res) => {
  try {
    const currentUserId = req.user.id;
    const messageId = parseInt(req.params.id, 10);

    if (isNaN(messageId) || messageId <= 0) {
      return res.status(400).json({ error: 'Identifiant de message invalide.' });
    }

    const result = db.deleteMessage(messageId, currentUserId);

    if (result.error === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Message introuvable.' });
    }

    if (result.error === 'FORBIDDEN') {
      return res.status(403).json({ error: 'Vous ne pouvez supprimer que vos propres messages.' });
    }

    if (result.error === 'ALREADY_DELETED') {
      return res.status(400).json({ error: 'Ce message a déjà été supprimé.' });
    }

    // Émettre l'événement Socket.io message:deleted aux deux parties (expéditeur et destinataire)
    const io = req.app.get('io');
    if (io) {
      const payload = {
        id: result.message.id,
        senderId: result.message.sender_id,
        receiverId: result.message.receiver_id,
        deletedAt: result.message.deleted_at
      };

      io.to(`user:${result.message.sender_id}`)
        .to(`user:${result.message.receiver_id}`)
        .to(`user_${result.message.sender_id}`)
        .to(`user_${result.message.receiver_id}`)
        .emit('message:deleted', payload);
    }

    return res.json({
      success: true,
      message: 'Message supprimé avec succès.',
      data: result.message
    });
  } catch (err) {
    console.error('Erreur suppression message :', err);
    res.status(500).json({ error: 'Erreur serveur lors de la suppression du message.' });
  }
});

module.exports = router;
