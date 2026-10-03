/**
 * Script de test complet pour valider toutes les fonctionnalités de la messagerie
 */

const http = require('http');
const db = require('./db');
const bcrypt = require('bcryptjs');

async function runTests() {
  console.log('--- 1. Test Base de données SQLite ---');
  
  // Nettoyage pour les tests
  db.db.prepare('DELETE FROM messages').run();
  db.db.prepare('DELETE FROM users').run();

  const hash1 = await bcrypt.hash('password123', 10);
  const hash2 = await bcrypt.hash('secret456', 10);

  const alice = db.createUser('alice', hash1);
  const bob = db.createUser('bob', hash2);
  const charlie = db.createUser('charlie', hash2);

  console.log('Utilisateurs créés :', alice, bob, charlie);

  // Recherche d'utilisateurs
  const searchResults = db.searchUsers('bo', alice.id);
  console.log('Recherche "bo" pour Alice :', searchResults.map(u => u.username));
  if (searchResults.length !== 1 || searchResults[0].username !== 'bob') {
    throw new Error('Échec du test de recherche');
  }

  // Envoi de messages
  const msg1 = db.saveMessage(alice.id, bob.id, 'Bonjour Bob !');
  const msg2 = db.saveMessage(bob.id, alice.id, 'Salut Alice, comment vas-tu ?');
  const msg3 = db.saveMessage(alice.id, bob.id, 'Très bien, merci ! Et toi ?');

  console.log('Messages sauvegardés avec succès.');

  // Récupération de l'historique
  const history = db.getConversationMessages(alice.id, bob.id);
  console.log(`Nombre de messages Alice <-> Bob : ${history.length} (attendu : 3)`);
  if (history.length !== 3) {
    throw new Error('Échec du test d\'historique');
  }

  // Vérification des conversations récentes et des non-lus
  const bobConvs = db.getUserConversations(bob.id);
  console.log('Conversations de Bob :', bobConvs);
  // Bob a reçu 2 messages d'Alice non lus (msg1 et msg3)
  const aliceConvForBob = bobConvs.find(c => c.user_id === alice.id);
  if (!aliceConvForBob || aliceConvForBob.unread_count !== 2) {
    throw new Error(`Échec du compteur de non-lus. Attendu : 2, obtenu : ${aliceConvForBob?.unread_count}`);
  }

  // Bob lit les messages
  const marked = db.markMessagesAsRead(alice.id, bob.id);
  console.log(`Messages marqués comme lus par Bob : ${marked}`);
  if (marked !== 2) {
    throw new Error('Échec du marquage de lecture');
  }

  const bobConvsAfterRead = db.getUserConversations(bob.id);
  const aliceConvAfter = bobConvsAfterRead.find(c => c.user_id === alice.id);
  if (aliceConvAfter.unread_count !== 0) {
    throw new Error('Le compteur de non-lus devrait être 0 après lecture');
  }

  console.log(' Tous les tests SQLite et logiques sont validés avec succès !');
}

runTests().catch(err => {
  console.error('Erreur de test :', err);
  process.exit(1);
});
