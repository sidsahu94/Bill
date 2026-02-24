// frontend/js/navbar.js

(async function () {
  async function loadNavbar() {
    try {
      const placeholder = document.getElementById('navbar-placeholder');
      if (!placeholder) return;

      const res = await fetch('/components/navbar.html?v=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch navbar');
      placeholder.innerHTML = await res.text();

      initMobileDrawer();
      attachAuthHandlers();
      markActiveLink();
    } catch (err) {
      console.error('Failed to load navbar:', err);
    }
  }

  function initMobileDrawer() {
    const openBtn = document.getElementById('mobileMenuOpen');
    const closeBtn = document.getElementById('mobileMenuClose');
    const drawer = document.getElementById('mobileDrawer');
    const overlay = document.getElementById('drawerOverlay');

    if(!openBtn || !drawer) return;

    const openDrawer = () => {
      drawer.classList.add('active');
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden'; // Prevent background scrolling
    };

    const closeDrawer = () => {
      drawer.classList.remove('active');
      overlay.classList.remove('active');
      document.body.style.overflow = '';
    };

    openBtn.addEventListener('click', openDrawer);
    closeBtn.addEventListener('click', closeDrawer);
    overlay.addEventListener('click', closeDrawer);
  }

  function markActiveLink() {
    const currentPath = window.location.pathname || '/';
    document.querySelectorAll('.saas-nav-link').forEach(link => {
      const href = link.getAttribute('href');
      if (href && href !== '/' && currentPath.includes(href)) {
        link.classList.add('active');
      }
    });
  }

  function attachAuthHandlers() {
    // Desktop Elements
    const loginBtn = document.getElementById('navLoginBtn');
    const registerBtn = document.getElementById('navRegisterBtn');
    const usernameSpan = document.getElementById('navUsername');
    const logoutBtn = document.getElementById('navLogoutBtn');

    // Mobile Elements
    const mobLoginBtn = document.getElementById('mobLoginBtn');
    const mobRegisterBtn = document.getElementById('mobRegisterBtn');
    const mobUsernameSpan = document.getElementById('mobUsername');
    const mobLogoutBtn = document.getElementById('mobLogoutBtn');

    function updateAuthUI() {
      const token = localStorage.getItem('token');
      const userName = localStorage.getItem('userName');

      if (token) {
        // Hide auth actions
        if(loginBtn) loginBtn.classList.add('d-none');
        if(registerBtn) registerBtn.classList.add('d-none');
        if(mobLoginBtn) mobLoginBtn.classList.add('d-none');
        if(mobRegisterBtn) mobRegisterBtn.classList.add('d-none');
        
        // Show user details
        if(usernameSpan) { usernameSpan.textContent = userName; usernameSpan.classList.remove('d-none'); }
        if(logoutBtn) logoutBtn.classList.remove('d-none');
        if(mobUsernameSpan) { mobUsernameSpan.textContent = userName; mobUsernameSpan.classList.remove('d-none'); }
        if(mobLogoutBtn) mobLogoutBtn.classList.remove('d-none');
      } else {
        // Reset to logged out state
        if(loginBtn) loginBtn.classList.remove('d-none');
        if(registerBtn) registerBtn.classList.remove('d-none');
        if(mobLoginBtn) mobLoginBtn.classList.remove('d-none');
        if(mobRegisterBtn) mobRegisterBtn.classList.remove('d-none');
        
        if(usernameSpan) usernameSpan.classList.add('d-none');
        if(logoutBtn) logoutBtn.classList.add('d-none');
        if(mobUsernameSpan) mobUsernameSpan.classList.add('d-none');
        if(mobLogoutBtn) mobLogoutBtn.classList.add('d-none');
      }
    }

    const handleLogout = (e) => {
      e.preventDefault();
      localStorage.removeItem('token');
      localStorage.removeItem('userName');
      updateAuthUI();
      window.location.replace('/pages/login.html');
    };

    if(logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if(mobLogoutBtn) mobLogoutBtn.addEventListener('click', handleLogout);

    updateAuthUI();
    window.updateNavbarAuth = updateAuthUI;
  }

  // Cross-tab sync
  window.addEventListener('storage', (ev) => {
    if (ev.key === 'token' || ev.key === 'userName') {
      setTimeout(() => { if (window.updateNavbarAuth) window.updateNavbarAuth(); }, 50);
    }
  });

  window.addEventListener('authChanged', () => {
    if (window.updateNavbarAuth) window.updateNavbarAuth();
  });

  document.addEventListener('DOMContentLoaded', loadNavbar);
})();