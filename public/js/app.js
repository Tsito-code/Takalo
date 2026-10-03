/**
 * Application principale de Messagerie Instantanée Frontend
 * Vanilla JavaScript (sans framework)
 * Gestion de l'état, de Socket.io, du DOM et des événements
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

  // --- Références DOM ---
  const appLayout = document.getElementById('appLayout');
  const currentUserAvatar = document.getElementById('currentUserAvatar');
  const currentUsername = document.getElementById('currentUsername');
  const logoutBtn = document.getElementById('logoutBtn');
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

  // --- Fonctions utilitaires ---

  /**
   * Sécurisation : échappement des chaînes de caractères si nécessaire
   */
  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

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

  /**
   * Formate une date pour le séparateur de discussion (Aujourd'hui, Hier, ou Date)
   */
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
   * Scroll automatique vers le bas de la discussion
   */
  function scrollToBottom(smooth = false) {
    if (!chatMessages) return;
    if (smooth) {
      chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
    } else {
      chatMessages.scrollTop = chatMessages.scrollHeight;
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

  // --- Socket.io ---

  function initSocketConnection() {
    socket = io({
      withCredentials: true,
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      console.log('Connecté au serveur Socket.io');
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
      if (activeContact && (message.receiver_id === activeContact.id || message.sender_id === activeContact.id)) {
        appendMessageBubble(message);
        scrollToBottom(true);
      }
      updateConversationWithNewMessage(message, message.receiver_id);
    });

    // Indicateur d'écriture reçu
    socket.on('user_typing', (data) => {
      if (activeContact && activeContact.id === data.senderId) {
        typingText.textContent = `${data.username} écrit`;
        typingIndicator.style.display = 'block';
        activeContactStatus.textContent = 'est en train d’écrire...';
        activeContactStatus.classList.add('typing');
        scrollToBottom(true);
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
        // Mettre à jour les coches de statut des messages envoyés dans la vue
        document.querySelectorAll('.message-bubble-wrapper.sent .message-status-icon').forEach(icon => {
          icon.classList.add('read');
          icon.innerHTML = getDoubleCheckSvg(true);
        });
      }
    });
  }

  // --- Gestion des messages entrants ---

  function handleIncomingMessage(message) {
    const senderId = message.sender_id;

    // Si la conversation avec cet utilisateur est actuellement ouverte
    if (activeContact && activeContact.id === senderId) {
      appendMessageBubble(message);
      scrollToBottom(true);

      // Marquer automatiquement comme lu auprès du serveur
      socket.emit('mark_read', { senderId });
      fetch(`/api/messages/${senderId}/read`, { method: 'POST' });

      // Mettre à jour l'aperçu sans incrémenter de badge non lu
      updateConversationWithNewMessage(message, senderId, false);
    } else {
      // Si la conversation n'est pas ouverte, incrémenter le badge non-lu
      updateConversationWithNewMessage(message, senderId, true);
    }
  }

  function updateConversationWithNewMessage(message, contactId, incrementUnread = false) {
    let conv = conversationsMap.get(contactId);

    if (conv) {
      conv.last_message = message.content;
      conv.last_message_time = message.created_at;
      conv.last_sender_id = message.sender_id;
      if (incrementUnread) {
        conv.unread_count = (conv.unread_count || 0) + 1;
      }
    } else {
      // Nouvelle conversation non répertoriée
      conv = {
        user_id: contactId,
        username: 'Utilisateur',
        last_message: message.content,
        last_message_time: message.created_at,
        last_sender_id: message.sender_id,
        unread_count: incrementUnread ? 1 : 0
      };
      // Charger le nom d'utilisateur si absent
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

    // Si on est sur l'onglet conversations, réordonner la liste
    if (currentTab === 'conversations') {
      renderConversationsList();
    }
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

    // Reset des badges d'éléments actifs dans la sidebar
    document.querySelectorAll('.conversation-item').forEach(el => el.classList.remove('active'));
    const activeItem = document.querySelector(`.conversation-item[data-user-id="${contact.id}"]`);
    if (activeItem) {
      activeItem.classList.add('active');
      // Effacer le badge non lu localement
      const badge = activeItem.querySelector('.unread-badge');
      if (badge) badge.remove();
    }

    // Réinitialiser le compteur de non lus dans l'état
    const conv = conversationsMap.get(contact.id);
    if (conv) {
      conv.unread_count = 0;
    }

    // Afficher le chat et cacher l'état vide
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

    // Focus sur le champ de saisie
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

    const wrapper = document.createElement('div');
    wrapper.className = `message-bubble-wrapper ${isSent ? 'sent' : 'received'}`;
    wrapper.dataset.msgId = msg.id;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    const textP = document.createElement('p');
    textP.className = 'message-text';
    textP.textContent = msg.content; // textContent empêche toute injection XSS

    const metaDiv = document.createElement('div');
    metaDiv.className = 'message-meta';

    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    timeSpan.textContent = formatTime(msg.created_at);

    metaDiv.appendChild(timeSpan);

    if (isSent) {
      const statusSpan = document.createElement('span');
      statusSpan.innerHTML = getDoubleCheckSvg(Boolean(msg.is_read));
      metaDiv.appendChild(statusSpan);
    }

    bubble.appendChild(textP);
    bubble.appendChild(metaDiv);
    wrapper.appendChild(bubble);

    chatMessages.appendChild(wrapper);
  }

  // --- Envoi de messages & Indicateurs d'écriture ---

  // Gestion de la saisie pour l'indicateur "est en train d'écrire..."
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

  // Soumission du formulaire d'envoi
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

    // Émettre l'événement Socket.io
    socket.emit('send_message', {
      receiverId: activeContact.id,
      content: content
    }, (response) => {
      if (response && response.error) {
        alert(response.error);
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
