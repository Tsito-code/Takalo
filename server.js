/**
 * Serveur principal Express + Socket.io pour l'application de messagerie instantanée
 */

const express = require('express');
const http = require('http');
const path = require('path');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');
require('dotenv').config();

const db = require('./db');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const messageRoutes = require('./routes/messages');
const { initSocket } = require('./socket/chat');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

// Configuration de Socket.io avec support des cookies httpOnly
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true
  }
});
app.set('io', io);

// Middleware standard
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Fichiers statiques (HTML, CSS, JS frontend)
app.use(express.static(path.join(__dirname, 'public')));

// Enregistrement des routes de l'API REST
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);

// Initialisation des gestionnaires temps réel Socket.io
initSocket(io);

// Redirection conviviale par défaut
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Gestionnaire d'erreur global
app.use((err, req, res, next) => {
  console.error('Erreur non gérée :', err);
  res.status(500).json({ error: 'Une erreur interne est survenue sur le serveur.' });
});

// Démarrage du serveur
server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` Serveur de messagerie lancé avec succès !`);
  console.log(` Accès local : http://localhost:${PORT}`);
  console.log(` Mode : ${process.env.NODE_ENV || 'development'}`);
  console.log(`=======================================================`);
});

// Gestion propre de l'arrêt du processus
process.on('SIGINT', () => {
  console.log('\nFermeture du serveur...');
  server.close(() => {
    console.log('Serveur arrêté.');
    process.exit(0);
  });
});
