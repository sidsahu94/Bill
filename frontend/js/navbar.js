// frontend/js/navbar.js
// Loads navbar HTML, updates auth UI and reacts to storage changes so the Logout button
// appears/disappears reliably (even across tabs).

(async function () {
  async function loadNavbar() {
    try {
      const placeholder = document.getElementById('navbar-placeholder');
      if (!placeholder) {
        console.warn('navbar-placeholder not found in DOM');
        return;
      }

      // cache-bust to ensure latest markup in browser
      const res = await fetch('/components/navbar.html?v=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch navbar component: ' + res.status);
      placeholder.innerHTML = await res.text();

      attachAuthHandlers(); // after HTML is injected
      markActiveLink();
    } catch (err) {
      console.error('Failed to load navbar:', err);
      // minimal fallback so UI is not broken
      const placeholder = document.getElementById('navbar-placeholder');
      if (placeholder) {
        placeholder.innerHTML = `<nav class="navbar navbar-dark bg-primary"><div class="container"><a class="navbar-brand" href="/">💼 Bill</a></div></nav>`;
      }
    }
  }

  function markActiveLink() {
    try {
      const currentPath = window.location.pathname || '/';
      const currentFile = currentPath.split('/').pop() || 'index.html';
      document.querySelectorAll('.nav-link').forEach(link => {
        const href = link.getAttribute('href') || '';
        const linkFile = href.split('/').pop() || href;
        if (linkFile === currentFile || href === currentPath) {
          link.classList.add('active');
          link.setAttribute('aria-current', 'page');
        } else {
          link.classList.remove('active');
          link.removeAttribute('aria-current');
        }
      });
    } catch (e) {
      // ignore
    }
  }

  function attachAuthHandlers() {
    const loginLink = document.getElementById('loginLink');
    const registerLink = document.getElementById('registerLink');
    const navUsername = document.getElementById('nav-username');
    const logoutBtn = document.getElementById('logoutBtn');

    // safe guards
    if (!loginLink || !registerLink || !navUsername || !logoutBtn) {
      // If markup differs, we still want to avoid throwing errors
      return;
    }

    function updateAuthUI() {
      const token = localStorage.getItem('token');
      const userName = localStorage.getItem('userName');

      if (token) {
        loginLink.classList.add('d-none');
        registerLink.classList.add('d-none');

        navUsername.textContent = userName || 'Account';
        navUsername.classList.remove('d-none');

        logoutBtn.classList.remove('d-none');
      } else {
        loginLink.classList.remove('d-none');
        registerLink.classList.remove('d-none');

        navUsername.classList.add('d-none');
        logoutBtn.classList.add('d-none');
      }
    }

    // initial render
    updateAuthUI();

    // attach logout handler (idempotent)
    logoutBtn.onclick = (e) => {
      e.preventDefault();
      // clear auth info
      localStorage.removeItem('token');
      localStorage.removeItem('userName');
      // optionally clear other auth-related keys
      // redirect to login (replace so back doesn't go to protected page)
      window.location.replace('/pages/login.html');
    };

    // expose for other scripts to call directly (optional)
    window.updateNavbarAuth = updateAuthUI;
  }

  // respond to storage events from other tabs/windows
  window.addEventListener('storage', (ev) => {
    if (!ev) return;
    // if token or userName changed in another tab, update auth UI in this tab
    if (ev.key === 'token' || ev.key === 'userName') {
      // small delay to ensure DOM exists if this tab is just opening
      setTimeout(() => {
        if (window.updateNavbarAuth) window.updateNavbarAuth();
      }, 50);
    }
  });

  // Also respond to a custom event (other code can dispatch this after login/logout)
  window.addEventListener('authChanged', () => {
    if (window.updateNavbarAuth) window.updateNavbarAuth();
  });

  // Initial load
  document.addEventListener('DOMContentLoaded', () => {
    loadNavbar();
  });

  // If the script is injected after DOMContentLoaded, still attempt load
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    // small timeout to allow placeholder to exist
    setTimeout(loadNavbar, 10);
  }
})();
