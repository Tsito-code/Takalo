/**
 * Middleware d'authentification JWT pour Express et Socket.io.
 * Vérifie le token JWT présent dans le cookie httpOnly (ou dans l'en-tête Authorization).
 */

const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'secret_par_defaut_a_changer';
const COOKIE_NAME = 'auth_token';

/**
 * Génère un token JWT pour un utilisateur
 */
function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * Options sécurisées pour le cookie httpOnly
 */
function getCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction, // En HTTPS uniquement en production
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 jours
  };
}

/**
 * Middleware pour routes Express
 */
function authenticateToken(req, res, next) {
  // Récupération depuis le cookie httpOnly ou en fallback Authorization header
  let token = req.cookies ? req.cookies[COOKIE_NAME] : null;

  if (!token && req.headers['authorization']) {
    const authHeader = req.headers['authorization'];
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Non authentifié. Veuillez vous connecter.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Session invalide ou expirée.' });
  }
}

/**
 * Extraction simple et robuste des cookies depuis la chaîne d'en-tête
 */
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.substring(0, idx).trim();
    const val = pair.substring(idx + 1).trim();
    cookies[key] = decodeURIComponent(val);
  }
  return cookies;
}

/**
 * Middleware d'authentification pour la connexion Socket.io
 */
function socketAuthMiddleware(socket, next) {
  try {
    const cookieHeader = socket.handshake.headers.cookie;
    const cookies = parseCookies(cookieHeader);
    const token = cookies[COOKIE_NAME] || socket.handshake.auth?.token;

    if (!token) {
      return next(new Error('Authentification requise pour Socket.io'));
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    return next(new Error('Token Socket.io invalide'));
  }
}

module.exports = {
  COOKIE_NAME,
  generateToken,
  getCookieOptions,
  authenticateToken,
  socketAuthMiddleware
};
