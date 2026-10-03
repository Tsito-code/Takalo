/**
 * Gestionnaire du thème clair / sombre (persistance localStorage + bascule automatique)
 */

(function () {
  const THEME_STORAGE_KEY = 'chat_app_theme';

  function getPreferredTheme() {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') {
      return saved;
    }
    // Détection de la préférence du système d'exploitation
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);

    // Mettre à jour l'icône et le texte des boutons de changement de thème
    document.querySelectorAll('.theme-toggle-btn').forEach((btn) => {
      if (theme === 'dark') {
        btn.innerHTML = '☀️ <span>Clair</span>';
        btn.setAttribute('title', 'Passer au mode clair');
      } else {
        btn.innerHTML = '🌙 <span>Sombre</span>';
        btn.setAttribute('title', 'Passer au mode sombre');
      }
    });
  }

  // Application immédiate avant le rendu pour éviter les flashs blancs
  const currentTheme = getPreferredTheme();
  applyTheme(currentTheme);

  // Initialisation des écouteurs d'événements une fois le DOM chargé
  window.addEventListener('DOMContentLoaded', () => {
    applyTheme(getPreferredTheme());

    document.querySelectorAll('.theme-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const active = document.documentElement.getAttribute('data-theme') || 'light';
        const nextTheme = active === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme);
      });
    });
  });

  // Export global pour utilisation dans d'autres scripts si besoin
  window.AppTheme = {
    applyTheme,
    getPreferredTheme
  };
})();
