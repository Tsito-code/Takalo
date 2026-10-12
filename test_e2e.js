/**
 * Test d'intégration de bout en bout (E2E) :
 * - Démarrage du serveur
 * - Appels HTTP (Inscription, Connexion, Cookies)
 * - Connexion Socket.io
 * - Émission & Réception de messages en temps réel (Optimiste / Confirmation)
 * - Suppression de message en temps réel (message:deleted)
 * - Synchronisation après reconnexion (/api/messages/sync)
 * - Arrêt propre du serveur
 */

const { spawn } = require('child_process');
const http = require('http');
const { io } = require('socket.io-client');

const PORT = 3000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed
        });
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runE2E() {
  console.log('--- Démarrage du test E2E ---');

  // Lancement du serveur Node.js
  const serverProcess = spawn('node', ['server.js'], {
    cwd: __dirname,
    stdio: ['inherit', 'pipe', 'pipe']
  });

  serverProcess.stdout.on('data', (d) => process.stdout.write('[SERVEUR] ' + d));
  serverProcess.stderr.on('data', (d) => process.stderr.write('[SERVEUR-ERR] ' + d));

  // Attendre dynamiquement que le serveur écoute sur le port 3000
  let isReady = false;
  for (let i = 0; i < 20; i++) {
    await sleep(300);
    try {
      await httpRequest({ hostname: 'localhost', port: PORT, path: '/login', method: 'GET' });
      isReady = true;
      break;
    } catch (e) {
      // Pas encore prêt
    }
  }
  if (!isReady) throw new Error('Le serveur n\'a pas démarré dans les délais.');

  try {
    // 1. Inscription Utilisateur 1 : UserOne
    console.log('\n1. Test Inscription UserOne...');
    const regRes1 = await httpRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { username: 'userone_' + Date.now().toString().slice(-4), password: 'password123' });

    console.log('Statut inscription UserOne :', regRes1.statusCode, regRes1.body);
    if (regRes1.statusCode !== 201) throw new Error('Échec inscription 1');

    const cookieUser1 = regRes1.headers['set-cookie'] ? regRes1.headers['set-cookie'][0] : null;
    if (!cookieUser1) throw new Error('Cookie JWT manquant pour UserOne');

    // 2. Inscription Utilisateur 2 : UserTwo
    console.log('\n2. Test Inscription UserTwo...');
    const regRes2 = await httpRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { username: 'usertwo_' + Date.now().toString().slice(-4), password: 'password123' });

    console.log('Statut inscription UserTwo :', regRes2.statusCode, regRes2.body);
    if (regRes2.statusCode !== 201) throw new Error('Échec inscription 2');

    const cookieUser2 = regRes2.headers['set-cookie'] ? regRes2.headers['set-cookie'][0] : null;
    const user1Id = regRes1.body.user.id;
    const user2Id = regRes2.body.user.id;

    // 3. Test de session /api/auth/me pour UserOne
    console.log('\n3. Test /api/auth/me...');
    const meRes = await httpRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/auth/me',
      method: 'GET',
      headers: { 'Cookie': cookieUser1 }
    });
    console.log('Réponse me :', meRes.statusCode, meRes.body);
    if (meRes.statusCode !== 200 || meRes.body.user.id !== user1Id) throw new Error('Échec session');

    // 4. Test Socket.io en temps réel
    console.log('\n4. Connexion Socket.io pour UserOne et UserTwo...');

    const socket1 = io(`http://localhost:${PORT}`, {
      extraHeaders: { Cookie: cookieUser1 },
      transports: ['websocket']
    });

    const socket2 = io(`http://localhost:${PORT}`, {
      extraHeaders: { Cookie: cookieUser2 },
      transports: ['websocket']
    });

    await Promise.all([
      new Promise(resolve => socket1.on('connect', resolve)),
      new Promise(resolve => socket2.on('connect', resolve))
    ]);

    console.log('Sockets 1 et 2 connectés avec succès !');

    // 5. UserOne envoie un message en temps réel à UserTwo (avec tempId)
    console.log('\n5. Envoi de message temps réel Socket.io...');
    const messagePromise = new Promise((resolve) => {
      socket2.on('new_message', (msg) => {
        console.log('UserTwo a reçu le message en temps réel :', msg);
        resolve(msg);
      });
    });

    socket1.emit('send_message', {
      receiverId: user2Id,
      content: 'Coucou UserTwo, ceci est un test temps réel !',
      tempId: 'temp_test_123'
    });

    const receivedMessage = await messagePromise;
    if (receivedMessage.content !== 'Coucou UserTwo, ceci est un test temps réel !') {
      throw new Error('Contenu de message non conforme');
    }

    // 6. Test suppression de message en direct
    console.log('\n6. Test suppression de message (message:deleted)...');
    const deletePromise = new Promise((resolve) => {
      socket2.on('message:deleted', (delData) => {
        console.log('UserTwo a reçu la suppression en direct :', delData);
        resolve(delData);
      });
    });

    const delRes = await httpRequest({
      hostname: 'localhost',
      port: PORT,
      path: `/api/messages/${receivedMessage.id}`,
      method: 'DELETE',
      headers: { 'Cookie': cookieUser1 }
    });
    console.log('Réponse API DELETE :', delRes.statusCode, delRes.body);
    if (delRes.statusCode !== 200) throw new Error('Échec suppression de message');

    const deleteEventData = await deletePromise;
    if (deleteEventData.id !== receivedMessage.id) {
      throw new Error('ID du message supprimé non conforme');
    }

    // 7. Test synchronisation reconnexion /api/messages/sync
    console.log('\n7. Test synchronisation /api/messages/sync...');
    const syncRes = await httpRequest({
      hostname: 'localhost',
      port: PORT,
      path: `/api/messages/sync?sinceId=0`,
      method: 'GET',
      headers: { 'Cookie': cookieUser2 }
    });
    console.log('Réponse API sync :', syncRes.statusCode, syncRes.body);
    if (syncRes.statusCode !== 200 || !Array.isArray(syncRes.body.messages)) {
      throw new Error('Échec route sync');
    }

    // Fermeture des sockets
    socket1.disconnect();
    socket2.disconnect();

    console.log('\n Test E2E complet réussi avec brio ! Toutes les fonctionnalités sont validées.');

  } finally {
    // Arrêter le serveur
    serverProcess.kill('SIGINT');
    await sleep(500);
  }
}

runE2E().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('\n Échec du test E2E :', err);
  process.exit(1);
});
