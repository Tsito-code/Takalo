/**
 * Routes de gestion des messages : historique et statut de lecture
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

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

module.exports = router;
