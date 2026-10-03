/**
 * Routes de gestion des utilisateurs et des conversations
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Toutes les routes utilisateurs nécessitent d'être connecté
router.use(authenticateToken);

/**
 * GET /api/users/conversations
 * Liste les conversations récentes de l'utilisateur avec dernier message et compteur de non-lus
 */
router.get('/conversations', (req, res) => {
  try {
    const currentUserId = req.user.id;
    const conversations = db.getUserConversations(currentUserId);
    res.json({ conversations });
  } catch (err) {
    console.error('Erreur récupération conversations :', err);
    res.status(500).json({ error: 'Impossible de charger vos conversations.' });
  }
});

/**
 * GET /api/users/search?q=query
 * Recherche des utilisateurs par nom d'utilisateur (hors utilisateur connecté)
 */
router.get('/search', (req, res) => {
  try {
    const currentUserId = req.user.id;
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    let users;
    if (query.length > 0) {
      users = db.searchUsers(query, currentUserId);
    } else {
      users = db.listAllOtherUsers(currentUserId);
    }

    res.json({ users });
  } catch (err) {
    console.error('Erreur recherche utilisateurs :', err);
    res.status(500).json({ error: 'Erreur lors de la recherche des utilisateurs.' });
  }
});

/**
 * GET /api/users/:id
 * Informations publiques sur un utilisateur spécifique
 */
router.get('/:id', (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (isNaN(targetId)) {
      return res.status(400).json({ error: 'Identifiant invalide.' });
    }

    const user = db.findUserById(targetId);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        created_at: user.created_at
      }
    });
  } catch (err) {
    console.error('Erreur récupération utilisateur :', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
