/**
 * Routes d'authentification : Inscription, Connexion, Déconnexion et Profil courant.
 * Sécurisation contre le brute-force avec express-rate-limit.
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { generateToken, getCookieOptions, COOKIE_NAME, authenticateToken } = require('../middleware/auth');

// Limiteur de débit pour prévenir les attaques par force brute sur la connexion
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 tentatives maximum par IP
  message: { error: 'Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Validation et assainissement du nom d'utilisateur
 */
function validateUsername(username) {
  if (!username || typeof username !== 'string') {
    return 'Le nom d’utilisateur est requis.';
  }
  const clean = username.trim();
  if (clean.length < 3 || clean.length > 20) {
    return 'Le nom d’utilisateur doit comporter entre 3 et 20 caractères.';
  }
  // Lettres, chiffres, tirets et underscores autorisés
  const regex = /^[a-zA-Z0-9_-]+$/;
  if (!regex.test(clean)) {
    return 'Le nom d’utilisateur ne peut contenir que des lettres, des chiffres, des tirets et des tirets bas (_).';
  }
  return null;
}

/**
 * Validation du mot de passe
 */
function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return 'Le mot de passe est requis.';
  }
  if (password.length < 6) {
    return 'Le mot de passe doit contenir au moins 6 caractères.';
  }
  return null;
}

/**
 * POST /api/auth/register
 * Inscription d'un nouvel utilisateur
 */
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    const usernameError = validateUsername(username);
    if (usernameError) {
      return res.status(400).json({ error: usernameError });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const cleanUsername = username.trim();

    // Vérifier l'unicité
    const existing = db.findUserByUsername(cleanUsername);
    if (existing) {
      return res.status(409).json({ error: 'Ce nom d’utilisateur est déjà utilisé.' });
    }

    // Hachage sécurisé du mot de passe avec bcrypt (salt rounds = 10)
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const newUser = db.createUser(cleanUsername, passwordHash);

    // Génération du JWT et stockage dans le cookie httpOnly
    const token = generateToken(newUser);
    res.cookie(COOKIE_NAME, token, getCookieOptions());

    return res.status(201).json({
      success: true,
      message: 'Compte créé avec succès.',
      user: { id: newUser.id, username: newUser.username }
    });
  } catch (err) {
    console.error('Erreur lors de l’inscription :', err);
    return res.status(500).json({ error: 'Erreur interne lors de la création du compte.' });
  }
});

/**
 * POST /api/auth/login
 * Connexion d'un utilisateur existant avec rate-limit
 */
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Nom d’utilisateur et mot de passe requis.' });
    }

    const cleanUsername = username.trim();
    const user = db.findUserByUsername(cleanUsername);

    if (!user) {
      return res.status(401).json({ error: 'Identifiants incorrects.' });
    }

    // Vérification du mot de passe
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Identifiants incorrects.' });
    }

    // Création du token JWT et injection dans le cookie
    const token = generateToken(user);
    res.cookie(COOKIE_NAME, token, getCookieOptions());

    return res.json({
      success: true,
      message: 'Connexion réussie.',
      user: { id: user.id, username: user.username }
    });
  } catch (err) {
    console.error('Erreur lors de la connexion :', err);
    return res.status(500).json({ error: 'Erreur interne lors de la connexion.' });
  }
});

/**
 * POST /api/auth/logout
 * Déconnexion (invalidation du cookie)
 */
router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax'
  });
  return res.json({ success: true, message: 'Déconnexion effectuée.' });
});

/**
 * GET /api/auth/me
 * Vérification de la session active
 */
router.get('/me', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'Utilisateur non trouvé.' });
  }
  return res.json({
    user: {
      id: user.id,
      username: user.username,
      created_at: user.created_at
    }
  });
});

module.exports = router;
