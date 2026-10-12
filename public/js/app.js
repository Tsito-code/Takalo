/**
 * Application principale de Messagerie Instantanée Frontend
 * Vanilla JavaScript (sans framework)
 * Gestion du temps réel (Socket.io), affichage optimiste, suppression de messages,
 * notifications (toast, son Web Audio, notification navigateur) et mise à jour dynamique.
 */

(function () {
  'use strict';

  // --- État de l'application ---
  let currentUser = null;
  let activeContact = null; // { id, username }
  let onlineUserIds = new Set();
  let conversationsMap = new Map(); // contactId => conversationObject
  let currentTab = 'conversations'; // 'conversations' | 'allUsers'
  let socket = null;
  let typingTimer = null;
  let isCurrentlyTyping = false;
  let hasConnectedOnce = false;
  let lastKnownMessageId = 0;
  let soundEnabled = localStorage.getItem('chat_sound_enabled') !== 'false'; // Activé par défaut

  // --- Références DOM ---
  const appLayout = document.getElementById('appLayout');
  const currentUserAvatar = document.getElementById('currentUserAvatar');
  const currentUsername = document.getElementById('currentUsername');
  const logoutBtn = document.getElementById('logoutBtn');
  const soundToggleBtn = document.getElementById('soundToggleBtn');
  const notifPermissionBtn = document.getElementById('notifPermissionBtn');
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const tabConversations = document.getElementById('tabConversations');
  const tabAllUsers = document.getElementById('tabAllUsers');
  const conversationsList = document.getElementById('conversationsList');

  const emptyChatState = document.getElementById('emptyChatState');
  const activeChatWrapper = document.getElementById('activeChatWrapper');
  const backToListBtn = document.getElementById('backToListBtn');
  const activeContactAvatar = document.getElementById('activeContactAvatar');
  const activeContactStatusBadge = document.getElementById('activeContactStatusBadge');
  const activeContactName = document.getElementById('activeContactName');
  const activeContactStatus = document.getElementById('activeContactStatus');
  const chatMessages = document.getElementById('chatMessages');
  const typingIndicator = document.getElementById('typingIndicator');
  const typingText = document.getElementById('typingText');
  const messageForm = document.getElementById('messageForm');
  const messageInput = document.getElementById('messageInput');
  const toastContainer = document.getElementById('toastContainer');

  // --- Fonctions Utilitaires & Audio ---

  /**
   * Obtient les initiales d'un nom d'utilisateur pour l'avatar
   */
  function getInitials(name) {
    if (!name) return '?';
    return name.slice(0, 2).toUpperCase();
  }

  /**
   * Formate une date au format heure locale HH:mm
   */
  function formatTime(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDateKey(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  }

  function formatDateLabel(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const isToday = date.toDateString() === today.toDateString();
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) return "Aujourd'hui";
    if (isYesterday) return 'Hier';
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  /**
   * Vérifie si l'utilisateur est positionné tout en bas du fil de discussion
   */
  function isUserScrolledToBottom() {
    if (!chatMessages) return true;
    const threshold = 60; // Marge de tolérance en pixels
    return (chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight) <= threshold;
  }

  /**
   * Défilement vers le bas de la discussion
   */
  function scrollToBottom(smooth = false) {
    if (!chatMessages) return;
    if (smooth) {
      chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
    } else {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  /**
   * Générateur de signal sonore discret via la Web Audio API (sans fichier externe)
   */
  function playNotificationSound() {
    if (!soundEnabled) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      // Bip doux en deux notes harmonieuses (D5 -> A5)
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(880.00, now + 0.08);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.28);
    } catch (e) {
      // Ignorer si les politiques d'autoplay du navigateur bloquent l'audio
    }
  }

  /**
   * Met à jour le titre de l'onglet du navigateur avec le compteur de non-lus
   */
  function updateTabTitle() {
    let totalUnread = 0;
    conversationsMap.forEach(conv => {
      totalUnread += (conv.unread_count || 0);
    });

    if (totalUnread > 0) {
      document.title = `(${totalUnread}) Messagerie Instantanée`;
    } else {
      document.title = 'Messagerie Instantanée';
    }
  }

  // --- Système de Notifications (Toast, Navigateur) ---

  /**
   * Initialisation des contrôles de notification et son dans le header
   */
  function initNotificationControls() {
    // Bouton de son
    updateSoundButtonUI();
    soundToggleBtn.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      localStorage.setItem('chat_sound_enabled', soundEnabled);
      updateSoundButtonUI();
    });

    // Bouton de permission de notification système
    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        notifPermissionBtn.style.display = 'flex';
        notifPermissionBtn.addEventListener('click', async () => {
          const perm = await Notification.requestPermission();
          if (perm !== 'default') {
            notifPermissionBtn.style.display = 'none';
          }
        });
      } else {
        notifPermissionBtn.style.display = 'none';
      }
    }
  }

  function updateSoundButtonUI() {
    if (soundEnabled) {
      soundToggleBtn.textContent = '🔊';
      soundToggleBtn.title = 'Couper le son des notifications';
    } else {
      soundToggleBtn.textContent = '🔇';
      soundToggleBtn.title = 'Activer le son des notifications';
    }
  }

  /**
   * Affiche une bannière toast en haut de l'écran (empilement max 3)
   */
  function showToastNotification(senderId, senderName, messageText) {
    if (!toastContainer) return;

    // Limiter à maximum 3 notifications visibles simultanément
    const existingToasts = toastContainer.querySelectorAll('.toast-item');
    if (existingToasts.length >= 3) {
      existingToasts[0].remove();
    }

    const toast = document.createElement('div');
    toast.className = 'toast-item';
    toast.role = 'alert';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'toast-content';

    const senderDiv = document.createElement('div');
    senderDiv.className = 'toast-sender';
    senderDiv.textContent = senderName || 'Nouveau message';

    const messageDiv = document.createElement('div');
    messageDiv.className = 'toast-message';
    // Tronquer à environ 60 caractères
    const truncated = messageText.length > 60 ? messageText.slice(0, 60) + '...' : messageText;
    messageDiv.textContent = truncated; // Sécurité XSS garantie avec textContent

    contentDiv.appendChild(senderDiv);
    contentDiv.appendChild(messageDiv);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Fermer';

    toast.appendChild(contentDiv);
    toast.appendChild(closeBtn);

    // Clic sur la notification : ouvrir directement la conversation
    toast.addEventListener('click', (e) => {
      if (e.target === closeBtn) return;
      toast.remove();
      openChat({ id: senderId, username: senderName });
    });

    // Fermeture manuelle
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 200);
    });

    toastContainer.appendChild(toast);

    // Disparition automatique après 4 secondes
    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 200);
      }
    }, 4000);
  }

  /**
   * Déclenche une notification système du navigateur si l'onglet est en arrière-plan
   */
  function triggerBrowserNotification(senderName, messageText) {
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const truncated = messageText.length > 80 ? messageText.slice(0, 80) + '...' : messageText;
        const notif = new Notification(senderName, {
          body: truncated,
          icon: '/favicon.ico',
          tag: 'msg_' + Date.now()
        });
        notif.onclick = () => {
          window.focus();
          notif.close();
        };
      } catch (e) {
        // Ignorer en cas d'erreur de permission contextuelle
      }
    }
  }

  // --- Initialisation & Authentification ---

  async function checkAuthAndInit() {
    try {
      const res = await fetch('/api/auth/me');
      if (!res.ok) {
        window.location.href = '/login.html';
        return;
      }

      const data = await res.json();
      currentUser = data.user;

      // Affichage du profil utilisateur
      currentUsername.textContent = currentUser.username;
      currentUserAvatar.textContent = getInitials(currentUser.username);

      // Initialiser les notifications
      initNotificationControls();

      // Initialiser la connexion Socket.io
      initSocketConnection();

      // Charger les conversations initiales
      await loadConversations();

    } catch (err) {
      console.error('Erreur d’authentification :', err);
      window.location.href = '/login.html';
    }
  }

  // Déconnexion
  logoutBtn.addEventListener('click', async () => {
    if (confirm('Voulez-vous vraiment vous déconnecter ?')) {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (err) {
        console.error('Erreur logout :', err);
      } finally {
        if (socket) socket.disconnect();
        window.location.href = '/login.html';
      }
    }
  });

  // Remise à zéro / synchronisation du titre au focus
  window.addEventListener('focus', () => {
    updateTabTitle();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      updateTabTitle();
    }
  });

  // --- Socket.io & Gestion Réseau ---

  function initSocketConnection() {
    socket = io({
      withCredentials: true,
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      console.log('Connecté au serveur Socket.io');

      // Gestion de la reconnexion automatique : récupérer les messages manqués
      if (hasConnectedOnce && lastKnownMessageId > 0) {
        syncMissedMessages(lastKnownMessageId);
      }
      hasConnectedOnce = true;
    });

    // Réception initiale de tous les utilisateurs en ligne
    socket.on('initial_online_users', (userIds) => {
      onlineUserIds = new Set(userIds);
      updateAllOnlineBadges();
      if (activeContact) {
        updateActiveContactHeaderStatus();
      }
    });

    // Changement de statut d'un utilisateur (en ligne / hors ligne)
    socket.on('user_status_change', (data) => {
      if (data.status === 'online') {
        onlineUserIds.add(data.userId);
      } else {
        onlineUserIds.delete(data.userId);
      }

      updateUserOnlineBadge(data.userId);

      if (activeContact && activeContact.id === data.userId) {
        updateActiveContactHeaderStatus();
      }
    });

    // Réception d'un nouveau message en temps réel
    socket.on('new_message', (message) => {
      handleIncomingMessage(message);
    });

    // Confirmation d'envoi de son propre message
    socket.on('message_sent', (message) => {
      handleMessageConfirmation(message);
    });

    // Suppression d'un message en temps réel
    socket.on('message:deleted', (data) => {
      handleMessageDeleted(data);
    });

    // Indicateur d'écriture reçu
    socket.on('user_typing', (data) => {
      if (activeContact && activeContact.id === data.senderId) {
        typingText.textContent = `${data.username} écrit`;
        typingIndicator.style.display = 'block';
        activeContactStatus.textContent = 'est en train d’écrire...';
        activeContactStatus.classList.add('typing');
        if (isUserScrolledToBottom()) {
          scrollToBottom(true);
        }
      }

      // Indicateur dans la barre latérale
      const convItem = document.querySelector(`.conversation-item[data-user-id="${data.senderId}"]`);
      if (convItem) {
        const preview = convItem.querySelector('.item-preview');
        if (preview) {
          preview.dataset.originalText = preview.dataset.originalText || preview.textContent;
          preview.textContent = 'est en train d’écrire...';
          preview.classList.add('typing-active');
        }
      }
    });

    // Fin de l'écriture
    socket.on('user_stop_typing', (data) => {
      if (activeContact && activeContact.id === data.senderId) {
        typingIndicator.style.display = 'none';
        updateActiveContactHeaderStatus();
      }

      const convItem = document.querySelector(`.conversation-item[data-user-id="${data.senderId}"]`);
      if (convItem) {
        const preview = convItem.querySelector('.item-preview');
        if (preview && preview.dataset.originalText !== undefined) {
          preview.textContent = preview.dataset.originalText;
          preview.classList.remove('typing-active');
        }
      }
    });

    // Confirmation que le destinataire a lu nos messages
    socket.on('messages_read_by_recipient', (data) => {
      if (activeContact && activeContact.id === data.readerId) {
        document.querySelectorAll('.message-bubble-wrapper.sent:not(.deleted) .message-status-icon').forEach(icon => {
          icon.classList.add('read');
          icon.innerHTML = getDoubleCheckSvg(true);
        });
      }
    });
  }

  // --- Récupération des messages manqués lors d'une reconnexion ---

  async function syncMissedMessages(sinceId) {
    try {
      const res = await fetch(`/api/messages/sync?sinceId=${sinceId}`);
      if (!res.ok) return;
      const data = await res.json();
      const missed = data.messages || [];

      missed.forEach(msg => {
        if (msg.sender_id !== currentUser.id) {
          handleIncomingMessage(msg, false); // sans rejouer les sons en rafale
        }
      });

      // Rafraîchir les conversations
      await loadConversations();
    } catch (err) {
      console.error('Erreur synchronisation après reconnexion :', err);
    }
  }

  // --- Gestion des messages entrants ---

  function handleIncomingMessage(message, playAlerts = true) {
    // Éviter les doublons de messages
    if (message.id) {
      lastKnownMessageId = Math.max(lastKnownMessageId, message.id);
      if (document.querySelector(`.message-bubble-wrapper[data-msg-id="${message.id}"]`)) {
        return; // Message déjà présent dans le DOM
      }
    }

    const senderId = message.sender_id;
    const isCurrentChatOpen = activeContact && activeContact.id === senderId;

    if (isCurrentChatOpen) {
      // Défilement automatique vers le bas uniquement si l'utilisateur est déjà en bas
      const wasAtBottom = isUserScrolledToBottom();

      appendMessageBubble(message);

      if (wasAtBottom) {
        scrollToBottom(true);
      }

      // Marquer comme lu
      socket.emit('mark_read', { senderId });
      fetch(`/api/messages/${senderId}/read`, { method: 'POST' });

      // Mettre à jour l'aperçu sans incrémenter le badge
      updateConversationWithNewMessage(message, senderId, false);

      // Si l'onglet est en arrière-plan, notifier le navigateur
      if (playAlerts && document.hidden) {
        triggerBrowserNotification(message.sender_username || 'Nouveau message', message.content || '');
      }
    } else {
      // Conversation fermée ou autre conversation ouverte :
      // 1. Incrémenter le compteur de non-lus
      // 2. Remonter la conversation en haut de liste
      updateConversationWithNewMessage(message, senderId, true);

      // 3. Déclencher les alertes si permis
      if (playAlerts) {
        playNotificationSound();
        showToastNotification(senderId, message.sender_username || 'Utilisateur', message.content || '');
        triggerBrowserNotification(message.sender_username || 'Nouveau message', message.content || '');
      }
    }

    updateTabTitle();
  }

  function handleMessageConfirmation(message) {
    if (message.id) {
      lastKnownMessageId = Math.max(lastKnownMessageId, message.id);
    }

    const targetContactId = message.receiver_id === currentUser.id ? message.sender_id : message.receiver_id;

    if (activeContact && (targetContactId === activeContact.id)) {
      // Si on avait un message optimiste avec tempId
      if (message.tempId) {
        const optimisticBubble = document.querySelector(`.message-bubble-wrapper[data-msg-id="${message.tempId}"]`);
        if (optimisticBubble) {
          optimisticBubble.dataset.msgId = message.id;
          optimisticBubble.classList.remove('optimistic');
          const timeSpan = optimisticBubble.querySelector('.message-time');
          if (timeSpan) timeSpan.textContent = formatTime(message.created_at);

          const statusSpan = optimisticBubble.querySelector('.message-meta span:last-child');
          if (statusSpan) statusSpan.innerHTML = getDoubleCheckSvg(Boolean(message.is_read));

          // Mettre à jour le bouton de suppression avec le vrai ID
          const delBtn = optimisticBubble.querySelector('.message-delete-btn');
          if (delBtn) {
            delBtn.onclick = () => confirmDeleteMessage(message.id);
          }
          return;
        }
      }

      // Si pas encore dans le DOM (ex: second onglet de l'expéditeur)
      if (!document.querySelector(`.message-bubble-wrapper[data-msg-id="${message.id}"]`)) {
        appendMessageBubble(message);
        scrollToBottom(true);
      }
    }

    updateConversationWithNewMessage(message, targetContactId, false);
  }

  // --- Suppression en temps réel ---

  function handleMessageDeleted(data) {
    const messageId = data.id;

    // Rechercher la bulle de message dans la vue active
    const bubbleWrapper = document.querySelector(`.message-bubble-wrapper[data-msg-id="${messageId}"]`);
    if (bubbleWrapper) {
      const bubble = bubbleWrapper.querySelector('.message-bubble');
      if (bubble) {
        bubble.classList.add('deleted');
        const textP = bubble.querySelector('.message-text');
        if (textP) textP.textContent = 'Ce message a été supprimé';

        // Retirer les coches et le bouton de suppression
        const meta = bubble.querySelector('.message-meta');
        if (meta) {
          const statusIcon = meta.querySelector('.message-status-icon');
          if (statusIcon) statusIcon.remove();
        }
        const delBtn = bubbleWrapper.querySelector('.message-delete-btn');
        if (delBtn) delBtn.remove();
      }
    }

    // Mettre à jour l'aperçu de la conversation dans la barre latérale si nécessaire
    const contactId = data.senderId === currentUser.id ? data.receiverId : data.senderId;
    const conv = conversationsMap.get(contactId);
    if (conv) {
      // Recharger les conversations pour rafraîchir le dernier message exact
      loadConversations();
    }
  }

  async function confirmDeleteMessage(messageId) {
    if (!confirm('Voulez-vous vraiment supprimer ce message pour tout le monde ?')) {
      return;
    }

    try {
      if (socket && socket.connected) {
        socket.emit('delete_message', { messageId }, (res) => {
          if (res && res.error) {
            alert(res.error);
          }
        });
      } else {
        const response = await fetch(`/api/messages/${messageId}`, { method: 'DELETE' });
        const result = await response.json();
        if (!response.ok) {
          alert(result.error || 'Erreur lors de la suppression.');
        }
      }
    } catch (err) {
      console.error('Erreur suppression :', err);
      alert('Impossible de contacter le serveur.');
    }
  }

  function updateConversationWithNewMessage(message, contactId, incrementUnread = false) {
    let conv = conversationsMap.get(contactId);

    const displayContent = message.is_deleted ? 'Ce message a été supprimé' : message.content;

    if (conv) {
      conv.last_message = displayContent;
      conv.last_message_time = message.created_at;
      conv.last_sender_id = message.sender_id;
      if (incrementUnread) {
        conv.unread_count = (conv.unread_count || 0) + 1;
      }
    } else {
      conv = {
        user_id: contactId,
        username: message.sender_username || 'Utilisateur',
        last_message: displayContent,
        last_message_time: message.created_at,
        last_sender_id: message.sender_id,
        unread_count: incrementUnread ? 1 : 0
      };
      fetch(`/api/users/${contactId}`)
        .then(r => r.json())
        .then(d => {
          if (d.user) {
            conv.username = d.user.username;
            renderConversationsList();
          }
        });
    }

    conversationsMap.set(contactId, conv);

    if (currentTab === 'conversations') {
      renderConversationsList();
    }
    updateTabTitle();
  }

  // --- Chargement des données REST ---

  async function loadConversations() {
    try {
      const res = await fetch('/api/users/conversations');
      const data = await res.json();
      
      conversationsMap.clear();
      (data.conversations || []).forEach(conv => {
        conversationsMap.set(conv.user_id, conv);
      });

      renderConversationsList();
      updateTabTitle();
    } catch (err) {
      console.error('Erreur chargement conversations :', err);
      conversationsList.innerHTML = '<div class="list-placeholder">Erreur de chargement.</div>';
    }
  }

  async function loadAllUsers() {
    try {
      const res = await fetch('/api/users/search');
      const data = await res.json();
      renderUsersDirectory(data.users || []);
    } catch (err) {
      console.error('Erreur chargement annuaire :', err);
    }
  }

  async function searchUsers(query) {
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      renderUsersDirectory(data.users || [], true);
    } catch (err) {
      console.error('Erreur recherche :', err);
    }
  }

  // --- Rendu de l'interface (Sécurité DOM XSS protégée) ---

  function renderConversationsList() {
    conversationsList.innerHTML = '';

    const list = Array.from(conversationsMap.values());

    if (list.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'list-placeholder';
      emptyDiv.textContent = 'Aucune conversation récente. Utilisez l’annuaire ou la recherche pour démarrer un chat !';
      conversationsList.appendChild(emptyDiv);
      return;
    }

    // Trier les conversations par date décroissante
    list.sort((a, b) => new Date(b.last_message_time || 0) - new Date(a.last_message_time || 0));

    list.forEach(conv => {
      const isOnline = onlineUserIds.has(conv.user_id);
      const isActive = activeContact && activeContact.id === conv.user_id;

      const item = document.createElement('div');
      item.className = `conversation-item ${isActive ? 'active' : ''}`;
      item.dataset.userId = conv.user_id;

      // Avatar
      const avatarDiv = document.createElement('div');
      avatarDiv.className = 'avatar contact-avatar';
      avatarDiv.textContent = getInitials(conv.username);

      const statusBadge = document.createElement('span');
      statusBadge.className = `online-indicator-badge ${isOnline ? 'online' : ''}`;
      avatarDiv.appendChild(statusBadge);

      // Contenu texte
      const contentDiv = document.createElement('div');
      contentDiv.className = 'item-content';

      const topRow = document.createElement('div');
      topRow.className = 'item-top';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'item-name';
      nameSpan.textContent = conv.username;

      const timeSpan = document.createElement('span');
      timeSpan.className = 'item-time';
      timeSpan.textContent = formatTime(conv.last_message_time);

      topRow.appendChild(nameSpan);
      topRow.appendChild(timeSpan);

      const bottomRow = document.createElement('div');
      bottomRow.className = 'item-bottom';

      const previewSpan = document.createElement('span');
      previewSpan.className = 'item-preview';
      previewSpan.textContent = conv.last_message || 'Nouvelle discussion';

      bottomRow.appendChild(previewSpan);

      if (conv.unread_count > 0) {
        const badge = document.createElement('span');
        badge.className = 'unread-badge';
        badge.textContent = conv.unread_count > 99 ? '99+' : conv.unread_count;
        bottomRow.appendChild(badge);
      }

      contentDiv.appendChild(topRow);
      contentDiv.appendChild(bottomRow);

      item.appendChild(avatarDiv);
      item.appendChild(contentDiv);

      item.addEventListener('click', () => {
        openChat({ id: conv.user_id, username: conv.username });
      });

      conversationsList.appendChild(item);
    });
  }

  function renderUsersDirectory(users, isSearch = false) {
    conversationsList.innerHTML = '';

    if (users.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'list-placeholder';
      emptyDiv.textContent = isSearch ? 'Aucun utilisateur trouvé.' : 'Aucun autre utilisateur inscrit pour le moment.';
      conversationsList.appendChild(emptyDiv);
      return;
    }

    users.forEach(user => {
      const isOnline = onlineUserIds.has(user.id);
      const isActive = activeContact && activeContact.id === user.id;

      const item = document.createElement('div');
      item.className = `conversation-item ${isActive ? 'active' : ''}`;
      item.dataset.userId = user.id;

      const avatarDiv = document.createElement('div');
      avatarDiv.className = 'avatar contact-avatar';
      avatarDiv.textContent = getInitials(user.username);

      const statusBadge = document.createElement('span');
      statusBadge.className = `online-indicator-badge ${isOnline ? 'online' : ''}`;
      avatarDiv.appendChild(statusBadge);

      const contentDiv = document.createElement('div');
      contentDiv.className = 'item-content';

      const topRow = document.createElement('div');
      topRow.className = 'item-top';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'item-name';
      nameSpan.textContent = user.username;

      topRow.appendChild(nameSpan);

      const bottomRow = document.createElement('div');
      bottomRow.className = 'item-bottom';

      const statusSpan = document.createElement('span');
      statusSpan.className = 'item-preview';
      statusSpan.textContent = isOnline ? 'En ligne' : 'Hors ligne';

      bottomRow.appendChild(statusSpan);

      contentDiv.appendChild(topRow);
      contentDiv.appendChild(bottomRow);

      item.appendChild(avatarDiv);
      item.appendChild(contentDiv);

      item.addEventListener('click', () => {
        openChat({ id: user.id, username: user.username });
      });

      conversationsList.appendChild(item);
    });
  }

  function updateUserOnlineBadge(userId) {
    const isOnline = onlineUserIds.has(userId);
    const badges = document.querySelectorAll(`.conversation-item[data-user-id="${userId}"] .online-indicator-badge`);
    badges.forEach(b => {
      if (isOnline) {
        b.classList.add('online');
      } else {
        b.classList.remove('online');
      }
    });
  }

  function updateAllOnlineBadges() {
    document.querySelectorAll('.conversation-item').forEach(item => {
      const uid = parseInt(item.dataset.userId, 10);
      const isOnline = onlineUserIds.has(uid);
      const badge = item.querySelector('.online-indicator-badge');
      if (badge) {
        if (isOnline) badge.classList.add('online');
        else badge.classList.remove('online');
      }
    });
  }

  function updateActiveContactHeaderStatus() {
    if (!activeContact) return;
    const isOnline = onlineUserIds.has(activeContact.id);

    activeContactStatus.classList.remove('typing');
    activeContactStatus.textContent = isOnline ? 'En ligne' : 'Hors ligne';

    if (isOnline) {
      activeContactStatusBadge.classList.add('online');
    } else {
      activeContactStatusBadge.classList.remove('online');
    }
  }

  // --- Gestion de la discussion active ---

  async function openChat(contact) {
    activeContact = contact;

    // Reset des classes actives dans la sidebar
    document.querySelectorAll('.conversation-item').forEach(el => el.classList.remove('active'));
    const activeItem = document.querySelector(`.conversation-item[data-user-id="${contact.id}"]`);
    if (activeItem) {
      activeItem.classList.add('active');
      const badge = activeItem.querySelector('.unread-badge');
      if (badge) badge.remove();
    }

    // Réinitialiser le compteur de non lus dans l'état
    const conv = conversationsMap.get(contact.id);
    if (conv) {
      conv.unread_count = 0;
    }
    updateTabTitle();

    // Afficher le chat et masquer l'état vide
    emptyChatState.style.display = 'none';
    activeChatWrapper.style.display = 'flex';

    // Sur mobile : basculer l'affichage pour afficher le chat
    appLayout.classList.add('chat-open');

    // Mettre à jour l'en-tête du contact
    activeContactName.textContent = contact.username;
    activeContactAvatar.querySelector('span:first-child').textContent = getInitials(contact.username);
    updateActiveContactHeaderStatus();

    // Vider les messages précédents et afficher un placeholder
    chatMessages.innerHTML = '<div class="list-placeholder">Chargement de l’historique...</div>';
    typingIndicator.style.display = 'none';

    try {
      // Récupérer l'historique complet des messages
      const res = await fetch(`/api/messages/${contact.id}`);
      const data = await res.json();

      chatMessages.innerHTML = '';

      if (!data.messages || data.messages.length === 0) {
        const welcome = document.createElement('div');
        welcome.className = 'list-placeholder';
        welcome.textContent = `C'est le début de votre conversation avec ${contact.username}. Dites bonjour ! 👋`;
        chatMessages.appendChild(welcome);
      } else {
        let lastDateKey = null;

        data.messages.forEach(msg => {
          if (msg.id) {
            lastKnownMessageId = Math.max(lastKnownMessageId, msg.id);
          }
          const msgDateKey = formatDateKey(msg.created_at);
          if (msgDateKey && msgDateKey !== lastDateKey) {
            appendDateDivider(msg.created_at);
            lastDateKey = msgDateKey;
          }
          appendMessageBubble(msg);
        });
      }

      scrollToBottom();

      // Marquer les messages reçus comme lus
      socket.emit('mark_read', { senderId: contact.id });
      await fetch(`/api/messages/${contact.id}/read`, { method: 'POST' });

    } catch (err) {
      console.error('Erreur chargement messages :', err);
      chatMessages.innerHTML = '<div class="list-placeholder">Erreur lors du chargement des messages.</div>';
    }

    messageInput.focus();
  }

  function appendDateDivider(dateString) {
    const div = document.createElement('div');
    div.className = 'date-divider';
    div.textContent = formatDateLabel(dateString);
    chatMessages.appendChild(div);
  }

  function getDoubleCheckSvg(isRead) {
    const colorClass = isRead ? 'read' : '';
    return `
      <svg class="message-status-icon ${colorClass}" width="16" height="11" viewBox="0 0 16 11" fill="none">
        <path d="M1 5.5L4.5 9L11 1.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M5 5.5L8.5 9L15 1.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

  function appendMessageBubble(msg) {
    const isSent = msg.sender_id === currentUser.id;
    const isDeleted = Boolean(msg.is_deleted);
    const isOptimistic = Boolean(msg.is_optimistic);

    const wrapper = document.createElement('div');
    wrapper.className = `message-bubble-wrapper ${isSent ? 'sent' : 'received'} ${isOptimistic ? 'optimistic' : ''}`;
    wrapper.dataset.msgId = msg.id;

    const row = document.createElement('div');
    row.className = 'message-row';

    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${isDeleted ? 'deleted' : ''}`;

    const textP = document.createElement('p');
    textP.className = 'message-text';
    textP.textContent = isDeleted ? 'Ce message a été supprimé' : msg.content; // 100% protégé XSS

    const metaDiv = document.createElement('div');
    metaDiv.className = 'message-meta';

    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    timeSpan.textContent = formatTime(msg.created_at);

    metaDiv.appendChild(timeSpan);

    if (isSent && !isDeleted) {
      const statusSpan = document.createElement('span');
      if (isOptimistic) {
        statusSpan.className = 'optimistic-indicator';
        statusSpan.textContent = '🕒';
      } else {
        statusSpan.innerHTML = getDoubleCheckSvg(Boolean(msg.is_read));
      }
      metaDiv.appendChild(statusSpan);
    }

    bubble.appendChild(textP);
    bubble.appendChild(metaDiv);
    row.appendChild(bubble);

    // Bouton de suppression : uniquement sur MES messages non supprimés
    if (isSent && !isDeleted) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'message-delete-btn';
      delBtn.title = 'Supprimer ce message';
      delBtn.setAttribute('aria-label', 'Supprimer ce message');
      delBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      `;
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        confirmDeleteMessage(msg.id);
      });
      row.appendChild(delBtn);

      // Support mobile (appui long / touch)
      let touchTimer = null;
      wrapper.addEventListener('touchstart', () => {
        touchTimer = setTimeout(() => {
          wrapper.classList.toggle('show-actions');
        }, 400);
      }, { passive: true });
      wrapper.addEventListener('touchend', () => {
        clearTimeout(touchTimer);
      });
    }

    wrapper.appendChild(row);
    chatMessages.appendChild(wrapper);
  }

  // --- Envoi de messages & Indicateurs d'écriture ---

  messageInput.addEventListener('input', () => {
    if (!activeContact || !socket) return;

    if (!isCurrentlyTyping) {
      isCurrentlyTyping = true;
      socket.emit('typing_start', { receiverId: activeContact.id });
    }

    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      isCurrentlyTyping = false;
      socket.emit('typing_stop', { receiverId: activeContact.id });
    }, 1500);
  });

  messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!activeContact || !socket) return;

    const content = messageInput.value.trim();
    if (!content) return;

    // Arrêter immédiatement l'indicateur d'écriture
    clearTimeout(typingTimer);
    if (isCurrentlyTyping) {
      isCurrentlyTyping = false;
      socket.emit('typing_stop', { receiverId: activeContact.id });
    }

    // Réinitialiser le champ texte
    messageInput.value = '';

    // 1. Affichage optimiste instantané
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const optimisticMsg = {
      id: tempId,
      tempId: tempId,
      sender_id: currentUser.id,
      receiver_id: activeContact.id,
      content: content,
      is_read: 0,
      is_deleted: 0,
      is_optimistic: true,
      created_at: new Date().toISOString()
    };

    appendMessageBubble(optimisticMsg);
    scrollToBottom(true);
    updateConversationWithNewMessage(optimisticMsg, activeContact.id, false);

    // 2. Émission via Socket.io avec callback de confirmation
    socket.emit('send_message', {
      receiverId: activeContact.id,
      content: content,
      tempId: tempId
    }, (response) => {
      if (response && response.error) {
        alert(response.error);
        const optBubble = document.querySelector(`.message-bubble-wrapper[data-msg-id="${tempId}"]`);
        if (optBubble) optBubble.remove();
      } else if (response && response.message) {
        handleMessageConfirmation(response.message);
      }
    });
  });

  // Retour à la liste sur mobile
  backToListBtn.addEventListener('click', () => {
    appLayout.classList.remove('chat-open');
    activeContact = null;
    document.querySelectorAll('.conversation-item').forEach(el => el.classList.remove('active'));
  });

  // --- Recherche & Onglets Barre Latérale ---

  tabConversations.addEventListener('click', () => {
    currentTab = 'conversations';
    tabConversations.classList.add('active');
    tabAllUsers.classList.remove('active');
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    renderConversationsList();
  });

  tabAllUsers.addEventListener('click', () => {
    currentTab = 'allUsers';
    tabAllUsers.classList.add('active');
    tabConversations.classList.remove('active');
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    loadAllUsers();
  });

  let searchTimeout = null;
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();

    if (query.length > 0) {
      clearSearchBtn.style.display = 'block';
    } else {
      clearSearchBtn.style.display = 'none';
    }

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      if (query.length === 0) {
        if (currentTab === 'conversations') {
          renderConversationsList();
        } else {
          loadAllUsers();
        }
      } else {
        searchUsers(query);
      }
    }, 250);
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    if (currentTab === 'conversations') {
      renderConversationsList();
    } else {
      loadAllUsers();
    }
    searchInput.focus();
  });

  // Démarrer l'application au chargement
  checkAuthAndInit();
})();
