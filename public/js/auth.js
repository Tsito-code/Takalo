/**
 * Logique frontend de la page d'authentification (Connexion & Inscription)
 */

document.addEventListener('DOMContentLoaded', async () => {
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const authForm = document.getElementById('authForm');
  const authSubtitle = document.getElementById('authSubtitle');
  const submitBtn = document.getElementById('submitBtn');
  const btnText = document.getElementById('btnText');
  const alertBox = document.getElementById('alertBox');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');

  let mode = 'login'; // 'login' | 'register'

  // Vérifier si l'utilisateur est déjà connecté
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        window.location.href = '/index.html';
        return;
      }
    }
  } catch (err) {
    // Non connecté ou erreur réseau, on reste sur la page de connexion
  }

  function showAlert(message, type = 'error') {
    alertBox.textContent = message;
    alertBox.className = `alert-box ${type}`;
  }

  function hideAlert() {
    alertBox.style.display = 'none';
    alertBox.className = 'alert-box';
    alertBox.textContent = '';
  }

  function setMode(newMode) {
    mode = newMode;
    hideAlert();

    if (mode === 'login') {
      tabLogin.classList.add('active');
      tabLogin.setAttribute('aria-selected', 'true');
      tabRegister.classList.remove('active');
      tabRegister.setAttribute('aria-selected', 'false');

      authSubtitle.textContent = 'Connectez-vous pour échanger en direct';
      btnText.textContent = 'Se connecter';
      passwordInput.setAttribute('autocomplete', 'current-password');
    } else {
      tabRegister.classList.add('active');
      tabRegister.setAttribute('aria-selected', 'true');
      tabLogin.classList.remove('active');
      tabLogin.setAttribute('aria-selected', 'false');

      authSubtitle.textContent = 'Créez votre compte en quelques secondes';
      btnText.textContent = 'Créer mon compte';
      passwordInput.setAttribute('autocomplete', 'new-password');
    }
    usernameInput.focus();
  }

  tabLogin.addEventListener('click', () => setMode('login'));
  tabRegister.addEventListener('click', () => setMode('register'));

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      showAlert('Veuillez remplir tous les champs.');
      return;
    }

    if (username.length < 3 || username.length > 20) {
      showAlert('Le nom d’utilisateur doit faire entre 3 et 20 caractères.');
      return;
    }

    if (password.length < 6) {
      showAlert('Le mot de passe doit comporter au moins 6 caractères.');
      return;
    }

    // Désactivation temporaire du bouton pendant la requête
    submitBtn.disabled = true;
    const initialBtnText = btnText.textContent;
    btnText.textContent = 'Chargement...';

    const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Une erreur est survenue.');
      }

      showAlert(
        mode === 'login' ? 'Connexion réussie ! Redirection...' : 'Compte créé avec succès ! Redirection...',
        'success'
      );

      // Redirection vers le chat
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 500);

    } catch (err) {
      showAlert(err.message, 'error');
      submitBtn.disabled = false;
      btnText.textContent = initialBtnText;
    }
  });
});
